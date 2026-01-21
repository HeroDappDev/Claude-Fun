import { useQuery } from '@tanstack/react-query';

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

export interface DexScreenerData {
  pairs: DexScreenerPair[] | null;
  schemaVersion: string;
}

async function fetchDexScreenerData(mintAddress: string): Promise<DexScreenerData | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
    
    if (!response.ok) {
      console.warn('DexScreener API returned non-OK status:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data as DexScreenerData;
  } catch (error) {
    console.error('Error fetching DexScreener data:', error);
    return null;
  }
}

export function useDexScreener(mintAddress: string | undefined, options?: { refetchInterval?: number }) {
  const query = useQuery<DexScreenerData | null>({
    queryKey: ['dexscreener', mintAddress],
    queryFn: () => mintAddress ? fetchDexScreenerData(mintAddress) : Promise.resolve(null),
    enabled: !!mintAddress,
    refetchInterval: options?.refetchInterval || 10000,
    staleTime: 5000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  // Select the best pair: prefer Raydium, then highest liquidity
  const selectBestPair = (pairs: DexScreenerPair[] | null): DexScreenerPair | null => {
    if (!pairs || pairs.length === 0) return null;
    
    // First, try to find a Raydium pair
    const raydiumPair = pairs.find(p => p.dexId === 'raydium');
    if (raydiumPair) return raydiumPair;
    
    // Otherwise, pick the pair with highest liquidity
    const sortedByLiquidity = [...pairs].sort((a, b) => {
      const aLiq = a.liquidity?.usd || 0;
      const bLiq = b.liquidity?.usd || 0;
      return bLiq - aLiq;
    });
    
    return sortedByLiquidity[0] || null;
  };

  const primaryPair = selectBestPair(query.data?.pairs || null);

  return {
    ...query,
    primaryPair,
    priceUsd: primaryPair?.priceUsd ? parseFloat(primaryPair.priceUsd) : null,
    priceNative: primaryPair?.priceNative ? parseFloat(primaryPair.priceNative) : null,
    marketCap: primaryPair?.marketCap || primaryPair?.fdv || null,
    volume24h: primaryPair?.volume?.h24 || null,
    liquidity: primaryPair?.liquidity?.usd || null,
    priceChange24h: primaryPair?.priceChange?.h24 || null,
    txns24h: primaryPair?.txns?.h24 || null,
    dexScreenerUrl: primaryPair?.url || `https://dexscreener.com/solana/${mintAddress}`,
    pairAddress: primaryPair?.pairAddress || null,
    hasPair: !!primaryPair,
  };
}

export function getDexScreenerChartUrl(mintAddress: string): string {
  return `https://dexscreener.com/solana/${mintAddress}?embed=1&theme=dark&trades=0&info=0`;
}

export function getDexScreenerUrl(mintAddress: string): string {
  return `https://dexscreener.com/solana/${mintAddress}`;
}
