import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { ShoppingCart, Tag, Filter, Search, ArrowUpRight, Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import { useContractEvents } from '../hooks/useContractEvents';
import { CONFIG } from '../config';
import { AGENT_MARKETPLACE_ABI, SEALED_CLAW_AGENT_ABI } from '../abis';
import { useQuery } from '@tanstack/react-query';

const STRATEGY_ABI = [
  "function getStrategy(uint256 tokenId) external view returns (tuple(uint8 strategyClass, uint256 customBuyThresholdBps, uint256 customReduceThresholdBps, uint256 customBuySizeBps, uint256 committedAt, bool committed))"
];

const STRATEGY_NAMES = ["Safe Guardian", "Yield Sniper", "Balanced Merc", "Moon Chaser", "Custom"];
const STRATEGY_EMOJIS = ["🛡️", "🎯", "⚔️", "🚀", "⚙️"];

const MarketplacePage = ({ account }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [buyingId, setBuyingId] = useState(null);

  const provider = useMemo(() => new ethers.JsonRpcProvider(CONFIG.RPC_URL), []);
  const marketplace = useMemo(() => new ethers.Contract(CONFIG.AGENT_MARKETPLACE, AGENT_MARKETPLACE_ABI, provider), [provider]);
  const agentNFT = useMemo(() => new ethers.Contract(CONFIG.AGENT_ADDRESS, SEALED_CLAW_AGENT_ABI, provider), [provider]);

  // 1. Get all AgentListed events
  const { 
    data: listedEvents, 
    isLoading: isLoadingListed, 
    isError, 
    refetch 
  } = useContractEvents(marketplace, 'AgentListed');

  // 2. Fetch full details for each listed agent
  const { data: activeListings, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['activeListings', listedEvents?.length],
    queryFn: async () => {
      if (!listedEvents) return [];

      // Get unique tokenIds from events
      const tokenIds = [...new Set(listedEvents.map(e => e.args.tokenId.toString()))];
      
      const strategyManager = new ethers.Contract(CONFIG.STRATEGY_ADDRESS, STRATEGY_ABI, provider);
      
      const details = await Promise.all(
        tokenIds.map(async (id) => {
          try {
            const listing = await marketplace.listings(id);
            if (!listing.isActive) return null;

            // Fetch real strategy from contract
            let strategyName = "Unknown";
            let strategyEmoji = "🤖";
            try {
               const s = await strategyManager.getStrategy(id);
               if (s.committed) {
                  strategyName = STRATEGY_NAMES[s.strategyClass] || "Custom";
                  strategyEmoji = STRATEGY_EMOJIS[s.strategyClass] || "⚙️";
               }
            } catch (e) { console.error("Strategy fetch error", e); }

            return {
              id: id,
              name: `SealedClaw #${id}`,
              class: strategyName,
              price: ethers.formatEther(listing.price),
              rawPrice: listing.price,
              seller: listing.seller,
              emoji: strategyEmoji,
              performance: "Live Data" 
            };
          } catch (err) {
            console.error(`Error fetching listing ${id}:`, err);
            return null;
          }
        })
      );

      return details.filter(Boolean);
    },
    enabled: !!listedEvents,
  });

  const handleBuy = async (id, price) => {
    if (!window.ethereum) return alert("Please install MetaMask");
    
    setBuyingId(id);
    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await web3Provider.getSigner();
      const marketplaceWithSigner = new ethers.Contract(CONFIG.AGENT_MARKETPLACE, AGENT_MARKETPLACE_ABI, signer);
      
      const tx = await marketplaceWithSigner.buyAgent(id, { value: price });
      console.log("Transaction submitted:", tx.hash);
      await tx.wait();
      alert("Successfully purchased agent!");
      refetch();
    } catch (err) {
      console.error("Buy error:", err);
      alert("Transaction failed: " + (err.reason || err.message));
    } finally {
      setBuyingId(null);
    }
  };

  const filteredListings = useMemo(() => {
    if (!activeListings) return [];
    return activeListings.filter(l => 
      l.id.toString().includes(searchQuery) || 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.class.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeListings, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fadeIn">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-6xl font-black text-white tracking-tighter mb-4 italic">The Forge</h1>
        <p className="text-gray-500 max-w-xl font-medium">Acquire battle-hardened iNFT agents with committed strategies. Each agent comes with its own sealed memory and TEE attestation.</p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-10">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
          <input 
            type="text" 
            placeholder="Search by agent ID or class..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-glow w-full pl-12 bg-white/5 border-white/5"
          />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => refetch()}
            className="px-6 py-3 bg-white/5 rounded-2xl border border-white/5 text-gray-400 font-bold text-sm flex items-center gap-2 hover:bg-white/10 transition-all"
          >
            <RefreshCw size={16} className={isLoadingListed ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="px-6 py-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary font-bold text-sm flex items-center gap-2 hover:bg-primary/20 transition-all">
            <Tag size={16} /> List Agent
          </button>
        </div>
      </div>

      {isError && (
        <div className="mb-10 p-6 glass-card border-red-500/20 bg-red-500/5 flex items-center gap-4">
          <AlertTriangle size={24} className="text-red-400" />
          <div>
            <h4 className="text-red-400 font-bold">Network Error</h4>
            <p className="text-red-400/60 text-xs">Failed to fetch marketplace listings. Please check your connection to 0G Galileo.</p>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(isLoadingListed || isLoadingDetails) ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card animate-pulse">
              <div className="p-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl mb-6"></div>
                <div className="h-6 w-3/4 bg-white/5 rounded mb-2"></div>
                <div className="h-4 w-1/2 bg-white/5 rounded mb-6"></div>
                <div className="h-12 w-full bg-white/5 rounded-2xl"></div>
              </div>
            </div>
          ))
        ) : filteredListings.length > 0 ? (
          filteredListings.map(item => (
            <div key={item.id} className="glass-card group cursor-pointer hover:scale-[1.02] transition-all">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="text-4xl bg-white/5 w-16 h-16 rounded-2xl flex items-center justify-center border border-white/5 group-hover:border-primary/30 transition-colors">
                    {item.emoji}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Perf (30d)</p>
                    <p className="text-green-400 font-mono font-bold">{item.performance}</p>
                  </div>
                </div>

                <h3 className="text-xl font-black text-white mb-1">{item.name}</h3>
                <p className="text-xs text-primary font-bold uppercase tracking-widest mb-6">{item.class}</p>

                <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl mb-6">
                  <div>
                    <p className="text-[10px] text-gray-600 font-bold uppercase mb-1">List Price</p>
                    <p className="text-lg font-black text-white">{item.price} <span className="text-xs text-primary italic">0G</span></p>
                  </div>
                  <button 
                    disabled={buyingId === item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuy(item.id, item.rawPrice);
                    }}
                    className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                  >
                    {buyingId === item.id ? <RefreshCw size={18} className="animate-spin" /> : <ArrowUpRight size={20} />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] font-bold text-gray-600 uppercase tracking-tighter">
                  <span>Seller: {item.seller.slice(0, 6)}...{item.seller.slice(-4)}</span>
                  <span className="flex items-center gap-1"><Zap size={10} className="text-amber-400" /> TEE Ready</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center glass-card border-dashed">
            <div className="text-6xl mb-6 opacity-20">🛡️</div>
            <h3 className="text-2xl font-black text-white mb-2">No agents listed yet</h3>
            <p className="text-gray-500 max-w-xs mx-auto">Be the first to list your battle-hardened agent in The Forge.</p>
          </div>
        )}
      </div>
      
      {/* Info Box */}
      <div className="mt-16 p-8 glass-card border-primary/20 bg-primary/5 flex flex-col md:flex-row items-center gap-8">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
          <ShoppingCart size={32} className="text-white" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h4 className="text-xl font-black text-white mb-2">Protocol Fee Disclaimer</h4>
          <p className="text-gray-400 text-sm">A 2.5% protocol fee is applied to all successful sales. This fee goes towards the 0G Enclave Maintenance fund and further SealedClaw development.</p>
        </div>
        <button className="glow-btn bg-white text-black font-black hover:scale-105 active:scale-95 whitespace-nowrap px-8 py-4 rounded-2xl">
          Marketplace Docs
        </button>
      </div>
    </div>
  );
};

export default MarketplacePage;
