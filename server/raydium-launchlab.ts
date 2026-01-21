import { 
  Connection, 
  PublicKey, 
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import {
  LAUNCHPAD_PROGRAM,
  getPdaLaunchpadPoolId,
} from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_WSS_URL = process.env.SOLANA_WSS_URL;

export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: SOLANA_WSS_URL,
});

export const PLATFORM_TREASURY = new PublicKey('8kt95geX4dXzVzeEdBBYzxM1XD27dSgaXUD85fEss2Di');
export const PLATFORM_FEE_BPS = 25;
export const PLATFORM_FEE_RATE = 0.0025;
export const DEFAULT_FUNDRAISING_TARGET = 85;

export interface OnChainPoolState {
  exists: boolean;
  poolId: string;
  realTokenReserves: string;
  realSolReserves: string;
  virtualTokenReserves: string;
  virtualSolReserves: string;
  curveType: number;
  status: 'trading' | 'graduated' | 'unknown';
}

const onChainPoolCache = new Map<string, { data: OnChainPoolState | null; timestamp: number }>();
const CACHE_TTL_MS = 10000;

export interface LaunchpadPoolInfo {
  poolId: string;
  mintA: string;
  mintB: string;
  virtualA: string;
  virtualB: string;
  realA: string;
  realB: string;
  configInfo: {
    curveType: number;
    tradeFeeRate: number;
  };
  platformId: string;
  status: 'trading' | 'graduated';
  currentRaised: number;
  targetRaised: number;
}

export async function getLaunchpadPoolId(mintAddress: string): Promise<string> {
  const mintA = new PublicKey(mintAddress);
  const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
  return poolId.toBase58();
}

export async function fetchOnChainPoolState(mintAddress: string): Promise<OnChainPoolState | null> {
  const cacheKey = mintAddress;
  const cached = onChainPoolCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const mintA = new PublicKey(mintAddress);
    const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
    
    const poolAccount = await connection.getAccountInfo(poolId);
    
    if (!poolAccount) {
      const result: OnChainPoolState = {
        exists: false,
        poolId: poolId.toBase58(),
        realTokenReserves: '0',
        realSolReserves: '0',
        virtualTokenReserves: '0',
        virtualSolReserves: '0',
        curveType: 0,
        status: 'unknown',
      };
      onChainPoolCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
    
    const data = poolAccount.data;
    const result: OnChainPoolState = {
      exists: true,
      poolId: poolId.toBase58(),
      realTokenReserves: '0',
      realSolReserves: '0',
      virtualTokenReserves: '0',
      virtualSolReserves: '0',
      curveType: 0,
      status: 'trading',
    };
    
    if (data.length >= 200) {
      try {
        const realSolReserves = new BN(data.slice(64, 72), 'le');
        const realTokenReserves = new BN(data.slice(72, 80), 'le');
        const virtualSolReserves = new BN(data.slice(80, 88), 'le');
        const virtualTokenReserves = new BN(data.slice(88, 96), 'le');
        
        result.realSolReserves = realSolReserves.toString();
        result.realTokenReserves = realTokenReserves.toString();
        result.virtualSolReserves = virtualSolReserves.toString();
        result.virtualTokenReserves = virtualTokenReserves.toString();
        
        const statusByte = data[8];
        result.status = statusByte === 2 ? 'graduated' : 'trading';
        
        const curveTypeByte = data[9];
        result.curveType = curveTypeByte;
      } catch (decodeError) {
        console.warn('Failed to decode pool data, using defaults:', decodeError);
      }
    }
    
    onChainPoolCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error('Error fetching on-chain pool state:', error);
    onChainPoolCache.set(cacheKey, { data: null, timestamp: Date.now() });
    return null;
  }
}

export async function getPoolInfo(mintAddress: string): Promise<LaunchpadPoolInfo | null> {
  try {
    const onChainState = await fetchOnChainPoolState(mintAddress);
    
    if (!onChainState) {
      return null;
    }
    
    const currentRaised = onChainState.exists 
      ? parseFloat(onChainState.realSolReserves) / LAMPORTS_PER_SOL
      : 0;
    const targetRaised = DEFAULT_FUNDRAISING_TARGET;
    
    return {
      poolId: onChainState.poolId,
      mintA: mintAddress,
      mintB: NATIVE_MINT.toBase58(),
      virtualA: onChainState.virtualTokenReserves,
      virtualB: onChainState.virtualSolReserves,
      realA: onChainState.realTokenReserves,
      realB: onChainState.realSolReserves,
      configInfo: {
        curveType: onChainState.curveType,
        tradeFeeRate: PLATFORM_FEE_BPS * 100,
      },
      platformId: PLATFORM_TREASURY.toBase58(),
      status: onChainState.status === 'graduated' ? 'graduated' : 'trading',
      currentRaised,
      targetRaised,
    };
  } catch (error) {
    console.error('Error getting pool info:', error);
    return null;
  }
}

export function calculateBuyPrice(
  currentRaised: number,
  solAmount: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = 1_000_000_000,
  targetRaised: number = 85
): { tokensOut: number; priceImpact: number; fee: number } {
  const fee = solAmount * PLATFORM_FEE_RATE;
  const netSolAmount = solAmount - fee;
  
  const progress = currentRaised / targetRaised;
  const tokensAvailable = totalSupply * 0.8;
  const tokensSold = tokensAvailable * progress;
  const tokensRemaining = tokensAvailable - tokensSold;
  
  let tokensOut: number;
  let priceImpact: number;
  
  const initialPrice = targetRaised / tokensAvailable;
  
  switch (curveType) {
    case 'linear': {
      const slope = initialPrice * 0.5;
      const currentPrice = initialPrice + slope * progress;
      const endProgress = (currentRaised + netSolAmount) / targetRaised;
      const endPrice = initialPrice + slope * endProgress;
      const avgPrice = (currentPrice + endPrice) / 2;
      tokensOut = netSolAmount / avgPrice;
      priceImpact = ((endPrice - currentPrice) / currentPrice) * 100;
      break;
    }
    case 'exponential': {
      const rate = 2;
      const currentPrice = initialPrice * Math.pow(1 + rate, progress);
      const endProgress = (currentRaised + netSolAmount) / targetRaised;
      const endPrice = initialPrice * Math.pow(1 + rate, endProgress);
      tokensOut = netSolAmount / ((currentPrice + endPrice) / 2);
      priceImpact = ((endPrice - currentPrice) / currentPrice) * 100;
      break;
    }
    case 'logarithmic': {
      const multiplier = 10;
      const currentPrice = initialPrice * (1 + multiplier * Math.log(1 + progress));
      const endProgress = (currentRaised + netSolAmount) / targetRaised;
      const endPrice = initialPrice * (1 + multiplier * Math.log(1 + endProgress));
      tokensOut = netSolAmount / ((currentPrice + endPrice) / 2);
      priceImpact = ((endPrice - currentPrice) / currentPrice) * 100;
      break;
    }
    default:
      tokensOut = netSolAmount / initialPrice;
      priceImpact = 0;
  }
  
  tokensOut = Math.min(tokensOut, tokensRemaining);
  
  return {
    tokensOut: Math.floor(tokensOut),
    priceImpact: Math.min(priceImpact, 100),
    fee,
  };
}

export function calculateSellPrice(
  currentRaised: number,
  tokenAmount: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = 1_000_000_000,
  targetRaised: number = 85
): { solOut: number; priceImpact: number; fee: number } {
  const progress = currentRaised / targetRaised;
  const tokensAvailable = totalSupply * 0.8;
  const tokensSold = tokensAvailable * progress;
  
  const initialPrice = targetRaised / tokensAvailable;
  
  let grossSolOut: number;
  let priceImpact: number;
  
  switch (curveType) {
    case 'linear': {
      const slope = initialPrice * 0.5;
      const currentPrice = initialPrice + slope * progress;
      const tokensSoldAfter = tokensSold - tokenAmount;
      const endProgress = tokensSoldAfter / tokensAvailable;
      const endPrice = initialPrice + slope * endProgress;
      const avgPrice = (currentPrice + endPrice) / 2;
      grossSolOut = tokenAmount * avgPrice;
      priceImpact = ((currentPrice - endPrice) / currentPrice) * 100;
      break;
    }
    case 'exponential': {
      const rate = 2;
      const currentPrice = initialPrice * Math.pow(1 + rate, progress);
      const tokensSoldAfter = tokensSold - tokenAmount;
      const endProgress = tokensSoldAfter / tokensAvailable;
      const endPrice = initialPrice * Math.pow(1 + rate, endProgress);
      grossSolOut = tokenAmount * ((currentPrice + endPrice) / 2);
      priceImpact = ((currentPrice - endPrice) / currentPrice) * 100;
      break;
    }
    case 'logarithmic': {
      const multiplier = 10;
      const currentPrice = initialPrice * (1 + multiplier * Math.log(1 + progress));
      const tokensSoldAfter = tokensSold - tokenAmount;
      const endProgress = tokensSoldAfter / tokensAvailable;
      const endPrice = initialPrice * (1 + multiplier * Math.log(1 + endProgress));
      grossSolOut = tokenAmount * ((currentPrice + endPrice) / 2);
      priceImpact = ((currentPrice - endPrice) / currentPrice) * 100;
      break;
    }
    default:
      grossSolOut = tokenAmount * initialPrice;
      priceImpact = 0;
  }
  
  grossSolOut = Math.min(grossSolOut, currentRaised);
  
  const fee = grossSolOut * PLATFORM_FEE_RATE;
  const solOut = grossSolOut - fee;
  
  return {
    solOut: Math.max(solOut, 0),
    priceImpact: Math.min(Math.abs(priceImpact), 100),
    fee,
  };
}

export function getCurrentPrice(
  currentRaised: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = 1_000_000_000,
  targetRaised: number = 85
): number {
  const progress = currentRaised / targetRaised;
  const tokensAvailable = totalSupply * 0.8;
  const initialPrice = targetRaised / tokensAvailable;
  
  switch (curveType) {
    case 'linear': {
      const slope = initialPrice * 0.5;
      return initialPrice + slope * progress;
    }
    case 'exponential': {
      const rate = 2;
      return initialPrice * Math.pow(1 + rate, progress);
    }
    case 'logarithmic': {
      const multiplier = 10;
      return initialPrice * (1 + multiplier * Math.log(1 + progress));
    }
    default:
      return initialPrice;
  }
}

export async function verifyPoolExists(mintAddress: string): Promise<boolean> {
  try {
    const mintA = new PublicKey(mintAddress);
    const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
    const poolAccount = await connection.getAccountInfo(poolId);
    return poolAccount !== null;
  } catch {
    return false;
  }
}

export async function getRecentBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  return await connection.getLatestBlockhash('confirmed');
}

export interface QuoteResult {
  amountIn: number;
  amountOut: number;
  fee: number;
  priceImpact: number;
  currentPrice: number;
  newPrice: number;
}

export function getBuyQuote(
  solAmount: number,
  currentRaised: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = 1_000_000_000,
  targetRaised: number = 85
): QuoteResult {
  const result = calculateBuyPrice(currentRaised, solAmount, curveType, totalSupply, targetRaised);
  const currentPrice = getCurrentPrice(currentRaised, curveType, totalSupply, targetRaised);
  const newRaised = currentRaised + solAmount - result.fee;
  const newPrice = getCurrentPrice(newRaised, curveType, totalSupply, targetRaised);
  
  return {
    amountIn: solAmount,
    amountOut: result.tokensOut,
    fee: result.fee,
    priceImpact: result.priceImpact,
    currentPrice,
    newPrice,
  };
}

export function getSellQuote(
  tokenAmount: number,
  currentRaised: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = 1_000_000_000,
  targetRaised: number = 85
): QuoteResult {
  const result = calculateSellPrice(currentRaised, tokenAmount, curveType, totalSupply, targetRaised);
  const currentPrice = getCurrentPrice(currentRaised, curveType, totalSupply, targetRaised);
  const newRaised = currentRaised - result.solOut - result.fee;
  const newPrice = getCurrentPrice(Math.max(0, newRaised), curveType, totalSupply, targetRaised);
  
  return {
    amountIn: tokenAmount,
    amountOut: result.solOut,
    fee: result.fee,
    priceImpact: result.priceImpact,
    currentPrice,
    newPrice,
  };
}

export default {
  connection,
  LAUNCHPAD_PROGRAM,
  PLATFORM_TREASURY,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_RATE,
  DEFAULT_FUNDRAISING_TARGET,
  getLaunchpadPoolId,
  fetchOnChainPoolState,
  getPoolInfo,
  calculateBuyPrice,
  calculateSellPrice,
  getCurrentPrice,
  verifyPoolExists,
  getRecentBlockhash,
  getBuyQuote,
  getSellQuote,
};
