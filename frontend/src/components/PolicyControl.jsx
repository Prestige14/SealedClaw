import React from 'react';
import { Settings2, ShieldCheck, Info } from 'lucide-react';

const PolicyControl = ({ policy, setPolicy, savePolicy, loading }) => {
  return (
    <div className="glass-card p-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-accent/10 rounded-lg">
          <Settings2 size={24} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-white">Risk Policy Control</h2>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
              Max Drawdown (bps)
              <Info size={10} className="text-gray-700" />
            </label>
            <span className="text-xs font-mono text-accent">{policy.maxDrawdown}%</span>
          </div>
          <input
            type="range"
            min="100"
            max="5000"
            step="100"
            value={policy.maxDrawdown}
            onChange={(e) => setPolicy({ ...policy, maxDrawdown: e.target.value })}
            className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-accent"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Risk Max per Trade (bps)</label>
            <span className="text-xs font-mono text-primary">{policy.riskMaxPercent} bps</span>
          </div>
          <input
            type="range"
            min="50"
            max="2000"
            step="50"
            value={policy.riskMaxPercent}
            onChange={(e) => setPolicy({ ...policy, riskMaxPercent: e.target.value })}
            className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Daily Limit (0G)</label>
          <input
            type="number"
            value={policy.dailyLimit}
            onChange={(e) => setPolicy({ ...policy, dailyLimit: e.target.value })}
            className="input-glow w-full"
          />
        </div>

        <button
          onClick={savePolicy}
          disabled={loading}
          className="glow-btn w-full flex items-center justify-center gap-2 mt-4"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <ShieldCheck size={18} />
              Commit Policy
            </>
          )}
        </button>
        
        <p className="text-[10px] text-gray-600 text-center uppercase tracking-tighter font-medium">
          Note: Changes are enforced on-chain immediately via TEE validation.
        </p>
      </div>
    </div>
  );
};

export default PolicyControl;
