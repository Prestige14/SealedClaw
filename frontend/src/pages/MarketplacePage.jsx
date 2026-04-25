import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ShoppingCart, Tag, Filter, Search, ArrowUpRight, Cpu, Zap } from 'lucide-react';

const MARKETPLACE_ADDRESS = "0x0000000000000000000000000000000000000000"; // Update after deploy

const MarketplacePage = ({ account }) => {
  const [listings, setListings] = useState([
    { id: 1, name: "Vanguard Alpha", class: "Balanced Merc", price: "12.5", seller: "0x1234...5678", emoji: "⚔️", performance: "+14.2%" },
    { id: 2, name: "Guardian Prime", class: "Safe Guardian", price: "28.0", seller: "0xabcd...efgh", emoji: "🛡️", performance: "+4.1%" },
    { id: 3, name: "Nitro Sniper", class: "Yield Sniper", price: "8.2", seller: "0x9876...5432", emoji: "🎯", performance: "+22.5%" },
    { id: 4, name: "Moon Shot", class: "Moon Chaser", price: "45.0", seller: "0xdead...beef", emoji: "🚀", performance: "+112.0%" },
  ]);

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
            className="input-glow w-full pl-12 bg-white/5 border-white/5"
          />
        </div>
        <div className="flex gap-2">
          <button className="px-6 py-3 bg-white/5 rounded-2xl border border-white/5 text-gray-400 font-bold text-sm flex items-center gap-2 hover:bg-white/10 transition-all">
            <Filter size={16} /> Filters
          </button>
          <button className="px-6 py-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary font-bold text-sm flex items-center gap-2 hover:bg-primary/20 transition-all">
            <Tag size={16} /> List Agent
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {listings.map(item => (
          <div key={item.id} className="glass-card group cursor-pointer hover:scale-[1.02]">
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
                  <p className="text-[10px] text-gray-600 font-bold uppercase mb-1">Floor Price</p>
                  <p className="text-lg font-black text-white">{item.price} <span className="text-xs text-primary italic">0G</span></p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:bg-primary group-hover:text-white transition-all">
                  <ArrowUpRight size={20} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold text-gray-600 uppercase tracking-tighter">
                <span>Seller: {item.seller}</span>
                <span className="flex items-center gap-1"><Zap size={10} className="text-amber-400" /> TEE Ready</span>
              </div>
            </div>
          </div>
        ))}
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
        <button className="glow-btn bg-white text-black font-black hover:scale-105 active:scale-95 whitespace-nowrap">
          Learn More
        </button>
      </div>
    </div>
  );
};

export default MarketplacePage;
