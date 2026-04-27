import React from 'react';
import { Cpu, Shield, Zap, TrendingUp } from 'lucide-react';

const AgentCard = ({ tokenId, owner, nonce, isActive, isPending, roleName, roleEmoji }) => {
  return (
    <div className={`glass-card transition-all duration-500 overflow-hidden ${isActive ? 'ring-2 ring-primary/40 p-1' : ''}`}>
      <div className="bg-surface p-6 rounded-[1.8rem]">
        <div className="flex justify-between items-start mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6 text-2xl">
            {roleEmoji || <Cpu size={32} className="text-white" />}
          </div>
          <div className="flex flex-col items-end gap-2">
             <span className={`status-badge ${isPending ? 'badge-pending' : 'badge-active'}`}>
               {isPending ? 'Reduce Only' : 'Optimized'}
             </span>
             <span className="text-[10px] text-gray-500 font-mono tracking-wider">#{tokenId.padStart(4, '0')}</span>
          </div>
        </div>

        <h3 className="text-xl font-black text-white mb-2">{roleName || 'Agent Vanguard'}</h3>
        <p className="text-gray-400 text-xs mb-6 line-clamp-2">Autonomous trading unit specialized in high-volatility 0G assets with TEE verification protocol.</p>
        
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="p-3 bg-black/30 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-1 text-gray-500">
              <Shield size={12} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Enclave Status</span>
            </div>
            <p className="text-xs font-mono text-primary">Verified</p>
          </div>
          <div className="p-3 bg-black/30 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-1 text-gray-500">
              <Zap size={12} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Perf. Score</span>
            </div>
            <p className="text-xs font-mono text-secondary">A++</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
           <div className="flex flex-col">
             <span className="text-[9px] text-gray-500 font-bold uppercase">On-Chain Nonce</span>
             <span className="text-sm font-mono font-bold text-white">{nonce}</span>
           </div>
           <div className="flex flex-col items-end">
             <span className="text-[9px] text-gray-500 font-bold uppercase">Owner</span>
             <span className="text-sm font-mono font-bold text-white">{owner?.slice(0, 6)}...{owner?.slice(-4)}</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AgentCard;
