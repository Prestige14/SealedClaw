import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Shield, Wallet, Cpu, ArrowRightLeft, AlertTriangle, CreditCard,
  CheckCircle, Activity, ArrowDownCircle, RefreshCw, BarChart3, Loader2, Layers,
  Swords, Target, Rocket, Settings2, ShieldCheck
} from 'lucide-react';

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const AGENT_ADDRESS    = "0x30ff3D6cF8bf67adeC982A938EF65F627A0e4f76";
const VAULT_ADDRESS    = "0x6f5eF739ff6121Ffecfe75A9e9f6B37Bc462d0Dc";
const STRATEGY_ADDRESS = "0x9e316259eD91aD427D2e7FE97A5082baAFD422A4";
const DEX_ADDRESS      = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
const GALILEO_CHAIN_ID = '0x40da';

const AGENT_ABI = [
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "event AgentMinted(uint256 indexed tokenId, address indexed owner, string metadataCID)",
  "function totalMinted() external view returns (uint256)"
];

const VAULT_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function balances(address user) external view returns (uint256)",
  "function deposit(uint256 tokenId) external payable",
  "function withdraw(uint256 tokenId, uint256 amount) external",
  "function getVaultBalance(uint256 tokenId) external view returns (uint256)",
  "function getNonce(uint256 tokenId) external view returns (uint256)",
  "function initiateTransfer(uint256 tokenId, address newOwner) external",
  "function pendingTransfers(uint256 tokenId) external view returns (address newOwner, uint256 transferInitiatedAt)",
  "function getPolicy(uint256 tokenId) external view returns (tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit))",
  "function updatePolicy(uint256 tokenId, tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit) newPolicy) external"
];

const STRATEGY_ABI = [
  "function getResolvedParams(uint256 tokenId) external view returns (uint256 buyThresholdBps, uint256 reduceThresholdBps, uint256 buySizeBps, uint8 strategyClassId)",
  "function commitStrategy(uint256 tokenId, uint8 strategyClass) external"
];

const DEX_ABI = [
  "function getVirtualBalance(uint256 tokenId, string calldata asset) external view returns (uint256)",
  "function getNativeSwapped(uint256 tokenId) external view returns (uint256)"
];

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#14b8a6', '#8b5cf6'];

const STRATEGY_EMOJIS = {
  0: '🛡️ Safe Guardian',
  1: '🎯 Yield Sniper',
  2: '⚔️ Balanced Merc',
  3: '🚀 Moon Chaser',
  4: '⚙️ Custom',
};

const fmt = (wei) => {
  if (wei === undefined || wei === null) return '0.0000';
  if (typeof wei === 'number') return wei.toFixed(4);
  try {
    const bi = BigInt(wei);
    if (bi === 0n) return '0.0000';
    return parseFloat(ethers.formatEther(bi)).toFixed(4);
  } catch {
    return parseFloat(String(wei)).toFixed(4);
  }
};

const shortenAddr = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900/95 border border-blue-500/30 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md z-50">
        <p className="text-blue-300 font-semibold text-sm">{payload[0].name}</p>
        <p className="text-white font-mono text-base">
          {Number(payload[0].value).toFixed(4)} 
          {payload[0].payload.name === 'Virtual vETH' ? ' vETH' : ' 0G'}
        </p>
      </div>
    );
  }
  return null;
};

// ── APP ───────────────────────────────────────────────────────────────────────
export default function DashboardPage({ account }) {
  const [loading, setLoading]               = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [status, setStatus]                 = useState({ type: '', msg: '' });
  const [depositAmount, setDepositAmount]   = useState('0.1');
  const [withdrawAmount, setWithdrawAmount] = useState('0.05');
  const [newOwner, setNewOwner]             = useState('');
  const [tokenId, setTokenId]               = useState('');
  const [agentDetails, setAgentDetails]     = useState(null);
  
  // Strategy state
  const [strategyParams, setStrategyParams] = useState(null);

  // Risk Policy state
  const [policy, setPolicy] = useState({
    maxDrawdown: '1000',
    riskMaxPercent: '500',
    dailyLimit: '1.0',
  });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);

  // Strategy Edit
  const [isEditingStrategy, setIsEditingStrategy] = useState(false);
  const [newStrategyClass, setNewStrategyClass] = useState(2);

  // Portfolio state (all in BigInt wei)
  const [vaultNativeBalance, setVaultNativeBalance] = useState(0n);
  const [tokenVaultBalance, setTokenVaultBalance]   = useState(0n);
  const [userLegacyBalance, setUserLegacyBalance]   = useState(0n);
  
  // Virtual Asset Portfolio
  const [virtualPortfolio, setVirtualPortfolio] = useState({ vETH: 0n, nativeSwapped: 0n });

  const [ownedTokens, setOwnedTokens]       = useState([]);
  const [tokensLoading, setTokensLoading]   = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [contractCaps, setContractCaps] = useState({
    hasTokenDeposit:  true,
    hasTokenWithdraw: true,
    hasVaultBalance:  true,
    probed:           true,
  });

  const probeContractCaps = useCallback(async () => {
    // Legacy support logic removed. V2 contracts are guaranteed to support Token IDs natively.
    setContractCaps({
      hasTokenDeposit:  true,
      hasTokenWithdraw: true,
      hasVaultBalance:  true,
      probed:           true,
    });
  }, []);

  const showStatus = (msg, type = 'info') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 7000);
  };

  const updateAgentStatus = useCallback(async () => {
    if (!account || !tokenId) {
      setAgentDetails(null);
      setStrategyParams(null);
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
      const agent    = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);
      const strat    = new ethers.Contract(STRATEGY_ADDRESS, STRATEGY_ABI, provider);

      const owner   = await agent.ownerOf(tokenId).catch(() => null);
      const nonce   = await vault.getNonce(tokenId).catch(() => 0n);

      let isPending   = false;
      let targetOwner = ethers.ZeroAddress;
      try {
        const pt = await vault.pendingTransfers(tokenId);
        const ptOwner = pt.newOwner ?? pt[0];
        const ptTime  = pt.transferInitiatedAt ?? pt[1];
        isPending   = ptOwner !== ethers.ZeroAddress && BigInt(ptTime) > 0n;
        targetOwner = ptOwner;
      } catch {
        isPending   = false;
        targetOwner = ethers.ZeroAddress;
      }

      setAgentDetails({ owner, nonce: Number(nonce), isPending, targetOwner });
      
      // Fetch Strategy
      try {
        const params = await strat.getResolvedParams(tokenId);
        setStrategyParams({
          buyThresholdBps: Number(params.buyThresholdBps),
          reduceThresholdBps: Number(params.reduceThresholdBps),
          buySizeBps: Number(params.buySizeBps),
          classId: Number(params.strategyClassId)
        });
      } catch (e) {
        console.warn("Strategy fetch failed:", e);
      }

    } catch (err) {
      console.error('Agent status update failed:', err);
    }
  }, [account, tokenId]);

  const updatePortfolio = useCallback(async () => {
    if (!account) return;
    setPortfolioLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
      const dex      = new ethers.Contract(DEX_ADDRESS, DEX_ABI, provider);

      const nativeBal = await provider.getBalance(VAULT_ADDRESS).catch(() => 0n);

      let tokenBal = 0n;
      if (contractCaps.hasVaultBalance && tokenId) {
        try { tokenBal = await vault.getVaultBalance(tokenId); } catch { tokenBal = 0n; }
      }

      let legacyBal = 0n;
      try { legacyBal = await vault.balances(account); } catch { legacyBal = 0n; }

      setVaultNativeBalance(nativeBal);
      setTokenVaultBalance(tokenBal);
      setUserLegacyBalance(legacyBal);
      
      // Virtual assets from MockDEX
      if (tokenId) {
        try {
          const vETH = await dex.getVirtualBalance(tokenId, "ETH");
          const nativeSwappedAmt = await dex.getNativeSwapped(tokenId);
          setVirtualPortfolio({ vETH, nativeSwapped: nativeSwappedAmt });
        } catch (e) {
          console.warn("Virtual balance fetch failed:", e);
          setVirtualPortfolio({ vETH: 0n, nativeSwapped: 0n });
        }
      } else {
        setVirtualPortfolio({ vETH: 0n, nativeSwapped: 0n });
      }

    } catch (err) {
      console.warn('Portfolio update failed:', err.message ?? err);
    } finally {
      setPortfolioLoading(false);
    }
  }, [account, tokenId, contractCaps]);

  const fetchPolicy = useCallback(async () => {
    if (!account || !tokenId || !contractCaps.probed) return;
    setPolicyLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
      
      const p = await vault.getPolicy(tokenId);
      setPolicy({
        maxDrawdown: p.maxDrawdown.toString(),
        riskMaxPercent: p.riskMaxPercent.toString(),
        dailyLimit: ethers.formatEther(p.dailyLimit),
      });
    } catch (err) {
      console.warn('fetchPolicy failed:', err);
    } finally {
      setPolicyLoading(false);
    }
  }, [account, tokenId, contractCaps]);

  useEffect(() => {
    if (account && tokenId) {
      updateAgentStatus();
      updatePortfolio();
      fetchPolicy();
    }
  }, [account, tokenId, updateAgentStatus, updatePortfolio, fetchPolicy]);

  const fetchOwnedTokens = useCallback(async () => {
    if (!account) return;
    setTokensLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const agent    = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);

      // Loop over total minted to avoid JSON-RPC queryFilter errors on Galileo Testnet
      let totalNum = 0;
      try {
        const total = await agent.totalMinted();
        totalNum = Number(total);
      } catch (e) {
        console.warn('Could not fetch totalMinted', e);
      }

      const verified = [];
      for (let i = 0; i < totalNum; i++) {
        try {
          const owner = await agent.ownerOf(i);
          if (owner.toLowerCase() === account.toLowerCase()) {
            verified.push({ tokenId: i.toString() });
          }
        } catch (e) { }
      }

      setOwnedTokens(verified);

      setTokenId((curr) => {
        if (verified.length > 0 && (!curr || !verified.some(t => t.tokenId === curr))) {
          return verified[0].tokenId;
        }
        return curr;
      });

    } catch (err) {
      console.error('fetchOwnedTokens failed:', err);
    } finally {
      setTokensLoading(false);
      setInitialLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (account) {
      probeContractCaps();
      updateAgentStatus();
      fetchOwnedTokens();
    }
  }, [account]);

  useEffect(() => {
    if (account && contractCaps.probed) {
      updatePortfolio();
    }
  }, [account, tokenId, contractCaps.probed, contractCaps.hasVaultBalance, updatePortfolio]);

  const handleAction = async (fn) => {
    setLoading(true);
    try {
      await fn();
      await updateAgentStatus();
      await updatePortfolio();
    } catch (err) {
      showStatus(err.reason || err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const depositFunds = () => handleAction(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const valueWei = { value: ethers.parseEther(depositAmount.toString()) };

    if (contractCaps.hasTokenDeposit) {
      const ABI = ["function deposit(uint256 tokenId) external payable"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Sending deposit to vault…', 'info');
      const tx = await c.deposit(BigInt(tokenId), valueWei);
      await tx.wait();
      showStatus(`✓ Deposited ${depositAmount} 0G to Token #${tokenId}`, 'success');
    } else {
      const ABI = ["function deposit() external payable"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Sending deposit (legacy mode)…', 'info');
      const tx = await c.deposit(valueWei);
      await tx.wait();
      showStatus(`✓ Deposited ${depositAmount} 0G to vault`, 'success');
    }
  });

  const withdrawFunds = () => handleAction(async () => {
    const amountWei = ethers.parseEther(withdrawAmount.toString());

    const availableBalance = contractCaps.hasTokenWithdraw ? tokenVaultBalance : userLegacyBalance;
    if (amountWei > availableBalance) {
      throw new Error(`Insufficient balance. Max: ${fmt(availableBalance)} 0G`);
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();

    if (contractCaps.hasTokenWithdraw) {
      const ABI = ["function withdraw(uint256 tokenId, uint256 amount) external"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Processing withdrawal…', 'info');
      const tx = await c.withdraw(BigInt(tokenId), amountWei);
      await tx.wait();
      showStatus(`✓ Withdrawn ${withdrawAmount} 0G from Token #${tokenId}`, 'success');
    } else {
      const ABI = ["function withdraw(uint256 amount) external"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Processing withdrawal (legacy mode)…', 'info');
      const tx = await c.withdraw(amountWei);
      await tx.wait();
      showStatus(`✓ Withdrawn ${withdrawAmount} 0G from vault`, 'success');
    }
  });

  const startHandover = () => handleAction(async () => {
    if (!newOwner) throw new Error("Please specify a target owner address.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);

    showStatus("Initiating Handover Protocol…", "info");
    const tx = await contract.initiateTransfer(BigInt(tokenId), newOwner);
    await tx.wait();
    showStatus("Handover active! Agent restricted to Reduce-Only.", "success");
  });

  const savePolicy = () => handleAction(async () => {
    if (!tokenId) return;
    setUpdatingPolicy(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);

      const newPolicy = {
        maxDrawdown: BigInt(policy.maxDrawdown),
        riskMaxPercent: BigInt(policy.riskMaxPercent),
        allowedTokens: [], 
        allowedDEXs: [DEX_ADDRESS], 
        dailyLimit: ethers.parseEther(policy.dailyLimit),
      };

      showStatus("Updating Risk Policy...", "info");
      const tx = await vault.updatePolicy(tokenId, newPolicy);
      await tx.wait();
      showStatus("Risk Policy updated successfully!", "success");
      await fetchPolicy();
    } finally {
      setUpdatingPolicy(false);
    }
  });

  const updateStrategyClass = () => handleAction(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const strat = new ethers.Contract(STRATEGY_ADDRESS, STRATEGY_ABI, signer);

    showStatus("Updating Strategy Class...", "info");
    const tx = await strat.commitStrategy(tokenId, newStrategyClass);
    await tx.wait();
    showStatus("Strategy Class updated!", "success");
    setIsEditingStrategy(false);
  });

  // ── Pie chart data ────────────────────────────────────────────────────────
  const unswapped0G = contractCaps.hasVaultBalance 
        ? tokenVaultBalance 
        : userLegacyBalance;

  const pieData = [
    { name: 'Unallocated 0G', value: unswapped0G > 0n ? unswapped0G : 0n },
    { name: 'Virtual vETH',   value: virtualPortfolio.vETH },
  ].filter(d => d.value > 0n);

  const totalPortfolioValue = (unswapped0G > 0n ? unswapped0G : 0n) + virtualPortfolio.vETH;
  const hasPortfolioData = pieData.length > 0;
  const withdrawableBalance = contractCaps.hasTokenWithdraw ? tokenVaultBalance : userLegacyBalance;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  if (!account) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] animate-fadeIn">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Wallet size={32} className="text-blue-500/50" />
          </div>
          <h2 className="text-2xl font-black text-white px-2">Ready to Enter the Arena?</h2>
          <p className="text-gray-400 max-w-xs mx-auto">Connect your wallet to access your trading agents and manage your portfolio.</p>
        </div>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] animate-fadeIn gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
          <ShieldCheck size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400" />
        </div>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Enclave Data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 animate-fadeIn">

      {/* ── Toast ── */}
      {status.msg && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border
          backdrop-blur-md transition-all duration-300
          ${status.type === 'error'
            ? 'bg-red-950/90 border-red-500/60 text-red-300'
            : 'bg-teal-950/90 border-teal-500/60 text-teal-300'}`}
        >
          {status.type === 'error'
            ? <AlertTriangle size={20} className="shrink-0" />
            : <CheckCircle size={20} className="shrink-0" />}
          <p className="font-medium text-white text-sm max-w-xs">{status.msg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ══════════════ LEFT SIDEBAR ══════════════ */}
        <aside className="lg:col-span-1 space-y-6">

          {/* Agent Health & Strategy */}
          <div className="glass-card p-6 overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex items-center gap-3 mb-5 text-blue-400 relative z-10">
              <Activity size={22} />
              <h2 className="text-lg font-bold">Agent Status</h2>
            </div>
            
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
                <span className="text-gray-400 text-sm">Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase
                  ${!tokenId 
                    ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    : agentDetails?.isPending
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]'}`}
                >
                  {!tokenId ? '—' : agentDetails?.isPending ? 'REDUCE-ONLY' : '● ACTIVE'}
                </span>
              </div>

              {strategyParams && (
                <div className="p-4 bg-gradient-to-br from-purple-900/40 to-blue-900/20 rounded-xl border border-purple-500/30">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-purple-400">Committed Strategy</div>
                    {!isEditingStrategy && !agentDetails?.isPending && (
                      <button 
                        onClick={() => { setIsEditingStrategy(true); setNewStrategyClass(strategyParams.classId); }} 
                        className="text-[10px] text-purple-300 hover:text-white underline"
                      >
                        Change Class
                      </button>
                    )}
                  </div>

                  {isEditingStrategy ? (
                    <div className="space-y-3 mt-2">
                      <select 
                        value={newStrategyClass} 
                        onChange={(e) => setNewStrategyClass(Number(e.target.value))}
                        className="w-full bg-black/50 border border-purple-500/50 rounded-lg p-2 text-white text-sm outline-none"
                      >
                        {Object.entries(STRATEGY_EMOJIS).filter(([k]) => k !== '4').map(([key, name]) => (
                          <option key={key} value={key}>{name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setIsEditingStrategy(false)} 
                          className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={updateStrategyClass} 
                          disabled={loading}
                          className="flex-1 py-1.5 rounded-lg bg-purple-600/30 border border-purple-500/50 text-xs text-white hover:bg-purple-600/50 font-bold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-lg font-black text-white mb-3">
                        {STRATEGY_EMOJIS[strategyParams.classId]}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Buy (bps)</div>
                          <div className="text-sm font-bold text-green-400">{strategyParams.buyThresholdBps}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Reduce (bps)</div>
                          <div className="text-sm font-bold text-red-400">{strategyParams.reduceThresholdBps}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Size (bps)</div>
                          <div className="text-sm font-bold text-blue-400">{strategyParams.buySizeBps}</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">On-Chain Nonce</span>
                <span className="text-white font-mono font-bold">{tokenId && agentDetails ? agentDetails.nonce : '—'}</span>
              </div>
            </div>
          </div>

          {/* ── iNFT Collection ── */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-purple-400">
                <Layers size={20} />
                <h2 className="text-sm font-bold">My Active Agents</h2>
              </div>
              <button
                id="refresh-tokens-btn"
                onClick={fetchOwnedTokens}
                disabled={!account || tokensLoading}
                className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
              >
                {tokensLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
              </button>
            </div>

            {!account ? (
              <p className="text-gray-600 text-xs text-center py-4">Connect wallet</p>
            ) : tokensLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={24} className="animate-spin text-purple-400" />
              </div>
            ) : ownedTokens.length === 0 ? (
              <div className="text-center py-4">
                <Cpu size={28} className="text-gray-700 mx-auto mb-2" />
                <p className="text-gray-600 text-xs text-center px-4">No agents owned.<br/>Go to Mint to summon your first agent.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ownedTokens.map((t) => (
                  <button
                    key={t.tokenId}
                    id={`token-select-${t.tokenId}`}
                    onClick={() => setTokenId(t.tokenId)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                      ${ tokenId === t.tokenId
                        ? 'bg-purple-600/20 border-purple-500/50 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                        : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:border-white/10'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                      ${ tokenId === t.tokenId ? 'bg-purple-500/30' : 'bg-gray-800'}`}>
                      <Cpu size={16} className={tokenId === t.tokenId ? 'text-purple-300' : 'text-gray-500'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold font-mono">Agent #{t.tokenId}</p>
                    </div>
                    {tokenId === t.tokenId && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(7ade80,0.8)]"></div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

        </aside>

        {/* ══════════════ MAIN AREA ══════════════ */}
        <main className="lg:col-span-2 space-y-8">

          {/* ── REAL PORTFOLIO DASHBOARD ── */}
          <section className="glass-card p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[80px] pointer-events-none"></div>

            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-3 text-blue-400">
                <BarChart3 size={24} />
                <h2 className="text-2xl font-black text-white px-2 tracking-wide">Dynamic Portfolio</h2>
              </div>
              <button
                id="refresh-portfolio-btn"
                onClick={updatePortfolio}
                disabled={!account || portfolioLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm hover:bg-blue-600/30 transition-all disabled:opacity-40"
              >
                {portfolioLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
              {[
                { label: 'Total Value', value: fmt(totalPortfolioValue), color: 'text-white' },
                { label: 'Unallocated 0G', value: fmt(unswapped0G), color: 'text-blue-400' },
                { label: 'Virtual vETH', value: fmt(virtualPortfolio.vETH), color: 'text-orange-400' },
                { label: 'Vault TVL (All)', value: fmt(vaultNativeBalance), color: 'text-gray-500 text-sm' },
              ].map((stat) => (
                <div key={stat.label} className="bg-black/40 rounded-2xl p-5 border border-white/5">
                  <p className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-2">{stat.label}</p>
                  <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Live PieChart */}
            {!tokenId ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-gray-600 gap-3 border border-dashed border-white/5 rounded-3xl bg-black/20">
                <BarChart3 size={36} />
                <p className="text-sm">Select an Agent to view its portfolio breakdown</p>
              </div>
            ) : portfolioLoading ? (
              <div className="flex items-center justify-center h-52">
                <div className="flex flex-col items-center gap-3 text-blue-400">
                  <Loader2 size={36} className="animate-spin" />
                  <p className="text-sm">Fetching DEX data…</p>
                </div>
              </div>
            ) : hasPortfolioData ? (
              <div className="bg-black/30 rounded-3xl border border-white/5 p-6">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData.map(d => ({ ...d, value: Number(ethers.formatEther(d.value)) }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell 
                          key={index} 
                          fill={entry.name.includes('vETH') ? '#f59e0b' : '#3b82f6'} 
                          stroke="transparent" 
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={10}
                      formatter={(value) => <span className="text-gray-300 font-medium ml-2 text-sm">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-gray-600 gap-3 border border-dashed border-white/5 rounded-3xl bg-black/20">
                <BarChart3 size={36} />
                <p className="text-sm font-medium">Portfolio Empty</p>
                <p className="text-xs text-gray-700">Deposit funds to allocate capital to this agent.</p>
              </div>
            )}
          </section>

          {/* ── POLICY + DEPOSIT ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            <section className="glass-card p-8">
               <div className="flex items-center gap-3 text-cyan-400 mb-6">
                 <CreditCard size={24} />
                 <h2 className="text-xl font-bold text-white">Deposit Capital</h2>
               </div>
               <p className="text-gray-400 text-sm mb-6">Deposit 0G directly to Agent #{tokenId}'s vault balance for trading.</p>
               <div className="space-y-4">
                 <div className="relative">
                   <div className="absolute left-4 top-4 text-cyan-500/50">0G</div>
                   <input
                     type="number"
                     step="0.1"
                     value={depositAmount}
                     onChange={(e) => setDepositAmount(e.target.value)}
                     className="w-full bg-black/60 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none font-mono text-lg"
                   />
                 </div>
                 <button
                   onClick={depositFunds}
                   disabled={loading || !tokenId}
                   className="w-full py-4 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-400 font-bold tracking-wider hover:bg-cyan-600/30 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                 >
                   {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowDownCircle size={18} className="rotate-180" />}
                   Deposit
                 </button>
               </div>
            </section>

            <section className="glass-card p-8">
               <div className="flex items-center gap-3 text-red-500 mb-4">
                 <ArrowDownCircle size={24} />
                 <h2 className="text-xl font-bold text-white">Withdraw Capital</h2>
               </div>
               <div className="flex justify-between items-center bg-black/30 p-4 rounded-xl border border-red-500/10 mb-5">
                 <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Available</span>
                 <span className="text-lg font-mono text-white tracking-widest">{fmt(withdrawableBalance)} <span className="text-red-400 text-sm">0G</span></span>
               </div>
               <div className="space-y-4">
                 <div className="relative flex">
                   <input
                     type="number"
                     step="0.1"
                     value={withdrawAmount}
                     onChange={(e) => setWithdrawAmount(e.target.value)}
                     className="flex-1 bg-black/60 border border-white/5 rounded-l-2xl px-5 py-4 text-white focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 outline-none font-mono text-lg"
                   />
                   <button 
                     className="bg-black/40 border border-y-white/5 border-r-white/5 px-4 text-red-400 text-xs font-bold hover:bg-black/20"
                     onClick={() => setWithdrawAmount(fmt(withdrawableBalance))}
                   >MAX</button>
                 </div>
                 <button
                   onClick={withdrawFunds}
                   disabled={loading || !tokenId || withdrawableBalance === 0n}
                   className="w-full py-4 rounded-2xl bg-red-600/10 border border-red-500/30 text-red-400 font-bold tracking-wider hover:bg-red-600/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                 >
                   {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowDownCircle size={18} />}
                   Emergency Withdraw
                 </button>
               </div>
            </section>

          </div>

          <section className="glass-card p-8 border-orange-500/20">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="text-orange-400" size={24} />
              <h2 className="text-xl font-bold">Dynamic Limit Controls</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider block mb-2">Max Drawdown (bps)</label>
                <input
                  type="number"
                  value={policy.maxDrawdown}
                  onChange={(e) => setPolicy({ ...policy, maxDrawdown: e.target.value })}
                  className="w-full bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider block mb-2">Max Risk Limit (bps)</label>
                <input
                  type="number"
                  value={policy.riskMaxPercent}
                  onChange={(e) => setPolicy({ ...policy, riskMaxPercent: e.target.value })}
                  className="w-full bg-black/60 border border-white/5 rounded-xl px-4 py-3 text-white font-mono"
                />
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={savePolicy}
                  disabled={loading || updatingPolicy || !tokenId}
                  className="w-full h-[48px] rounded-xl bg-orange-600/20 border border-orange-500/40 text-orange-400 font-bold flex items-center justify-center gap-2 hover:bg-orange-600/30 disabled:opacity-40"
                >
                  {updatingPolicy ? 'Saving...' : 'Apply Limits'}
                </button>
              </div>
            </div>
          </section>

          {/* ── HANDOVER SECTION ── */}
          <section className="glass-card p-10 border-purple-500/20 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <ArrowRightLeft size={160} className="text-purple-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <ArrowRightLeft className="text-purple-400" size={24} />
                <h2 className="text-xl font-bold">Initiate Handover Protocol</h2>
              </div>
              <p className="text-gray-400 text-sm mb-6 max-w-lg leading-relaxed">
                Selling your agent? Triggers the 48h handover protocol. The TEE Enclave lock the agent to 
                <span className="text-orange-400 font-bold px-1">REDUCE-ONLY</span> 
                mode to protect the buyer from strategy tampering, while allowing you to withdraw capital.
              </p>

              <div className="flex gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    className="w-full bg-black/60 border border-purple-500/30 rounded-2xl px-5 py-4 text-white font-mono focus:border-purple-400 outline-none"
                    placeholder="Buyer's 0x Address..."
                  />
                </div>
                <button
                  onClick={startHandover}
                  disabled={loading || !tokenId || agentDetails?.isPending}
                  className="px-8 flex-shrink-0 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-300 font-bold hover:bg-purple-600/30 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  <Shield size={18} /> Lock Agent
                </button>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
