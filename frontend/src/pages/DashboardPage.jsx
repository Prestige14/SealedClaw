import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Shield, Wallet, Cpu, ArrowRightLeft, AlertTriangle, CreditCard,
  CheckCircle, Activity, ArrowDownCircle, RefreshCw, BarChart3, Loader2, Layers,
  Swords, Target, Rocket, Settings2, ShieldCheck, History
} from 'lucide-react';

import AgentCard from '../components/AgentCard';
import OraclePriceFeed from '../components/OraclePriceFeed';
import PolicyControl from '../components/PolicyControl';
import ExecutionHistory from '../components/ExecutionHistory';

// ── CONFIGURATION (Updated with Adapters) ──────────────────────────────────
const AGENT_ADDRESS    = "0x30ff3D6cF8bf67adeC982A938EF65F627A0e4f76";
const VAULT_ADDRESS    = "0x6f5eF739ff6121Ffecfe75A9e9f6B37Bc462d0Dc";
const STRATEGY_ADDRESS = "0x9e316259eD91aD427D2e7FE97A5082baAFD422A4";
const DEX_ADAPTER      = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53"; 

const AGENT_ABI = [
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function totalMinted() external view returns (uint256)"
];

const VAULT_ABI = [
  "function deposit(uint256 tokenId) external payable",
  "function withdraw(uint256 tokenId, uint256 amount) external",
  "function getVaultBalance(uint256 tokenId) external view returns (uint256)",
  "function getNonce(uint256 tokenId) external view returns (uint256)",
  "function pendingTransfers(uint256 tokenId) external view returns (address newOwner, uint256 transferInitiatedAt)",
  "function getPolicy(uint256 tokenId) external view returns (tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit))",
  "function updatePolicy(uint256 tokenId, tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit) newPolicy) external"
];

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
  const [ownedTokens, setOwnedTokens] = useState([]);
  const [agentDetails, setAgentDetails] = useState(null);
  const [vaultBalance, setVaultBalance] = useState(0n);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });

  const [policy, setPolicy] = useState({
    maxDrawdown: '1000',
    riskMaxPercent: '500',
    dailyLimit: '1.0',
  });

  const showStatus = (msg, type = 'info') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 5000);
  };

  const fetchOwnedTokens = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const agent = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);
      const total = Number(await agent.totalMinted());
      const tokens = [];
      for (let i = 0; i < total; i++) {
        try {
          const owner = await agent.ownerOf(i);
          if (owner.toLowerCase() === account.toLowerCase()) tokens.push(i.toString());
        } catch (e) {}
      }
      setOwnedTokens(tokens);
      if (tokens.length > 0 && !tokenId) setTokenId(tokens[0]);
    } catch (err) {
      console.error(err);
    }
  }, [account, tokenId]);

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

      setAgentDetails({ owner, nonce: Number(nonce), isPending: pt.transferInitiatedAt > 0n });
      setVaultBalance(balance);
      setPolicy({
        maxDrawdown: p.maxDrawdown.toString(),
        riskMaxPercent: p.riskMaxPercent.toString(),
        dailyLimit: ethers.formatEther(p.dailyLimit)
      });
    } catch (err) {
      console.error(err);
    }
  }, [account, tokenId]);

  useEffect(() => {
    fetchOwnedTokens();
  }, [account, fetchOwnedTokens]);

  useEffect(() => {
    updateDashboard();
  }, [tokenId, updateDashboard]);

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

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-2">Command Center</h1>
          <p className="text-gray-500 font-medium uppercase tracking-widest text-xs flex items-center gap-2">
            <Activity size={14} className="text-primary" /> Sector Galileo // System Nominal
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
            
            <div className="grid grid-cols-1 gap-4">
              {ownedTokens.map(id => (
                <div key={id} onClick={() => setTokenId(id)} className="cursor-pointer">
                  <AgentCard 
                    tokenId={id} 
                    owner={agentDetails?.owner} 
                    nonce={agentDetails?.nonce} 
                    isActive={tokenId === id}
                    isPending={agentDetails?.isPending}
                  />
                </div>
              ))}
              {ownedTokens.length === 0 && <div className="glass-card p-10 text-center text-gray-600 border-dashed border-white/10">No agents detected.</div>}
            </div>
          </section>

          <OraclePriceFeed />
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
                  <div className="flex gap-2">
                    {['0.1', '0.5', '1.0', '5.0'].map(val => (
                      <button 
                        key={val} 
                        onClick={() => depositFunds(val)}
                        className="flex-1 py-3 rounded-xl bg-white/5 border border-white/5 text-xs font-bold hover:bg-white/10 hover:border-white/20 transition-all"
                      >
                        {val} 0G
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 uppercase font-bold text-center tracking-widest">Instant allocation to enclave vault</p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <ExecutionHistory />
              
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
