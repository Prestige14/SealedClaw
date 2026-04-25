import React, { useState, useEffect } from 'react';
import { Wallet, ShieldCheck, Gamepad2, Settings } from 'lucide-react';
import MintPage from './pages/MintPage';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import { ShoppingBag } from 'lucide-react';

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const GALILEO_CHAIN_ID = '0x40da'; // 16602

function App() {
  const [account, setAccount] = useState('');
  const [currentPage, setCurrentPage] = useState('mint'); // 'mint', 'dashboard', or 'marketplace'

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
              nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
              rpcUrls: ['https://evmrpc-testnet.0g.ai'],
              blockExplorerUrls: ['https://chainscan-galileo.0g.ai'],
            }],
          });
        }
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) setAccount(accounts[0]);
        else setAccount('');
      });
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
  }, []);

  const shortenAddr = (addr) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';

  return (
    <div className="min-h-screen bg-[#030712] font-['Inter',sans-serif] text-white">
      {/* ── Top Navigation ── */}
      <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-md border-b border-white/5 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between pointer-events-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
             <ShieldCheck size={24} className="text-white" />
            </div>
            <span className="text-xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden sm:block">
              SEALED<span className="text-purple-400">CLAW</span>
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-6">
            {/* Nav Links */}
            <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setCurrentPage('mint')}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                  currentPage === 'mint' 
                    ? 'bg-purple-500/20 text-purple-300' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Gamepad2 size={16} /> Mint iNFT
              </button>
              <button
                onClick={() => setCurrentPage('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                  currentPage === 'dashboard' 
                    ? 'bg-blue-500/20 text-blue-300' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Settings size={16} /> Dashboard
              </button>
              <button
                onClick={() => setCurrentPage('marketplace')}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                  currentPage === 'marketplace' 
                    ? 'bg-amber-500/20 text-amber-300' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <ShoppingBag size={16} /> Forge
              </button>
            </div>

            {/* Connect Wallet */}
            <button
              onClick={connectWallet}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-bold transition-all shadow-xl
                ${account
                  ? 'bg-black/50 border-white/10 text-gray-300 cursor-default'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 border-transparent text-white hover:opacity-90 shadow-purple-500/20'}`}
            >
              <Wallet size={16} />
              {account ? shortenAddr(account) : "Connect"}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main Content Area ── */}
      <div className="pt-24 pb-10">
        {currentPage === 'mint' && <MintPage account={account} onNavigate={setCurrentPage} />}
        {currentPage === 'dashboard' && <DashboardPage account={account} />}
        {currentPage === 'marketplace' && <MarketplacePage account={account} />}
      </div>
    </div>
  );
}

export default App;
