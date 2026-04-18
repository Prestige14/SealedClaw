import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  Shield, 
  Wallet, 
  Cpu, 
  TrendingUp, 
  ArrowRightLeft, 
  AlertTriangle,
  CreditCard,
  CheckCircle,
  Activity
} from 'lucide-react';

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const AGENT_ADDRESS = "0x0D49E6f39370F3b01a87054c518C57bB729023E5";
const VAULT_ADDRESS = "0x03dEB78c61D8e3463EE7918066de2D9Ed7cF5186";

const AGENT_ABI = [
  "function mintAgent(string memory tokenURI) external payable",
  "function mintPrice() external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "event AgentMinted(uint256 indexed tokenId, address indexed owner, string metadataCID)"
];

const VAULT_ABI = [
  "function deposit() external payable",
  "function getNonce(uint256 tokenId) external view returns (uint256)",
  "function initiateTransfer(uint256 tokenId, address newOwner) external",
  "function pendingTransfers(uint256 tokenId) external view returns (address newOwner, uint256 transferInitiatedAt)",
  "function getPolicy(uint256 tokenId) external view returns (tuple(uint256 maxDrawdown, uint256 riskMaxPercent, address[] allowedTokens, address[] allowedDEXs, uint256 dailyLimit))",
  "event TransferInitiated(uint256 indexed tokenId, address newOwner, uint256 timestamp)"
];

const GALILEO_CHAIN_ID = '0x40da'; // 16602

export default function App() {
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [depositAmount, setDepositAmount] = useState('0.1');
  const [newOwner, setNewOwner] = useState('');
  const [tokenId, setTokenId] = useState('0');
  const [agentDetails, setAgentDetails] = useState(null);

  // Sync state with blockchain
  useEffect(() => {
    if (account) {
      updateAgentStatus();
    }
  }, [account, tokenId]);

  const showStatus = (msg, type = 'info') => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 6000);
  };

  const updateAgentStatus = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
      const agent = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, provider);

      const owner = await agent.ownerOf(tokenId).catch(() => null);
      const nonce = await vault.getNonce(tokenId).catch(() => 0);
      const pending = await vault.pendingTransfers(tokenId).catch(() => [ethers.ZeroAddress, 0]);

      setAgentDetails({
        owner,
        nonce: Number(nonce),
        isPending: pending[0] !== ethers.ZeroAddress,
        targetOwner: pending[0]
      });
    } catch (err) {
      console.error("Status update fail:", err);
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not found.");
      
      // Request network switch if needed
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

  const handleAction = async (fn) => {
    setLoading(true);
    try {
      await fn();
      await updateAgentStatus();
    } catch (err) {
      showStatus(err.reason || err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const mintAgent = () => handleAction(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, signer);

    const price = await contract.mintPrice();
    const tx = await contract.mintAgent("bafkreisealedclawmock", { value: price });
    showStatus("Minting Agent... Wait for confirmation.", "info");
    await tx.wait();
    showStatus(`Success! Token ID 0 minted.`, "success");
  });

  const depositFunds = () => handleAction(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);

    const tx = await contract.deposit({ value: ethers.parseEther(depositAmount) });
    showStatus("Sending deposit...", "info");
    await tx.wait();
    showStatus("Funds secured in PolicyVault!", "success");
  });

  const startHandover = () => handleAction(async () => {
    if (!newOwner) throw new Error("Please specify a target owner address.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);

    const tx = await contract.initiateTransfer(tokenId, newOwner);
    showStatus("Initiating Handover Protocol...", "info");
    await tx.wait();
    showStatus("Handover active! Agent restricted to Reduce-Only.", "success");
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Toast Notification */}
      {status.msg && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border transition-all animate-bounce
          ${status.type === 'error' ? 'bg-red-900/80 border-red-500' : 'bg-teal-900/80 border-teal-500'}`}>
          {status.type === 'error' ? <AlertTriangle className="text-red-400" /> : <CheckCircle className="text-teal-400" />}
          <p className="font-medium text-white">{status.msg}</p>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4 animate-float">
          <div className="p-3 bg-blue-600/20 rounded-2xl border border-blue-500/30">
            <Cpu size={40} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold glow-text bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
              SealedClaw iNFT
            </h1>
            <p className="text-gray-400 font-medium tracking-wide">Autonomous 0G Trading Agent</p>
          </div>
        </div>

        <button 
          onClick={connectWallet}
          className={`flex items-center gap-3 px-8 py-3 rounded-2xl border transition-all
            ${account 
              ? 'bg-blue-600/10 border-blue-500/50 text-blue-400' 
              : 'bg-white text-black font-bold hover:bg-gray-200 cursor-pointer'}`}
        >
          <Wallet size={20} />
          {account ? `${account.substring(0,6)}...${account.slice(-4)}` : "Connect Wallet"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Stats Column */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6 text-blue-400">
              <Activity size={24} />
              <h2 className="text-xl font-bold">Agent Health</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${agentDetails?.isPending ? 'bg-orange-500/20 text-orange-400' : 'bg-teal-500/20 text-teal-400'}`}>
                  {agentDetails?.isPending ? 'REDUCE-ONLY' : 'ACTIVE'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">On-Chain Nonce</span>
                <span className="text-white font-mono">{agentDetails?.nonce || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                <span className="text-gray-400 text-sm">Network</span>
                <span className="text-gray-300">0G Galileo</span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-br from-blue-600/20 to-teal-600/20 rounded-2xl border border-blue-500/20">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-2">Protocol Shield</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              When a transfer is initiated, the TEE enclave automatically locks the agent into 
              <strong> Reduce-Only</strong> mode via on-chain policy enforcement.
            </p>
          </div>
        </aside>

        {/* Actions Column */}
        <main className="lg:col-span-2 space-y-8">
          
          {/* Mint & Deposit row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="glass-card p-8 flex flex-col justify-between">
              <div>
                <TrendingUp className="text-purple-400 mb-4" size={32} />
                <h2 className="text-2xl font-bold mb-2">Mint Agent</h2>
                <p className="text-gray-400 text-sm mb-6">Initialize your sovereign iNFT entity on the 0G network.</p>
              </div>
              <button 
                onClick={mintAgent}
                disabled={loading || !account || agentDetails?.owner === account}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Cpu size={20} />}
                {agentDetails?.owner === account ? "Agent Owned" : "Mint iNFT"}
              </button>
            </section>

            <section className="glass-card p-8 flex flex-col justify-between">
              <div>
                <CreditCard className="text-teal-400 mb-4" size={32} />
                <h2 className="text-2xl font-bold mb-2">Fund Vault</h2>
                <p className="text-gray-400 text-sm mb-6">Deposit liquidity for your TEE Agent to trade.</p>
              </div>
              <div className="space-y-4">
                <input 
                  type="number" step="0.01" value={depositAmount} 
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="input-field font-mono"
                  placeholder="Amount (ETH)"
                />
                <button onClick={depositFunds} disabled={loading || !account} className="btn-primary w-full">
                  Deposit Funds
                </button>
              </div>
            </section>
          </div>

          {/* Handover Section */}
          <section className="glass-card p-10 border-red-500/20 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Shield size={120} className="text-red-500" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <ArrowRightLeft className="text-red-400" size={32} />
                <h2 className="text-2xl font-bold">Handover Protocol (Phase 4)</h2>
              </div>
              
              <p className="text-gray-400 mb-8 max-w-lg">
                Securely transfer ownership. This triggers a 48h cooldown where the TEE worker 
                strictly enforces risk reduction policies for the buyer's safety.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-1">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Token ID</label>
                  <input 
                    type="text" value={tokenId} onChange={(e) => setTokenId(e.target.value)}
                    className="input-field font-mono text-center"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">New Owner Address</label>
                  <input 
                    type="text" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}
                    className="input-field font-mono"
                    placeholder="0x..."
                  />
                </div>
              </div>

              <button 
                onClick={startHandover}
                disabled={loading || !account || agentDetails?.isPending}
                className="btn-danger w-full flex items-center justify-center gap-3 py-4"
              >
                {agentDetails?.isPending ? <Shield size={24} /> : <AlertTriangle size={24} />}
                {agentDetails?.isPending ? "PROTECTION ACTIVE" : "INITIATE SECURE HANDOVER"}
              </button>
              
              {agentDetails?.isPending && (
                <p className="mt-4 text-center text-sm text-orange-400 font-medium">
                  Currently in 48-hour cooldown. Strategy locked to Reduce-Only.
                </p>
              )}
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
