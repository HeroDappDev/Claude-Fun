import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { CurveType, CurveTypeValue, TradeQuote, calculatePrice } from '@shared/schema';

// RPC endpoint - fetched from server config to use premium RPC
let cachedRpcEndpoint: string | null = null;
let cachedWssEndpoint: string | null = null;

// Fetch RPC config from server
async function fetchRpcConfig(): Promise<{ rpc: string; wss: string }> {
  try {
    const response = await fetch('/api/config/rpc');
    if (response.ok) {
      const data = await response.json();
      return {
        rpc: data.rpcUrl || 'https://api.mainnet-beta.solana.com',
        wss: data.wssUrl || 'wss://api.mainnet-beta.solana.com',
      };
    }
  } catch (e) {
    console.warn('Failed to fetch RPC config, using default');
  }
  return {
    rpc: 'https://api.mainnet-beta.solana.com',
    wss: 'wss://api.mainnet-beta.solana.com',
  };
}

// Initialize RPC endpoints (call this early in app startup)
export async function initializeRpcEndpoints(): Promise<void> {
  const config = await fetchRpcConfig();
  cachedRpcEndpoint = config.rpc;
  cachedWssEndpoint = config.wss;
}

// Use environment variable for RPC endpoint with fallback
export const SOLANA_RPC_ENDPOINT = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const SOLANA_WSS_ENDPOINT = import.meta.env.VITE_SOLANA_WSS_URL || 'wss://api.mainnet-beta.solana.com';

// Get the current RPC endpoint (uses cached value if available)
export function getRpcEndpoint(): string {
  return cachedRpcEndpoint || SOLANA_RPC_ENDPOINT;
}

export function getWssEndpoint(): string {
  return cachedWssEndpoint || SOLANA_WSS_ENDPOINT;
}

// Create connection instance
export const connection = new Connection(SOLANA_RPC_ENDPOINT, {
  commitment: 'confirmed',
  wsEndpoint: SOLANA_WSS_ENDPOINT,
});

// Raydium LaunchLab program ID (mainnet)
export const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');

// Platform treasury wallet for fee collection
export const PLATFORM_TREASURY = new PublicKey('8kt95geX4dXzVzeEdBBYzxM1XD27dSgaXUD85fEss2Di');

// Platform fee: 0.25% on all trades
export const PLATFORM_FEE_BPS = 25; // 0.25% = 25 basis points
export const PLATFORM_FEE_RATE = 0.0025; // 0.25%

// Default launch parameters
export const DEFAULT_TOTAL_SUPPLY = new BN('1000000000000000000'); // 1 billion with 9 decimals
export const DEFAULT_FUNDRAISING_TARGET = 85; // 85 SOL

// Bonding curve parameters calibrated for:
// - 1 SOL at supply=0 should get exactly 34,200,000 tokens (3.42% of 1B supply)
// - Full curve integrates to ~85 SOL for the entire 1B supply
// Math: cost = initialPrice * T + 0.5 * slope * T^2
// Adjusted for 0.25% platform fee: net SOL = 0.9975, so initialPrice = 0.9975/34.2M
export const DEFAULT_INITIAL_PRICE = 0.0000000292; // 2.92e-8 SOL/token → 1 SOL (net 0.9975) gets 34.2M tokens
export const DEFAULT_CURVE_SLOPE = 0; // Pure linear: fixed price for simplicity, 85 SOL = full supply

// Utility functions
export const shortenAddress = (address: string, chars = 4): string => {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

export const formatSOL = (lamports: number): string => {
  return new Decimal(lamports).div(LAMPORTS_PER_SOL).toFixed(4);
};

export const formatNumber = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
};

export const formatAge = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
};

// Calculate tokens received for SOL input
export const calculateBuyQuote = (
  solAmount: number,
  currentSupply: number,
  curveType: CurveTypeValue,
  slope: number,
  initialPrice: number
): TradeQuote => {
  const solDecimal = new Decimal(solAmount);
  let tokensOut = new Decimal(0);
  let remainingSol = solDecimal;
  let supply = new Decimal(currentSupply);
  const step = new Decimal(1000000); // Small steps for accuracy
  
  // Simulate buying in small steps
  while (remainingSol.gt(0)) {
    const currentPrice = new Decimal(calculatePrice(supply.toNumber(), curveType, slope, initialPrice));
    const tokensToBuy = Decimal.min(step, remainingSol.div(currentPrice));
    const cost = tokensToBuy.mul(currentPrice);
    
    if (cost.gt(remainingSol)) break;
    
    tokensOut = tokensOut.add(tokensToBuy);
    remainingSol = remainingSol.sub(cost);
    supply = supply.add(tokensToBuy);
  }
  
  const avgPrice = solDecimal.div(tokensOut).toNumber();
  const finalPrice = calculatePrice(supply.toNumber(), curveType, slope, initialPrice);
  const priceImpact = ((finalPrice - initialPrice) / initialPrice) * 100;
  
  return {
    inputAmount: solAmount,
    outputAmount: tokensOut.toNumber(),
    priceImpact,
    fee: solAmount * PLATFORM_FEE_RATE, // 0.25% platform fee
    averagePrice: avgPrice,
  };
};

// Calculate SOL received for token input
export const calculateSellQuote = (
  tokenAmount: number,
  currentSupply: number,
  curveType: CurveTypeValue,
  slope: number,
  initialPrice: number
): TradeQuote => {
  const tokensDecimal = new Decimal(tokenAmount);
  let solOut = new Decimal(0);
  let remainingTokens = tokensDecimal;
  let supply = new Decimal(currentSupply);
  const step = new Decimal(1000000);
  
  while (remainingTokens.gt(0) && supply.gt(0)) {
    const tokensToSell = Decimal.min(step, remainingTokens);
    const currentPrice = new Decimal(calculatePrice(supply.toNumber(), curveType, slope, initialPrice));
    const proceeds = tokensToSell.mul(currentPrice);
    
    solOut = solOut.add(proceeds);
    remainingTokens = remainingTokens.sub(tokensToSell);
    supply = supply.sub(tokensToSell);
  }
  
  const avgPrice = solOut.div(tokensDecimal).toNumber();
  const finalPrice = calculatePrice(supply.toNumber(), curveType, slope, initialPrice);
  const priceImpact = Math.abs(((finalPrice - initialPrice) / initialPrice) * 100);
  
  return {
    inputAmount: tokenAmount,
    outputAmount: solOut.toNumber() * (1 - PLATFORM_FEE_RATE), // After 0.25% platform fee
    priceImpact,
    fee: solOut.toNumber() * PLATFORM_FEE_RATE, // 0.25% platform fee
    averagePrice: avgPrice,
  };
};

// Get SOL balance for wallet
export const getBalance = async (publicKey: PublicKey): Promise<number> => {
  try {
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0;
  }
};

// Validate Solana address
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

// Get recent blockhash for transaction
export const getRecentBlockhash = async () => {
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    return { blockhash, lastValidBlockHeight };
  } catch (error) {
    console.error('Error getting blockhash:', error);
    throw error;
  }
};

// Confirm transaction
export const confirmTransaction = async (
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<boolean> => {
  try {
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    return !confirmation.value.err;
  } catch (error) {
    console.error('Error confirming transaction:', error);
    return false;
  }
};
