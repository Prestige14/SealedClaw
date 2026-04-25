import React from 'react';
import { CheckCircle2, XCircle, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';

const ExecutionHistory = () => {
  const history = [
    { id: 1, action: "BUY", amount: "0.1", asset: "vETH", price: "$3,142", time: "12m ago", status: "Success" },
    { id: 2, action: "HOLD", amount: "—", asset: "—", price: "$3,145", time: "45m ago", status: "Success" },
    { id: 3, action: "SELL", amount: "0.05", asset: "vETH", price: "$3,120", time: "2h ago", status: "Success" },
    { id: 4, action: "BUY", amount: "0.2", asset: "vETH", price: "$3,080", time: "5h ago", status: "Success" },
  ];

  return (
    <div className="glass-card p-8">
      <div className="flex items-center gap-3 mb-8">
        <Clock size={24} className="text-accent" />
        <h2 className="text-xl font-bold text-white">Execution Logs</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5">
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Time</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Action</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Amount</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Price</th>
              <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {history.map((item) => (
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
                <td className="py-4 font-mono text-xs text-white">{item.amount} {item.asset}</td>
                <td className="py-4 font-mono text-xs text-gray-300">{item.price}</td>
                <td className="py-4 text-right">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] font-black text-green-400 uppercase tracking-tighter shadow-sm">
                    <CheckCircle2 size={10} />
                    Verified
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <button className="w-full mt-6 py-3 text-xs font-bold text-gray-500 hover:text-white transition-colors border border-dashed border-white/10 rounded-xl hover:border-white/20">
        View Full History on 0G Explorer
      </button>
    </div>
  );
};

export default ExecutionHistory;
