import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Shield,
  Wallet,
  Cpu,
  TrendingUp,
  ArrowRightLeft,
  AlertTriangle,
  CreditCard,
  CheckCircle,
  Activity,
  ArrowDownCircle,
  RefreshCw,
  BarChart3,
  Loader2,
  Layers,
} from 'lucide-react';

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const AGENT_ADDRESS = "0xA19c38b95ac185ae77ee29A725E5b17C1cBFDa00";
const VAULT_ADDRESS = "0x3eC0166E98c48E57969c82A68Fa60974F94157B4";
const GALILEO_CHAIN_ID = '0x40da'; // 16602

const AGENT_ABI = [
  "function mintAgent(string memory tokenURI) external payable",
  "function mintPrice() external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "event AgentMinted(uint256 indexed tokenId, address indexed owner, string metadataCID)"
];

const VAULT_ABI = [
  // Legacy deposit/withdraw (per-address) — deployed on testnet
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function balances(address user) external view returns (uint256)",
  // Per-tokenId functions — available after contract upgrade
  "function deposit(uint256 tokenId) external payable",
  "function withdraw(uint256 tokenId, uint256 amount) external",
  "function getVaultBalance(uint256 tokenId) external view returns (uint256)",
  // Common view helpers
  "function getNonce(uint256 tokenId) external view returns (uint256)",
  "function initiateTransfer(uint256 tokenId, address newOwner) external",
  "function pendingTransfers(uint256 tokenId) external view returns (address newOwner, uint256 transferInitiatedAt)",
  "function getPolicy(uint256 tokenId) external view returns (tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit))",
  "event TransferInitiated(uint256 indexed tokenId, address newOwner, uint256 timestamp)",
  "event WithdrawnVault(uint256 indexed tokenId, address indexed owner, uint256 amount)",
  "event DepositedToVault(uint256 indexed tokenId, address indexed depositor, uint256 amount)"
];

// ── PALETTE ───────────────────────────────────────────────────────────────────
const PIE_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b'];

// ── HELPERS ───────────────────────────────────────────────────────────────────
/**
 * fmt() — safely format a wei value (BigInt | string | number) to a 4-decimal
 * ETH string.  Accepts:
 *   • BigInt  → ethers.formatEther() then toFixed(4)
 *   • number  → already in ETH (Recharts converts BigInt automatically), just toFixed(4)
 *   • string  → parseFloat then toFixed(4)
 */
const fmt = (wei) => {
  if (wei === undefined || wei === null) return '0.0000';
  // If the value is already a plain JS number (e.g. from Recharts's
  // internal conversion), do NOT pass it through BigInt — just round it.
  if (typeof wei === 'number') return wei.toFixed(4);
  // BigInt or numeric string representing wei
  try {
    const bi = BigInt(wei);
    if (bi === 0n) return '0.0000';
    return parseFloat(ethers.formatEther(bi)).toFixed(4);
  } catch {
    // Fallback: treat as ETH-denominated float string
    return parseFloat(String(wei)).toFixed(4);
  }
};

const shortenAddr = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';

/**
 * CustomTooltip — receives value already as a plain JS Number from Recharts
 * (we pre-convert BigInt → Number before handing to <Pie data={...}>).
 * Using Number().toFixed() directly avoids the BigInt(0.05) crash.
 */
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900/95 border border-blue-500/30 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md">
        <p className="text-blue-300 font-semibold text-sm">{payload[0].name}</p>
        <p className="text-white font-mono text-base">
          {Number(payload[0].value).toFixed(4)} A0GI
        </p>
      </div>
    );
  }
  return null;
};

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [account, setAccount]               = useState('');
  const [loading, setLoading]               = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [status, setStatus]                 = useState({ type: '', msg: '' });
  const [depositAmount, setDepositAmount]   = useState('0.1');
  const [withdrawAmount, setWithdrawAmount] = useState('0.05');
  const [newOwner, setNewOwner]             = useState('');
  const [tokenId, setTokenId]               = useState('');
  const [agentDetails, setAgentDetails]     = useState(null);

  // Portfolio state (all in BigInt wei)
  const [vaultNativeBalance, setVaultNativeBalance] = useState(0n);
  const [tokenVaultBalance, setTokenVaultBalance]   = useState(0n);
  const [userLegacyBalance, setUserLegacyBalance]   = useState(0n);

  // iNFT ownership list  { tokenId: string, metadataCID: string }[]
  const [ownedTokens, setOwnedTokens]       = useState([]);
  const [tokensLoading, setTokensLoading]   = useState(false);

  /**
   * contractCaps — tracks which functions are available on the deployed contract.
   * Probed once after wallet connect. Drives deposit/withdraw fallback logic.
   *   hasTokenDeposit : deposit(uint256) exists (upgraded contract)
   *   hasTokenWithdraw: withdraw(uint256,uint256) exists (upgraded contract)
   *   hasVaultBalance : getVaultBalance(uint256) exists (upgraded contract)
   */
  const [contractCaps, setContractCaps] = useState({
    hasTokenDeposit:  false,
    hasTokenWithdraw: false,
    hasVaultBalance:  false,
    probed:           false,
  });

  // ── Detect contract capabilities via silent eth_call ─────────────────────
  const probeContractCaps = useCallback(async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);

      // 4-byte selectors for the new functions:
      //   getVaultBalance(uint256) → keccak256 of "getVaultBalance(uint256)"
      //   We use eth_call with dummy data to see if it reverts with data or silently
      const GVAB_SELECTOR = '0x47bd3720'; // getVaultBalance(uint256)
      const raw = await provider.call({
        to:   VAULT_ADDRESS,
        data: GVAB_SELECTOR + '0'.repeat(64), // padded tokenId=0
      }).catch(() => null);

      // If we get ANY non-null response (even 32 zero bytes), the function exists.
      // A reverted call returns null or throws.
      const hasVB = raw !== null && raw !== '0x';

      setContractCaps({
        hasTokenDeposit:  hasVB,  // new contract has all three new functions together
        hasTokenWithdraw: hasVB,
        hasVaultBalance:  hasVB,
        probed:           true,
      });

      if (!hasVB) {
        console.info('[SealedClaw] Legacy contract detected — using deposit()/withdraw(amount).');
      } else {
        console.info('[SealedClaw] Upgraded contract detected — per-tokenId functions available.');
      }
    } catch {
      // Default to legacy-safe mode
      setContractCaps({ hasTokenDeposit: false, hasTokenWithdraw: false, hasVaultBalance: false, probed: true });
    }
  }, []);

  // ── Toast ────────────────────────────────────────────────────────────────
  const showStatus = (msg, type = 'info') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 7000);
  };

  // ── Agent & portfolio fetch ───────────────────────────────────────────────
  const updateAgentStatus = useCallback(async () => {
    if (!account || !tokenId) {
      setAgentDetails(null);
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
      const agent    = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);

      const owner   = await agent.ownerOf(tokenId).catch(() => null);
      const nonce   = await vault.getNonce(tokenId).catch(() => 0n);

      // Fetch PendingTransfer — guard against both call failure AND
      // uninitialised struct (address(0) + timestamp 0) returning as truthy.
      // ethers v6 named-field access is safer than positional indexing.
      let isPending   = false;
      let targetOwner = ethers.ZeroAddress;
      try {
        const pt = await vault.pendingTransfers(tokenId);
        // newOwner and transferInitiatedAt are the struct field names
        const ptOwner = pt.newOwner ?? pt[0];
        const ptTime  = pt.transferInitiatedAt ?? pt[1];
        isPending   = ptOwner !== ethers.ZeroAddress && BigInt(ptTime) > 0n;
        targetOwner = ptOwner;
      } catch {
        // call failed — safe default: not pending
        isPending   = false;
        targetOwner = ethers.ZeroAddress;
      }

      setAgentDetails({
        owner,
        nonce: Number(nonce),
        isPending,
        targetOwner,
      });
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

      // 1. Total ETH in vault — always works (eth_getBalance, no contract needed)
      const nativeBal = await provider.getBalance(VAULT_ADDRESS).catch(() => 0n);

      // 2. Per-tokenId balance — only on upgraded contract.
      //    Probe result from contractCaps; fall back to 0n silently.
      let tokenBal = 0n;
      if (contractCaps.hasVaultBalance && tokenId) {
        try {
          tokenBal = await vault.getVaultBalance(tokenId);
        } catch {
          tokenBal = 0n;
        }
      }

      // 3. Legacy balances[account] — exists on old AND new contract
      let legacyBal = 0n;
      try {
        legacyBal = await vault.balances(account);
      } catch {
        legacyBal = 0n;
      }

      setVaultNativeBalance(nativeBal);
      setTokenVaultBalance(tokenBal);
      setUserLegacyBalance(legacyBal);
    } catch (err) {
      console.warn('Portfolio update failed:', err.message ?? err);
    } finally {
      setPortfolioLoading(false);
    }
  }, [account, tokenId, contractCaps]);

  /**
   * fetchOwnedTokens — queries AgentMinted events filtered to the connected
   * wallet, then checks current ownerOf to handle secondary transfers.
   */
  const fetchOwnedTokens = useCallback(async () => {
    if (!account) return;
    setTokensLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const agent    = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);

      // Query events minted by this address (topic1 = owner)
      const filter = agent.filters.AgentMinted(null, account);
      const logs   = await agent.queryFilter(filter, 0, 'latest');

      // Verify current ownership (token may have been transferred away)
      const verified = await Promise.all(
        logs.map(async (log) => {
          const id  = log.args.tokenId.toString();
          const cid = log.args.metadataCID || '';
          const currentOwner = await agent.ownerOf(id).catch(() => null);
          if (currentOwner?.toLowerCase() !== account.toLowerCase()) return null;
          return { tokenId: id, metadataCID: cid };
        })
      );
      const validTokens = verified.filter(Boolean);
      setOwnedTokens(validTokens);

      // Auto-select first token if current is empty or not in the owned list
      setTokenId((curr) => {
        if (validTokens.length > 0 && (!curr || !validTokens.some(t => t.tokenId === curr))) {
          return validTokens[0].tokenId;
        }
        return curr;
      });

    } catch (err) {
      console.error('fetchOwnedTokens failed:', err);
    } finally {
      setTokensLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (account) {
      probeContractCaps(); // detect legacy vs upgraded contract first
      updateAgentStatus();
      fetchOwnedTokens();
    }
  }, [account]);

  // Re-run portfolio fetch whenever capabilities are probed or tokenId changes
  useEffect(() => {
    if (account && contractCaps.probed) {
      updatePortfolio();
    }
  }, [account, tokenId, contractCaps.probed, contractCaps.hasVaultBalance, updatePortfolio]);

  // ── Wallet connect ────────────────────────────────────────────────────────
  const connectWallet = async () => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not found.");
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: GALILEO_CHAIN_ID }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: GALILEO_CHAIN_ID,
              chainName: '0G Galileo Testnet',
              nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
              rpcUrls: ['https://evmrpc-testnet.0g.ai'],
              blockExplorerUrls: ['https://chainscan-galileo.0g.ai'],
            }],
          });
        }
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      showStatus("Wallet connected to 0G Galileo", "success");
    } catch (err) {
      showStatus(err.message, "error");
    }
  };

  // ── Generic action wrapper ────────────────────────────────────────────────
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

  // ── Contract actions ──────────────────────────────────────────────────────
  const mintAgent = () => handleAction(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, signer);
    const price    = await contract.mintPrice();
    showStatus("Minting Agent… waiting for confirmation.", "info");
    const tx = await contract.mintAgent("bafkreisealedclawmock", { value: price });
    const receipt = await tx.wait();

    // Auto-select the newly minted token ID from the event if possible
    if (receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'AgentMinted') {
            const newTokenId = parsed.args[0].toString();
            setTokenId(newTokenId);
            showStatus(`Success! Agent iNFT #${newTokenId} minted.`, "success");
            return;
          }
        } catch (e) { /* ignore parse errors for other events */ }
      }
    }
    showStatus("Success! Agent iNFT minted.", "success");
  });

  const depositFunds = () => handleAction(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const valueWei = { value: ethers.parseEther(depositAmount.toString()) };

    if (contractCaps.hasTokenDeposit) {
      // Upgraded contract: attribute deposit to tokenId
      const ABI = ["function deposit(uint256 tokenId) external payable"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Sending deposit to vault…', 'info');
      const tx = await c.deposit(BigInt(tokenId), valueWei);
      await tx.wait();
      showStatus(`✓ Deposited ${depositAmount} A0GI to Token #${tokenId}`, 'success');
    } else {
      // Legacy contract: deposit to msg.sender balance
      const ABI = ["function deposit() external payable"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Sending deposit (legacy mode)…', 'info');
      const tx = await c.deposit(valueWei);
      await tx.wait();
      showStatus(`✓ Deposited ${depositAmount} A0GI to vault`, 'success');
    }
  });

  const withdrawFunds = () => handleAction(async () => {
    const amountWei = ethers.parseEther(withdrawAmount.toString());

    // Determine which balance source to validate against
    const availableBalance = contractCaps.hasTokenWithdraw ? tokenVaultBalance : userLegacyBalance;
    if (amountWei > availableBalance) {
      throw new Error(`Insufficient balance. Max: ${fmt(availableBalance)} A0GI`);
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();

    if (contractCaps.hasTokenWithdraw) {
      // Upgraded contract: withdraw from tokenId vault
      const ABI = ["function withdraw(uint256 tokenId, uint256 amount) external"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Processing withdrawal…', 'info');
      const tx = await c.withdraw(BigInt(tokenId), amountWei);
      await tx.wait();
      showStatus(`✓ Withdrawn ${withdrawAmount} A0GI from Token #${tokenId}`, 'success');
    } else {
      // Legacy contract: withdraw from msg.sender balance
      const ABI = ["function withdraw(uint256 amount) external"];
      const c   = new ethers.Contract(VAULT_ADDRESS, ABI, signer);
      showStatus('Processing withdrawal (legacy mode)…', 'info');
      const tx = await c.withdraw(amountWei);
      await tx.wait();
      showStatus(`✓ Withdrawn ${withdrawAmount} A0GI from vault`, 'success');
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

  // ── Pie chart data ────────────────────────────────────────────────────────
  // Primary user balance: prefer per-tokenId (new contract) → legacy (old contract)
  const myBalance     = contractCaps.hasVaultBalance ? tokenVaultBalance : userLegacyBalance;
  const myBalanceLabel = contractCaps.hasVaultBalance
    ? `Token #${tokenId} Vault Share`
    : 'Your Deposited Balance';

  const otherVaultBalance = vaultNativeBalance > myBalance
    ? vaultNativeBalance - myBalance
    : 0n;

  const pieData = [
    { name: myBalanceLabel,      value: myBalance },
    { name: 'Other Vault Funds', value: otherVaultBalance },
  ].filter(d => d.value > 0n);

  const hasPortfolioData = pieData.length > 0;

  // Available withdraw balance (context-sensitive)
  const withdrawableBalance = contractCaps.hasTokenWithdraw ? tokenVaultBalance : userLegacyBalance;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">

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

      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600/20 rounded-2xl border border-blue-500/30 shadow-lg shadow-blue-500/10">
            <Cpu size={40} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold glow-text bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400">
              SealedClaw iNFT
            </h1>
            <p className="text-gray-400 font-medium tracking-wide text-sm">Autonomous 0G Trading Agent — Hackathon Edition</p>
          </div>
        </div>

        <button
          id="connect-wallet-btn"
          onClick={connectWallet}
          className={`flex items-center gap-3 px-8 py-3 rounded-2xl border transition-all font-semibold
            ${account
              ? 'bg-blue-600/10 border-blue-500/40 text-blue-300 cursor-default'
              : 'bg-gradient-to-r from-blue-600 to-teal-600 border-transparent text-white hover:opacity-90 cursor-pointer shadow-lg shadow-blue-500/20'}`}
        >
          <Wallet size={18} />
          {account ? shortenAddr(account) : "Connect Wallet"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ══════════════ LEFT SIDEBAR ══════════════ */}
        <aside className="lg:col-span-1 space-y-6">

          {/* Agent Health */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5 text-blue-400">
              <Activity size={22} />
              <h2 className="text-lg font-bold">Agent Health</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide
                  ${!tokenId 
                    ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    : agentDetails?.isPending
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'}`}
                >
                  {!tokenId ? '—' : agentDetails?.isPending ? '⚠ REDUCE-ONLY' : '● ACTIVE'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">On-Chain Nonce</span>
                <span className="text-white font-mono font-bold">{tokenId && agentDetails ? agentDetails.nonce : '—'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">Token ID</span>
                <span className="text-white font-mono font-bold">{tokenId ? `#${tokenId}` : '—'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">Network</span>
                <span className="text-cyan-400 text-sm font-medium">0G Galileo</span>
              </div>
            </div>
            {/* Contract mode badge */}
            {account && contractCaps.probed && (
              <div className={`mt-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2
                ${ contractCaps.hasVaultBalance
                  ? 'bg-teal-500/10 border border-teal-500/20 text-teal-400'
                  : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                {contractCaps.hasVaultBalance
                  ? 'Upgraded Contract ✓'
                  : 'Legacy Contract — redeploy for per-tokenId mode'}
              </div>
            )}
          </div>

          {/* ── iNFT Collection ── */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-purple-400">
                <Layers size={20} />
                <h2 className="text-sm font-bold">My iNFTs</h2>
              </div>
              <button
                id="refresh-tokens-btn"
                onClick={fetchOwnedTokens}
                disabled={!account || tokensLoading}
                className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
                title="Refresh iNFT list"
              >
                {tokensLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
              </button>
            </div>

            {!account ? (
              <p className="text-gray-600 text-xs text-center py-4">Connect wallet to see your agents</p>
            ) : tokensLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={24} className="animate-spin text-purple-400" />
              </div>
            ) : ownedTokens.length === 0 ? (
              <div className="text-center py-4">
                <Cpu size={28} className="text-gray-700 mx-auto mb-2" />
                <p className="text-gray-600 text-xs">No agents found</p>
                <p className="text-gray-700 text-xs mt-1">Mint your first iNFT →</p>
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
                        ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                        : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:border-white/10'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                      ${ tokenId === t.tokenId ? 'bg-purple-500/30' : 'bg-gray-800'}`}>
                      <Cpu size={16} className={tokenId === t.tokenId ? 'text-purple-300' : 'text-gray-500'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold font-mono">Token #{t.tokenId}</p>
                      <p className="text-xs text-gray-600 truncate">
                        {t.metadataCID ? t.metadataCID.slice(0, 20) + '…' : 'No metadata'}
                      </p>
                    </div>
                    {tokenId === t.tokenId && (
                      <CheckCircle size={14} className="text-purple-400 ml-auto shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Protocol Shield info */}
          <div className="p-5 bg-gradient-to-br from-blue-600/15 to-teal-600/15 rounded-2xl border border-blue-500/20">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Protocol Shield</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              During handover, the TEE enclave locks the agent into <strong className="text-orange-400">Reduce-Only</strong> mode.
              Withdrawals remain available as asset cleanup before handover completes.
            </p>
          </div>

        </aside>

        {/* ══════════════ MAIN AREA ══════════════ */}
        <main className="lg:col-span-2 space-y-8">

          {/* ── REAL PORTFOLIO DASHBOARD ── */}
          <section className="glass-card p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 text-blue-400">
                <BarChart3 size={24} />
                <h2 className="text-xl font-bold text-white">Portfolio Dashboard</h2>
              </div>
              <button
                id="refresh-portfolio-btn"
                onClick={updatePortfolio}
                disabled={!account || portfolioLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm hover:bg-blue-600/20 transition-all disabled:opacity-40"
              >
                {portfolioLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                {
                  label: 'Vault Total A0GI',
                  value: fmt(vaultNativeBalance),
                  color: 'text-blue-400',
                  sub: 'Contract native balance',
                },
                {
                  label: contractCaps.hasVaultBalance ? 'Token Share' : 'Your Balance',
                  value: fmt(myBalance),
                  color: 'text-teal-400',
                  sub: contractCaps.hasVaultBalance 
                        ? (tokenId ? `Per-tokenId vault (#${tokenId})` : 'Per-tokenId vault')
                        : 'Legacy balances[]',
                },
                {
                  label: 'Vault Utilisation',
                  value: vaultNativeBalance > 0n
                    ? `${((Number(myBalance) / Number(vaultNativeBalance)) * 100).toFixed(1)}%`
                    : '0%',
                  color: 'text-purple-400',
                  sub: 'Your share of total',
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-black/30 rounded-2xl p-4 border border-white/5">
                  <p className="text-gray-500 text-xs mb-1">{stat.label}</p>
                  <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  <p className="text-gray-600 text-xs mt-1">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* Live PieChart */}
            {!account ? (
              <div className="flex flex-col items-center justify-center h-52 text-gray-600 gap-3">
                <Wallet size={36} />
                <p className="text-sm">Connect wallet to see live portfolio data</p>
              </div>
            ) : portfolioLoading ? (
              <div className="flex items-center justify-center h-52">
                <div className="flex flex-col items-center gap-3 text-blue-400">
                  <Loader2 size={36} className="animate-spin" />
                  <p className="text-sm">Fetching on-chain data…</p>
                </div>
              </div>
            ) : hasPortfolioData ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData.map(d => ({ ...d, value: Number(ethers.formatEther(d.value)) }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={10}
                    formatter={(value) => (
                      <span className="text-gray-300 text-xs">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-52 text-gray-600 gap-3">
                <BarChart3 size={36} />
                <p className="text-sm font-medium">No funds in vault</p>
                <p className="text-xs text-gray-700">Deposit funds below to see your allocation chart</p>
              </div>
            )}
          </section>

          {/* ── DEPOSIT + TOKEN ID ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Token ID input (shared) */}
            <div className="glass-card p-6 flex flex-col justify-between md:col-span-1">
              <div>
                <Cpu className="text-cyan-400 mb-3" size={28} />
                <h3 className="font-bold text-white mb-1">Active Token</h3>
                <p className="text-gray-500 text-xs mb-4">Set the iNFT Token ID for all operations</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Token ID</label>
                <input
                  id="token-id-input"
                  type="text"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  className="input-field font-mono text-center text-lg"
                />
              </div>
            </div>

            {/* Mint + Deposit stacked */}
            <div className="md:col-span-2 space-y-6">

              {/* Mint Agent */}
              <section className="glass-card p-6 flex flex-col justify-between">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="text-purple-400" size={24} />
                  <h2 className="text-lg font-bold">Mint Agent iNFT</h2>
                </div>
                <button
                  id="mint-agent-btn"
                  onClick={mintAgent}
                  disabled={loading || !account || agentDetails?.owner === account}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <Cpu size={18} />}
                  {agentDetails?.owner === account ? "✓ Agent Owned" : "Mint iNFT"}
                </button>
              </section>

              {/* Fund Vault */}
              <section className="glass-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CreditCard className="text-teal-400" size={24} />
                  <h2 className="text-lg font-bold">Fund Vault</h2>
                </div>
                <p className="text-gray-500 text-xs mb-4">Deposit A0GI attributed to Token #{tokenId}</p>
                <div className="flex gap-3">
                  <input
                    id="deposit-amount-input"
                    type="number"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="input-field font-mono flex-1"
                    placeholder="Amount (A0GI)"
                  />
                  <button
                    id="deposit-btn"
                    onClick={depositFunds}
                    disabled={loading || !account}
                    className="btn-primary px-6 flex items-center gap-2 whitespace-nowrap"
                  >
                    {loading
                      ? <Loader2 size={16} className="animate-spin" />
                      : <CreditCard size={16} />}
                    Deposit
                  </button>
                </div>
              </section>

            </div>
          </div>

          {/* ── WITHDRAWAL SECTION ── */}
          <section className="glass-card p-8 border-teal-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <ArrowDownCircle size={140} className="text-teal-400" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <ArrowDownCircle className="text-teal-400" size={28} />
                <h2 className="text-xl font-bold">Withdraw Funds</h2>
              </div>
              <p className="text-gray-400 text-sm mb-6 max-w-lg">
                Withdraw A0GI from {tokenId ? `Token #${tokenId}'s` : 'the'} vault allocation.
                Available even during an active Handover Protocol (asset cleanup).
              </p>

              {/* Available balance */}
              <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl border border-teal-500/10 mb-6">
                <span className="text-gray-400 text-sm">
                  Available ({contractCaps.hasTokenWithdraw ? (tokenId ? `Token #${tokenId}` : 'Token Vault') : 'Your wallet'})
                </span>
                <span className="text-teal-400 font-mono font-bold text-lg">
                  {fmt(withdrawableBalance)} <span className="text-sm font-normal text-gray-500">A0GI</span>
                </span>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Amount (A0GI)</label>
                  <input
                    id="withdraw-amount-input"
                    type="number"
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="input-field font-mono w-full"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <button
                    id="max-withdraw-btn"
                    onClick={() => setWithdrawAmount(fmt(withdrawableBalance))}
                    className="mb-1 text-xs text-teal-400 hover:text-teal-300 underline cursor-pointer"
                  >
                    MAX
                  </button>
                  <button
                    id="withdraw-btn"
                    onClick={withdrawFunds}
                    disabled={loading || !account || (contractCaps.hasTokenWithdraw && !tokenId) || withdrawableBalance === 0n}
                    className="px-8 py-3 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-400 font-bold
                      hover:bg-teal-600/30 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed
                      flex items-center gap-2"
                  >
                    {loading
                      ? <Loader2 size={18} className="animate-spin" />
                      : <ArrowDownCircle size={18} />}
                    Withdraw Funds
                  </button>
                </div>
              </div>

              {agentDetails?.isPending && (
                <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center gap-2 text-sm text-orange-400">
                  <AlertTriangle size={16} className="shrink-0" />
                  Handover active. Withdrawal allowed as asset cleanup before ownership transfer.
                </div>
              )}
            </div>
          </section>

          {/* ── HANDOVER SECTION ── */}
          <section className="glass-card p-10 border-red-500/20 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Shield size={120} className="text-red-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <ArrowRightLeft className="text-red-400" size={28} />
                <h2 className="text-xl font-bold">Handover Protocol (Phase 4)</h2>
              </div>
              <p className="text-gray-400 text-sm mb-8 max-w-lg">
                Securely transfer ownership. Triggers 48h cooldown where TEE enforces
                Reduce-Only mode for buyer protection.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-3">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">New Owner Address</label>
                  <input
                    id="new-owner-input"
                    type="text"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    className="input-field font-mono w-full"
                    placeholder="0x…"
                  />
                </div>
              </div>

              <button
                id="handover-btn"
                onClick={startHandover}
                disabled={loading || !account || agentDetails?.isPending}
                className="btn-danger w-full flex items-center justify-center gap-3 py-4"
              >
                {agentDetails?.isPending
                  ? <><Shield size={22} /> PROTECTION ACTIVE</>
                  : loading
                  ? <><Loader2 size={22} className="animate-spin" /> Processing…</>
                  : <><AlertTriangle size={22} /> INITIATE SECURE HANDOVER</>}
              </button>

              {agentDetails?.isPending && (
                <p className="mt-4 text-center text-sm text-orange-400 font-medium">
                  48-hour cooldown active. Agent locked to Reduce-Only mode.
                </p>
              )}
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
