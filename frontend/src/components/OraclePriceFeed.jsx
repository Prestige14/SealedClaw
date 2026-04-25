import React, { useState, useEffect } from 'react';
import { Activity, Globe, Info } from 'lucide-react';

const OraclePriceFeed = ({ asset = "ETH" }) => {
  const [prices, setPrices] = useState({
    pyth: 3140.25,
    chainlink: 3142.10,
    twap: 3139.80,
    onchain: 3141.50
  });
  const [loading, setLoading] = useState(false);

  // Mock auto-update for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => ({
        pyth: prev.pyth + (Math.random() - 0.5) * 2,
        chainlink: prev.chainlink + (Math.random() - 0.5) * 1.5,
        twap: prev.twap + (Math.random() - 0.5) * 0.5,
        onchain: prev.onchain + (Math.random() - 0.5) * 1.2
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const median = Object.values(prices).sort((a, b) => a - b)[1];

  return (
    <div className="glass-card p-6 border-blue-500/10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Globe size={20} className="text-blue-400" />
          </div>
          <h3 className="text-lg font-bold">Multi-Oracle Feed</h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Live Sync</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { name: 'Pyth Network', val: prices.pyth, icon: '🔥' },
          { name: 'Chainlink', val: prices.chainlink, icon: '🔗' },
          { name: 'On-Chain CL', val: prices.onchain, icon: '⛓️' },
          { name: '0G TWAP', val: prices.twap, icon: '⏳' },
        ].map(source => (
          <div key={source.name} className="p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-blue-500/20 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs">{source.icon}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{source.name}</span>
            </div>
            <p className="text-white font-mono font-bold tracking-tight">
              ${source.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] text-blue-300 font-bold uppercase tracking-[0.2em] mb-1">Effective Aggregated Price</p>
            <p className="text-2xl font-black text-white italic tracking-tighter">
              ${median.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-blue-400">0.05% Dev.</p>
            <p className="text-[10px] text-gray-500 uppercase font-bold">Safe for Trade</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OraclePriceFeed;
