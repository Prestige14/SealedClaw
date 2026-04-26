import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { CONFIG } from '../config';

export function useContractEvents(contract, eventName, fromBlock = 0, filterArgs = {}) {
  const contractAddress = contract?.target || contract?.address;

  return useQuery({
    queryKey: ['contractEvents', contractAddress, eventName, fromBlock, JSON.stringify(filterArgs, (key, value) => typeof value === 'bigint' ? value.toString() : value)],
    queryFn: async () => {
      if (!contract) return [];

      console.log(`Fetching events: ${eventName} from block ${fromBlock}`);
      
      const filter = contract.filters[eventName](...Object.values(filterArgs));
      const logs = await contract.queryFilter(filter, fromBlock, 'latest');

      // Sort by block number descending (newest first)
      const sortedLogs = [...logs].sort((a, b) => b.blockNumber - a.blockNumber);

      const eventsWithTime = await Promise.all(
        sortedLogs.map(async (log) => {
          const block = await log.getBlock();
          return {
            ...log,
            timestamp: block.timestamp,
            timeAgo: getTimeAgo(block.timestamp)
          };
        })
      );

      return eventsWithTime;
    },
    enabled: !!contract && !!eventName,
    staleTime: 30000, // 30 seconds
    retry: 2,
    retryDelay: (attempt) => Math.pow(2, attempt) * 1000,
  });
}

function getTimeAgo(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
