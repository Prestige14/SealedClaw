import React from 'react';
import { Globe, RefreshCw, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import { useOraclePrice } from '../hooks/useOraclePrice';

const OraclePriceFeed = ({ asset = "ETH" }) => {
  const pair = `${asset}/USD`;
  const { data, isLoading, isError, error, refetch, failureCount } = useOraclePrice(pair);

  const isOffline = failureCount >= 3;

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  if (isLoading && !data) {
    return (
      <div className="glass-card p-6 border-blue-500/10 animate-pulse">
        <div className="h-6 w-32 bg-white/5 rounded mb-6"></div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl"></div>)}
        </div>
      </div>
    );
  }

  const status = isOffline ? 'OFFLINE' : (data?.status || 'LOADING').toUpperCase();
  const price = data?.price || '0.00';
  const updatedAt = data?.updatedAt;

  return (
    <div className={`glass-card p-6 border-blue-500/10 transition-all ${isOffline ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Globe size={20} className="text-blue-400" />
          </div>
          <h3 className="text-lg font-bold">Chainlink Oracle</h3>
        </div>
        
        <div className="flex items-center gap-2">
          {isOffline ? (
            <button 
              onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <RefreshCw size={12} className="animate-spin-once" />
              <span className="text-[10px] font-black uppercase tracking-widest">Retry Connection</span>
            </button>
          ) : (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
              status === 'LIVE' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 
              status === 'STALE' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
              status === 'UNCONFIGURED' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
              'bg-white/5 border-white/10 text-gray-400'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                status === 'LIVE' ? 'bg-green-400 animate-pulse' : 
                status === 'STALE' ? 'bg-yellow-400' : 
                status === 'UNCONFIGURED' ? 'bg-blue-400' :
                'bg-gray-400'
              }`}></div>
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isError ? 'CACHED' : status}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="p-5 bg-black/40 rounded-2xl border border-white/5 group hover:border-blue-500/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs">🔗</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{pair} Feed</span>
            </div>
            {status === 'LIVE' && <ShieldCheck size={14} className="text-blue-400" />}
          </div>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-mono font-black text-white tracking-tighter">
              {status === 'UNCONFIGURED' ? 'N/A' : `$${parseFloat(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
            <div className="text-right">
               <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase">
                  <Clock size={10} />
                  <span>Last update</span>
               </div>
               <p className="text-xs text-gray-400 font-mono">{status === 'UNCONFIGURED' ? '—' : getTimeAgo(updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {isError && !isOffline && (
        <div className="mt-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-[10px] text-red-400/80 font-medium">
            RPC connection unstable. Showing last known price from cache.
          </p>
        </div>
      )}

      {!isError && status === 'STALE' && (
        <div className="mt-4 p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl flex items-center gap-3">
          <Clock size={16} className="text-yellow-400 shrink-0" />
          <p className="text-[10px] text-yellow-400/80 font-medium">
            Price hasn't updated on-chain for over an hour.
          </p>
        </div>
      )}

      {status === 'UNCONFIGURED' && (
        <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-center gap-3">
          <Globe size={16} className="text-blue-400 shrink-0" />
          <p className="text-[10px] text-blue-400/80 font-medium">
            This price feed is not yet configured on the 0G Aristotle Mainnet.
          </p>
        </div>
      )}
    </div>
  );
};

export default OraclePriceFeed;
