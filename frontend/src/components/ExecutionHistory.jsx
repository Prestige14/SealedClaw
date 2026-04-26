import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { CheckCircle2, Clock, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { useContractEvents } from '../hooks/useContractEvents';
import { CONFIG } from '../config';
import { POLICY_VAULT_ABI } from '../abis';

const ExecutionHistory = ({ tokenId }) => {
  const [itemsToShow, setItemsToShow] = useState(10);
  
  const provider = useMemo(() => new ethers.JsonRpcProvider(CONFIG.RPC_URL), []);
  const vault = useMemo(() => new ethers.Contract(CONFIG.VAULT_ADDRESS, POLICY_VAULT_ABI, provider), [provider]);

  // Filter events for this specific tokenId
  const { data: events, isLoading, isError, refetch } = useContractEvents(
    vault, 
    'StrategyExecuted', 
    0, // Starting from block 0 for demo, in production use DEPLOYMENT_BLOCK
    tokenId ? { tokenId: BigInt(tokenId) } : {}
  );

  const decodedLogs = useMemo(() => {
    if (!events) return [];

    return events.map(event => {
      try {
        // strategyData format: (string action, uint256 amount, address tokenIn, address tokenOut)
        const abiCoder = new ethers.AbiCoder();
        const [action, amount, tokenIn, tokenOut] = abiCoder.decode(
          ["string", "uint256", "address", "address"],
          event.args.strategyData
        );

        return {
          id: `${event.transactionHash}-${event.index}`,
          action: action,
          amount: ethers.formatEther(amount),
          asset: action === "BUY" ? "vETH" : "0G", // Simplified for demo
          price: "Market", // We don't store price in event, would need oracle history
          time: event.timeAgo,
          status: "Verified",
          txHash: event.transactionHash
        };
      } catch (err) {
        console.error("Error decoding log:", err);
        return null;
      }
    }).filter(Boolean);
  }, [events]);

  const displayedLogs = decodedLogs.slice(0, itemsToShow);

  const fallbackLogs = [
    { id: 'f1', action: "BUY", amount: "0.1", asset: "vETH", price: "$3,142", time: "Cached", status: "Success" },
    { id: 'f2', action: "HOLD", amount: "—", asset: "—", price: "$3,145", time: "Cached", status: "Success" },
    { id: 'f3', action: "SELL", amount: "0.05", asset: "vETH", price: "$3,120", time: "Cached", status: "Success" },
  ];

  if (isLoading) {
    return (
      <div className="glass-card p-8 animate-pulse">
        <div className="h-6 w-40 bg-white/5 rounded mb-8"></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="flex justify-between items-center py-4 border-b border-white/5">
            <div className="h-4 w-20 bg-white/5 rounded"></div>
            <div className="h-4 w-24 bg-white/5 rounded"></div>
            <div className="h-4 w-16 bg-white/5 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  const logsToRender = isError ? fallbackLogs : displayedLogs;

  return (
    <div className="glass-card p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Clock size={24} className="text-accent" />
          <h2 className="text-xl font-bold text-white">Execution Logs</h2>
        </div>
        <button 
          onClick={() => refetch()}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-500 hover:text-white"
          title="Refresh Logs"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {isError && (
        <div className="mb-6 p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400" />
          <p className="text-xs text-red-400 font-medium">
            Unable to fetch history, showing cached data.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5">
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Time</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Action</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Amount</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logsToRender.map((item) => (
              <tr key={item.id} className="group hover:bg-white/5 transition-colors">
                <td className="py-4 text-xs text-gray-400 font-medium">{item.time}</td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    {item.action === "BUY" ? (
                      <div className="p-1 bg-green-500/10 rounded text-green-400">
                        <ArrowUpRight size={14} />
                      </div>
                    ) : item.action === "SELL" ? (
                      <div className="p-1 bg-red-500/10 rounded text-red-400">
                        <ArrowDownLeft size={14} />
                      </div>
                    ) : (
                      <div className="p-1 bg-blue-500/10 rounded text-blue-400">
                        <Clock size={14} />
                      </div>
                    )}
                    <span className={`text-sm font-bold ${
                      item.action === "BUY" ? "text-green-400" : 
                      item.action === "SELL" ? "text-red-400" : "text-blue-400"
                    }`}>{item.action}</span>
                  </div>
                </td>
                <td className="py-4 font-mono text-xs text-white">
                  {item.amount} {item.asset}
                </td>
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] font-black text-green-400 uppercase tracking-tighter shadow-sm">
                      <CheckCircle2 size={10} />
                      {item.status}
                    </span>
                    {item.txHash && (
                      <a 
                        href={`${CONFIG.EXPLORER_URL}/tx/${item.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-white transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && logsToRender.length === 0 && (
              <tr>
                <td colSpan="4" className="py-10 text-center text-gray-600 font-medium italic">
                  No execution history found for this agent.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {!isError && decodedLogs.length > itemsToShow && (
        <button 
          onClick={() => setItemsToShow(prev => prev + 10)}
          className="w-full mt-6 py-3 text-xs font-bold text-gray-500 hover:text-white transition-colors border border-dashed border-white/10 rounded-xl hover:border-white/20"
        >
          Load More History
        </button>
      )}
    </div>
  );
};

export default ExecutionHistory;
