import { useQuery } from '@tanstack/react-query';
import { fetchPoolInfo, LaunchLabPoolInfo, DEFAULT_DECIMALS } from '@/lib/launchlab';

async function fetchSolPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana?.usd || 0;
  } catch {
    return 0;
  }
}

export interface RaydiumPoolData {
  poolId: string;
  totalRaised: number;
  totalSold: number;
  currentPrice: number;
  marketCapSol: number;
  marketCapUsd: number;
  solPrice: number;
  progress: number;
  status: 'trading' | 'graduated';
  curveType: number;
}

function calculatePriceFromPool(pool: LaunchLabPoolInfo): number {
  const virtualA = BigInt(pool.virtualA);
  const virtualB = BigInt(pool.virtualB);
  
  if (virtualA === BigInt(0)) return 0;
  
  // virtualB is in lamports (SOL * 10^9)
  // virtualA is in token base units (tokens * 10^decimals)
  // Price = (virtualB / 10^9) / (virtualA / 10^decimals) = SOL per token
  const solReserves = Number(virtualB) / 1e9;
  const tokenReserves = Number(virtualA) / Math.pow(10, DEFAULT_DECIMALS);
  
  return tokenReserves > 0 ? solReserves / tokenReserves : 0;
}

function calculateMarketCapSol(price: number, totalSupply: number): number {
  // Market cap in SOL = price (SOL/token) × total supply
  return price * totalSupply;
}

export function useRaydiumPool(
  mintAddress: string | undefined, 
  totalSupply: number = 1_000_000_000,
  fundraisingTarget: number = 85,
  options?: { refetchInterval?: number }
) {
  const query = useQuery<RaydiumPoolData | null>({
    queryKey: ['raydium-pool', mintAddress],
    queryFn: async () => {
      if (!mintAddress) return null;
      
      const [poolInfo, solPrice] = await Promise.all([
        fetchPoolInfo(mintAddress),
        fetchSolPrice(),
      ]);
      
      if (!poolInfo) return null;
      
      const currentPrice = calculatePriceFromPool(poolInfo);
      const marketCapSol = calculateMarketCapSol(currentPrice, totalSupply);
      const marketCapUsd = marketCapSol * solPrice;
      const progress = (poolInfo.totalRaised / fundraisingTarget) * 100;
      
      return {
        poolId: poolInfo.poolId,
        totalRaised: poolInfo.totalRaised,
        totalSold: poolInfo.totalSold,
        currentPrice,
        marketCapSol,
        marketCapUsd,
        solPrice,
        progress: Math.min(progress, 100),
        status: poolInfo.status,
        curveType: poolInfo.curveType,
      };
    },
    enabled: !!mintAddress,
    refetchInterval: options?.refetchInterval || 15000,
    staleTime: 10000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    poolData: query.data,
    hasPool: !!query.data,
  };
}
