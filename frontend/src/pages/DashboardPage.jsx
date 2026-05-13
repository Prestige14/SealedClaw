import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Shield, Wallet, Cpu, ArrowRightLeft, AlertTriangle, CreditCard,
  CheckCircle, Activity, ArrowDownCircle, RefreshCw, BarChart3, Loader2, Layers,
  Swords, Target, Rocket, Settings2, ShieldCheck, History, Clock
} from 'lucide-react';

import AgentCard from '../components/AgentCard';
import OraclePriceFeed from '../components/OraclePriceFeed';
import PolicyControl from '../components/PolicyControl';
import ExecutionHistory from '../components/ExecutionHistory';
import { CONFIG } from '../config';

// ── CONFIGURATION (Updated with Adapters) ──────────────────────────────────
const AGENT_ADDRESS    = CONFIG.AGENT_ADDRESS;
const VAULT_ADDRESS    = CONFIG.VAULT_ADDRESS;
const STRATEGY_ADDRESS = CONFIG.STRATEGY_ADDRESS;
const DEX_ADAPTER      = CONFIG.DEX_ADAPTER;

const AGENT_ABI = [
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function totalMinted() external view returns (uint256)",
  "function mintAgent(string memory metadataCID) external payable"
];

const VAULT_ABI = [
  "function deposit(uint256 tokenId) external payable",
  "function withdraw(uint256 tokenId, uint256 amount) external",
  "function getVaultBalance(uint256 tokenId) external view returns (uint256)",
  "function getNonce(uint256 tokenId) external view returns (uint256)",
  "function pendingTransfers(uint256 tokenId) external view returns (address newOwner, uint256 transferInitiatedAt)",
  "function getPolicy(uint256 tokenId) external view returns (tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit))",
  "function updatePolicy(uint256 tokenId, tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit) newPolicy) external",
  "function initiateTransfer(uint256 tokenId, address newOwner) external",
  "function finalizeTransfer(uint256 tokenId) external",
  "function TRANSFER_COOLDOWN() view returns (uint256)"
];

const MARKETPLACE_ABI = [
  "function listAgent(uint256 tokenId, uint256 price) external",
  "function listings(uint256 tokenId) external view returns (address seller, uint256 price, bool isActive)"
];

const ERC721_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)"
];

const STRATEGY_ABI = [
  "function getStrategy(uint256 tokenId) external view returns (tuple(uint8 strategyClass, uint256 customBuyThresholdBps, uint256 customReduceThresholdBps, uint256 customBuySizeBps, uint256 committedAt, bool committed))"
];

const STRATEGY_NAMES = ["Safe Guardian", "Yield Sniper", "Balanced Merc", "Moon Chaser", "Custom"];
const STRATEGY_EMOJIS = ["🛡️", "🎯", "⚔️", "🚀", "⚙️"];

const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // Example for Galileo/Testnet WETH
const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];

const fmt = (wei) => {
  if (wei === undefined || wei === null) return '0.0000';
  try {
    return parseFloat(ethers.formatEther(BigInt(wei))).toFixed(4);
  } catch {
    return '0.0000';
  }
};

export default function DashboardPage({ account }) {
  const [tokenId, setTokenId] = useState('');
  const [ownedTokens, setOwnedTokens] = useState([]); // Array of { id, roleName, roleEmoji }
  const [agentDetails, setAgentDetails] = useState(null);
  const [vaultBalance, setVaultBalance] = useState(0n);
  const [tokenBalances, setTokenBalances] = useState([]); // { name, value }
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });

  const [policy, setPolicy] = useState({
    maxDrawdown: '1000',
    riskMaxPercent: '500',
    dailyLimit: '1.0',
  });

  const [listPrice, setListPrice] = useState('10.0');
  const [isListed, setIsListed] = useState(false);
  const [handoverAddress, setHandoverAddress] = useState('');
  const [pendingHandover, setPendingHandover] = useState(null); // { newOwner, unlocksAt }
  const [agentRole, setAgentRole] = useState({ name: 'Unassigned', emoji: '🤖' });
  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [customDeposit, setCustomDeposit] = useState('0.1');
  const [agentLiveState, setAgentLiveState] = useState({ status: 'IDLE', last_thought: 'System Ready.' });

  // Poll Agent API for real-time thought process
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch(`${CONFIG.AGENT_API_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          setAgentLiveState(data);
        }
      } catch (e) {
        console.warn("Agent API not reachable.");
      }
    };
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const showStatus = (msg, type = 'info') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 5000);
  };

  const fetchOwnedTokens = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      
      // Verify Network
      if (Number(network.chainId) !== 16661) {
        console.warn("Not on 0G Aristotle Mainnet. ChainID:", network.chainId);
        return;
      }

      const agent = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);
      const sm = new ethers.Contract(CONFIG.STRATEGY_ADDRESS, STRATEGY_ABI, provider);
      const total = Number(await agent.totalMinted());
      
      const tokens = [];
      for (let i = 0; i < total; i++) {
        try {
          const owner = await agent.ownerOf(i);
          if (owner.toLowerCase() === account.toLowerCase()) {
            const s = await sm.getStrategy(i);
            tokens.push({
              id: i.toString(),
              roleName: s.committed ? STRATEGY_NAMES[s.strategyClass] : "Unassigned",
              roleEmoji: s.committed ? STRATEGY_EMOJIS[s.strategyClass] : "🤖"
            });
          }
        } catch (e) {}
      }
      
      setOwnedTokens(tokens);
      if (tokens.length > 0 && !tokenId) setTokenId(tokens[0].id);
    } catch (err) {
      console.error("fetchOwnedTokens error:", err);
    }
  }, [account, tokenId]);

  const mintNewAgent = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const agent = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, signer);
      
      showStatus("Minting your SealedClaw Agent...", "info");
      // Use a generic CID for now (Phase 3 would use 0G Storage CID)
      const tx = await agent.mintAgent("bafkreidv6p6c6z6c6z6c6z6c6z6c6z6c6z6c6z6c6z", { value: 0 });
      await tx.wait();
      showStatus("Agent Minted Successfully!", "success");
      fetchOwnedTokens();
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const updateDashboard = useCallback(async () => {
    if (!account || !tokenId) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
      const agent = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);

      const owner = await agent.ownerOf(tokenId);
      const nonce = await vault.getNonce(tokenId);
      const pt = await vault.pendingTransfers(tokenId);
      const balance = await vault.getVaultBalance(tokenId);
      const p = await vault.getPolicy(tokenId);
      const cooldown = await vault.TRANSFER_COOLDOWN();

      const mkt = new ethers.Contract(CONFIG.AGENT_MARKETPLACE, MARKETPLACE_ABI, provider);
      const listing = await mkt.listings(tokenId);

      // 4. Token Detection (Real & Virtual)
      // Since we use SimpleTestAdapter to hold the "position", we read the adapter's balance
      let vEthBal = 0n;
      try {
        vEthBal = await provider.getBalance(DEX_ADAPTER);
      } catch (e) {
        console.warn("Failed to fetch adapter balance:", e);
      }

      setAgentDetails({ owner, nonce: Number(nonce), isPending: pt.transferInitiatedAt > 0n });
      setVaultBalance(balance);
      setTokenBalances([
        { name: 'Wrapped OG', value: vEthBal }
      ]);
      setIsListed(listing.isActive);
      
      const currentRole = ownedTokens.find(t => t.id === tokenId);
      if (currentRole) setAgentRole({ name: currentRole.roleName, emoji: currentRole.roleEmoji });
      
      if (pt.transferInitiatedAt > 0n) {
        setPendingHandover({
          newOwner: pt.newOwner,
          unlocksAt: Number(pt.transferInitiatedAt) + Number(cooldown)
        });
      } else {
        setPendingHandover(null);
      }

      setPolicy({
        maxDrawdown: p.maxDrawdown.toString(),
        riskMaxPercent: p.riskMaxPercent.toString(),
        dailyLimit: ethers.formatEther(p.dailyLimit)
      });
    } catch (err) {
      console.error(err);
    }
  }, [account, tokenId]);

  const listOnMarketplace = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const agent = new ethers.Contract(AGENT_ADDRESS, ERC721_ABI, signer);
      const mkt = new ethers.Contract(CONFIG.AGENT_MARKETPLACE, MARKETPLACE_ABI, signer);

      const isApproved = await agent.isApprovedForAll(account, CONFIG.AGENT_MARKETPLACE);
      if (!isApproved) {
        showStatus("Approving Marketplace...", "info");
        const txApprove = await agent.setApprovalForAll(CONFIG.AGENT_MARKETPLACE, true);
        await txApprove.wait();
      }

      showStatus("Listing Agent...", "info");
      const txList = await mkt.listAgent(tokenId, ethers.parseEther(listPrice));
      await txList.wait();
      showStatus("Agent listed successfully!", "success");
      updateDashboard();
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const initiateHandover = async () => {
    if (!ethers.isAddress(handoverAddress)) return showStatus("Invalid Ethereum address", "error");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      
      showStatus("Initiating Secure Handover...", "info");
      const tx = await vault.initiateTransfer(tokenId, handoverAddress);
      await tx.wait();
      showStatus("Handover Protocol Initiated (48h Cooldown Active)", "success");
      updateDashboard();
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const finalizeHandover = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      
      showStatus("Finalizing Handover...", "info");
      const tx = await vault.finalizeTransfer(tokenId);
      await tx.wait();
      showStatus("Agent Transferred Successfully!", "success");
      fetchOwnedTokens();
      setTokenId('');
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOwnedTokens();
  }, [account, fetchOwnedTokens]);

  useEffect(() => {
    updateDashboard();
  }, [tokenId, updateDashboard]);

  // Auto-refresh dashboard data every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      updateDashboard();
    }, 10000);
    return () => clearInterval(interval);
  }, [updateDashboard]);

  const depositFunds = async (amount) => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const tx = await vault.deposit(tokenId, { value: ethers.parseEther(amount) });
      showStatus("Depositing funds...", "info");
      await tx.wait();
      showStatus("Deposit successful!", "success");
      updateDashboard();
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const withdrawFunds = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      
      showStatus("Withdrawing from Enclave...", "info");
      const tx = await vault.withdraw(tokenId, ethers.parseEther(withdrawAmount));
      await tx.wait();
      showStatus("Withdrawal Successful!", "success");
      updateDashboard();
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const savePolicy = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const newPolicy = {
        maxDrawdown: BigInt(policy.maxDrawdown),
        riskMaxPercent: BigInt(policy.riskMaxPercent),
        allowedTokens: [],
        allowedDEXs: [DEX_ADAPTER],
        dailyLimit: ethers.parseEther(policy.dailyLimit)
      };
      const tx = await vault.updatePolicy(tokenId, newPolicy);
      showStatus("Updating policy...", "info");
      await tx.wait();
      showStatus("Policy updated!", "success");
      updateDashboard();
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  if (!account) return <div className="text-center py-20 text-gray-500">Please connect your wallet.</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-10 animate-fadeIn">
      {/* Toast */}
      {status.msg && (
        <div className={`fixed bottom-10 right-10 z-[100] glass-card px-6 py-4 border ${status.type === 'error' ? 'border-red-500/50 text-red-400' : 'border-primary/50 text-primary'} flex items-center gap-3 animate-fadeIn`}>
          {status.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
          <p className="text-sm font-bold">{status.msg}</p>
        </div>
      )}

      {/* Agent Live Status Bar */}
      <div className="glass-card p-4 border-primary/20 bg-primary/5 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-4">
          <div className={`w-2 h-2 rounded-full ${agentLiveState.status === 'THINKING' ? 'bg-amber-500' : (agentLiveState.status === 'IDLE' ? 'bg-green-500' : 'bg-primary')} shadow-[0_0_10px_rgba(59,130,246,0.5)]`}></div>
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Agent Neural Link: {agentLiveState.status}</p>
            <p className="text-xs text-white/80 font-medium italic">"{agentLiveState.last_thought}"</p>
          </div>
        </div>
        {agentLiveState.status === 'THINKING' && <Loader2 size={16} className="text-amber-500 animate-spin" />}
      </div>

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-2">Command Center</h1>
          <p className="text-gray-500 font-medium uppercase tracking-widest text-xs flex items-center gap-2">
            <Activity size={14} className="text-primary" /> Sector Aristotle // System Nominal
          </p>
        </div>
        <div className="flex gap-4">
          <div className="glass-card px-8 py-4 border-white/5 bg-white/5">
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Allocated</p>
             <p className="text-2xl font-mono font-black text-white">{fmt(vaultBalance)} <span className="text-primary text-sm italic">0G</span></p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Agents & Stats */}
        <div className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Layers size={16} className="text-primary" /> Active Enclaves
              </h2>
              <button onClick={fetchOwnedTokens} className="text-gray-600 hover:text-white transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
            
            <div className="space-y-4">
              {ownedTokens.map(t => (
                <div 
                  key={t.id}
                  onClick={() => setTokenId(t.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    tokenId === t.id ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' : 'bg-white/5 border-white/5 hover:border-white/10'
                  }`}
                >
                   <AgentCard 
                     tokenId={t.id} 
                     owner={account} 
                     nonce={tokenId === t.id ? agentDetails?.nonce : "?"} 
                     isActive={tokenId === t.id}
                     roleName={t.roleName}
                     roleEmoji={t.roleEmoji}
                   />
                </div>
              ))}
              {ownedTokens.length === 0 && (
                <div className="glass-card p-10 text-center border-dashed border-white/10 space-y-6">
                  <p className="text-gray-500 text-sm italic">No agents detected in your neural link.</p>
                  <button 
                    onClick={mintNewAgent}
                    disabled={loading}
                    className="px-6 py-3 bg-primary text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-primary/80 transition-all flex items-center gap-2 mx-auto"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                    Initialize New Agent
                  </button>
                </div>
              )}
            </div>
          </section>

          <OraclePriceFeed />

          {/* Allocation Chart */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" /> Portfolio Allocation
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {(() => {
                    const COLORS = { '0G Native': '#3b82f6', 'Wrapped OG': '#f59e0b' };
                    const chartData = [
                      { name: '0G Native', value: Number(ethers.formatEther(vaultBalance)) },
                      { name: 'Wrapped OG', value: Number(ethers.formatEther(tokenBalances.find(t => t.name === 'Wrapped OG')?.value || 0n)) },
                    ].filter(d => d.value > 0);
                    return (
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      >
                        {chartData.map((entry) => (
                          <Cell key={entry.name} fill={COLORS[entry.name] || '#8b5cf6'} />
                        ))}
                      </Pie>
                    );
                  })()}
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value, name) => [`${value.toFixed(4)}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4 flex-wrap">
              {[
                { name: '0G Native', color: 'bg-blue-500', value: Number(ethers.formatEther(vaultBalance)) },
                { name: 'Wrapped OG', color: 'bg-amber-500', value: Number(ethers.formatEther(tokenBalances.find(t => t.name === 'Wrapped OG')?.value || 0n)) },
              ].filter(d => d.value > 0).map(({ name, color }) => (
                <div key={name} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color}`}></div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Control & History */}
        <div className="lg:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-8">
               <PolicyControl 
                policy={policy} 
                setPolicy={setPolicy} 
                savePolicy={savePolicy} 
                loading={loading} 
              />
              
              <div className="glass-card p-8">
                <div className="flex items-center gap-3 mb-6">
                  <ArrowDownCircle size={24} className="text-secondary" />
                  <h2 className="text-xl font-bold text-white">Quick Fund</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Deposit Amount (0G)</label>
                    <input 
                      type="number" 
                      value={customDeposit} 
                      onChange={(e) => setCustomDeposit(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary/50 transition-colors"
                      placeholder="0.0"
                    />
                  </div>
                  <button 
                    onClick={() => depositFunds(customDeposit)}
                    disabled={loading || !tokenId}
                    className="w-full py-4 rounded-xl bg-primary text-black font-black uppercase tracking-widest text-[10px] hover:bg-primary/80 transition-all disabled:opacity-30"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Confirm Deposit'}
                  </button>
                  <p className="text-[10px] text-gray-600 uppercase font-bold text-center tracking-widest">Instant allocation to enclave vault</p>
                </div>
              </div>

              {/* Withdraw Assets */}
              <div className="glass-card p-8 border-red-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <ArrowDownCircle size={24} className="text-red-400" />
                  <h2 className="text-xl font-bold text-white">Withdraw Assets</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Withdraw Amount (0G)</label>
                       <button 
                        onClick={() => setWithdrawAmount(ethers.formatEther(vaultBalance))}
                        className="text-[10px] font-black text-primary hover:text-primary/80 uppercase"
                       >
                         Max Balance
                       </button>
                    </div>
                    <input 
                      type="number" 
                      value={withdrawAmount} 
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-red-500/50 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={withdrawFunds}
                    disabled={loading || !tokenId}
                    className="w-full py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black uppercase tracking-widest text-[10px] hover:bg-red-500/20 transition-all disabled:opacity-30"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Process Withdrawal'}
                  </button>
                </div>
              </div>

              {/* Withdraw Positions from Adapter */}
              <div className="glass-card p-8 border-amber-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <ArrowDownCircle size={24} className="text-amber-400" />
                  <h2 className="text-xl font-bold text-white">Withdraw Positions</h2>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] text-gray-500 uppercase font-medium leading-relaxed">
                    Withdraw funds that are currently held in the "Position" (DEX Adapter) back to your wallet.
                  </p>
                  <button 
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const provider = new ethers.BrowserProvider(window.ethereum);
                        const signer = await provider.getSigner();
                        const abi = ["function withdrawAll() external"];
                        const adapter = new ethers.Contract(DEX_ADAPTER, abi, signer);
                        showStatus("Withdrawing positions...", "info");
                        const tx = await adapter.withdrawAll();
                        await tx.wait();
                        showStatus("Positions withdrawn successfully!", "success");
                        updateDashboard();
                      } catch (e) {
                        showStatus(e.message, "error");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || tokenBalances.find(t => t.name === 'Wrapped OG')?.value === 0n}
                    className="w-full py-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black uppercase tracking-widest text-[10px] hover:bg-amber-500/20 transition-all disabled:opacity-30"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Withdraw All Positions'}
                  </button>
                </div>
              </div>

              {/* Marketplace Listing */}
              <div className="glass-card p-8 border-accent/20">
                <div className="flex items-center gap-3 mb-6">
                  <Rocket size={24} className="text-accent" />
                  <h2 className="text-xl font-bold text-white">Marketplace Listing</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Listing Price (0G)</label>
                    <input 
                      type="number" 
                      value={listPrice} 
                      onChange={(e) => setListPrice(e.target.value)}
                      disabled={isListed}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={listOnMarketplace}
                    disabled={loading || isListed}
                    className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${
                      isListed ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-accent hover:bg-accent/80 text-black'
                    }`}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : (isListed ? 'Successfully Listed' : 'Confirm Listing')}
                  </button>
                </div>
              </div>

              {/* Secure Handover Protocol */}
              <div className="glass-card p-8 border-primary/20">
                <div className="flex items-center gap-3 mb-6">
                  <ShieldCheck size={24} className="text-primary" />
                  <h2 className="text-xl font-bold text-white">Secure Handover</h2>
                </div>
                
                {!pendingHandover ? (
                  <div className="space-y-4">
                    <p className="text-[10px] text-gray-500 uppercase font-medium leading-relaxed">
                      Initiate a 2-step security transfer. Agent will enter <span className="text-primary">REDUCE-ONLY</span> mode for 48 hours.
                    </p>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Recipient Address</label>
                      <input 
                        type="text" 
                        placeholder="0x..."
                        value={handoverAddress}
                        onChange={(e) => setHandoverAddress(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                    <button 
                      onClick={initiateHandover}
                      disabled={loading || !handoverAddress}
                      className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Initiate Handover'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                      <div className="flex items-center justify-between mb-3">
                         <span className="text-[10px] font-black text-primary uppercase">Status: Cooldown</span>
                         <Clock size={14} className="text-primary animate-pulse" />
                      </div>
                      <p className="text-xs text-white/80 font-medium mb-1">Unlocks in:</p>
                      <p className="text-2xl font-mono font-black text-white">
                        {pendingHandover.unlocksAt > Math.floor(Date.now()/1000) 
                          ? Math.floor((pendingHandover.unlocksAt - Math.floor(Date.now()/1000)) / 3600) + " Hours"
                          : "Ready to Finalize"}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                       <p className="text-[10px] text-gray-500 uppercase font-bold">New Owner Candidate:</p>
                       <p className="text-xs font-mono text-white/60 truncate">{pendingHandover.newOwner}</p>
                    </div>

                    <button 
                      onClick={finalizeHandover}
                      disabled={loading || (pendingHandover.unlocksAt > Math.floor(Date.now()/1000))}
                      className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                        pendingHandover.unlocksAt <= Math.floor(Date.now()/1000) 
                          ? 'bg-primary text-black hover:bg-primary/80' 
                          : 'bg-white/5 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Finalize & Send iNFT'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-8">
              <ExecutionHistory tokenId={tokenId} />
              
              {/* Coming Soon Feature */}
              <div className="glass-card p-8 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/20 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                <h3 className="text-lg font-black text-white mb-2 italic">Neural Strategy v4</h3>
                <p className="text-gray-400 text-xs mb-4">Integrate 0G Storage historical analysis for predictive risk mitigation. Verifiable on-chain ML arriving soon.</p>
                <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  In Development
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
