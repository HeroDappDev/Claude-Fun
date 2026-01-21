import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';

const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
});

export const LAUNCHPAD_PROGRAM = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
export const DEV_LAUNCHPAD_PROGRAM = new PublicKey('DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6');

export const PLATFORM_TREASURY = new PublicKey('8kt95geX4dXzVzeEdBBYzxM1XD27dSgaXUD85fEss2Di');

export const DEFAULT_FUNDRAISING_TARGET = 85;
export const DEFAULT_TOTAL_SUPPLY = 1_000_000_000;
export const DEFAULT_DECIMALS = 6;

export interface LaunchLabPoolInfo {
  poolId: string;
  mintA: string;
  mintB: string;
  virtualA: string;
  virtualB: string;
  realA: string;
  realB: string;
  totalRaised: number;
  totalSold: number;
  curveType: number;
  status: 'trading' | 'graduated';
  fundraisingTarget: number;
}

export interface TradeQuote {
  amountIn: number;
  amountOut: number;
  fee: number;
  priceImpact: number;
  minAmountOut: number;
}

function getPdaLaunchpadPoolId(
  programId: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey
): { publicKey: PublicKey; bump: number } {
  const [publicKey, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    programId
  );
  return { publicKey, bump };
}

export async function getPoolId(mintAddress: string): Promise<string> {
  const mintA = new PublicKey(mintAddress);
  const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
  return poolId.toBase58();
}

export async function fetchPoolInfo(mintAddress: string): Promise<LaunchLabPoolInfo | null> {
  try {
    const mintA = new PublicKey(mintAddress);
    const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
    
    const poolAccount = await connection.getAccountInfo(poolId);
    
    if (!poolAccount) {
      return null;
    }

    const data = poolAccount.data;
    
    let realA = new BN(0);
    let realB = new BN(0);
    let virtualA = new BN(0);
    let virtualB = new BN(0);
    let curveType = 0;
    let status: 'trading' | 'graduated' = 'trading';

    if (data.length >= 200) {
      try {
        realB = new BN(data.slice(64, 72), 'le');
        realA = new BN(data.slice(72, 80), 'le');
        virtualB = new BN(data.slice(80, 88), 'le');
        virtualA = new BN(data.slice(88, 96), 'le');
        
        const statusByte = data[8];
        status = statusByte === 2 ? 'graduated' : 'trading';
        
        curveType = data[9] || 0;
      } catch (e) {
        console.warn('Failed to decode pool data:', e);
      }
    }

    return {
      poolId: poolId.toBase58(),
      mintA: mintAddress,
      mintB: NATIVE_MINT.toBase58(),
      virtualA: virtualA.toString(),
      virtualB: virtualB.toString(),
      realA: realA.toString(),
      realB: realB.toString(),
      totalRaised: realB.toNumber() / LAMPORTS_PER_SOL,
      totalSold: realA.toNumber() / Math.pow(10, DEFAULT_DECIMALS),
      curveType,
      status,
      fundraisingTarget: DEFAULT_FUNDRAISING_TARGET,
    };
  } catch (error) {
    console.error('Error fetching pool info:', error);
    return null;
  }
}

export function calculateBuyQuote(
  solAmount: number,
  currentRaised: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = DEFAULT_TOTAL_SUPPLY,
  targetRaised: number = DEFAULT_FUNDRAISING_TARGET
): TradeQuote {
  const slippage = 0.01;
  const feeRate = 0.0025;
  
  const tokensAvailable = totalSupply * 0.8;
  const progress = currentRaised / targetRaised;
  const tokensSold = progress * tokensAvailable;
  const initialPrice = targetRaised / tokensAvailable;
  
  let tokensOut = 0;
  let priceImpact = 0;

  const netSolAmount = solAmount * (1 - feeRate);
  
  switch (curveType) {
    case 'linear': {
      const slope = initialPrice * 0.5;
      const currentPrice = initialPrice + slope * progress;
      const endRaised = currentRaised + netSolAmount;
      const endProgress = endRaised / targetRaised;
      const endPrice = initialPrice + slope * endProgress;
      const avgPrice = (currentPrice + endPrice) / 2;
      tokensOut = netSolAmount / avgPrice;
      priceImpact = ((endPrice - currentPrice) / currentPrice) * 100;
      break;
    }
    case 'exponential': {
      const rate = 2;
      const currentPrice = initialPrice * Math.pow(1 + rate, progress);
      const endRaised = currentRaised + netSolAmount;
      const endProgress = endRaised / targetRaised;
      const endPrice = initialPrice * Math.pow(1 + rate, endProgress);
      tokensOut = netSolAmount / ((currentPrice + endPrice) / 2);
      priceImpact = ((endPrice - currentPrice) / currentPrice) * 100;
      break;
    }
    case 'logarithmic': {
      const multiplier = 10;
      const currentPrice = initialPrice * (1 + multiplier * Math.log(1 + progress));
      const endRaised = currentRaised + netSolAmount;
      const endProgress = endRaised / targetRaised;
      const endPrice = initialPrice * (1 + multiplier * Math.log(1 + endProgress));
      tokensOut = netSolAmount / ((currentPrice + endPrice) / 2);
      priceImpact = ((endPrice - currentPrice) / currentPrice) * 100;
      break;
    }
    default:
      tokensOut = netSolAmount / initialPrice;
      priceImpact = 0;
  }

  const fee = solAmount * feeRate;
  const minAmountOut = tokensOut * (1 - slippage);

  return {
    amountIn: solAmount,
    amountOut: tokensOut,
    fee,
    priceImpact: Math.min(Math.abs(priceImpact), 100),
    minAmountOut,
  };
}

export function calculateSellQuote(
  tokenAmount: number,
  currentRaised: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = DEFAULT_TOTAL_SUPPLY,
  targetRaised: number = DEFAULT_FUNDRAISING_TARGET
): TradeQuote {
  const slippage = 0.01;
  const feeRate = 0.0025;
  
  const tokensAvailable = totalSupply * 0.8;
  const progress = currentRaised / targetRaised;
  const tokensSold = progress * tokensAvailable;
  const initialPrice = targetRaised / tokensAvailable;
  
  let solOut = 0;
  let priceImpact = 0;

  switch (curveType) {
    case 'linear': {
      const slope = initialPrice * 0.5;
      const currentPrice = initialPrice + slope * progress;
      const tokensSoldAfter = tokensSold - tokenAmount;
      const endProgress = tokensSoldAfter / tokensAvailable;
      const endPrice = initialPrice + slope * endProgress;
      const avgPrice = (currentPrice + endPrice) / 2;
      solOut = tokenAmount * avgPrice;
      priceImpact = ((currentPrice - endPrice) / currentPrice) * 100;
      break;
    }
    case 'exponential': {
      const rate = 2;
      const currentPrice = initialPrice * Math.pow(1 + rate, progress);
      const tokensSoldAfter = tokensSold - tokenAmount;
      const endProgress = tokensSoldAfter / tokensAvailable;
      const endPrice = initialPrice * Math.pow(1 + rate, endProgress);
      solOut = tokenAmount * ((currentPrice + endPrice) / 2);
      priceImpact = ((currentPrice - endPrice) / currentPrice) * 100;
      break;
    }
    case 'logarithmic': {
      const multiplier = 10;
      const currentPrice = initialPrice * (1 + multiplier * Math.log(1 + progress));
      const tokensSoldAfter = tokensSold - tokenAmount;
      const endProgress = tokensSoldAfter / tokensAvailable;
      const endPrice = initialPrice * (1 + multiplier * Math.log(1 + endProgress));
      solOut = tokenAmount * ((currentPrice + endPrice) / 2);
      priceImpact = ((currentPrice - endPrice) / currentPrice) * 100;
      break;
    }
    default:
      solOut = tokenAmount * initialPrice;
      priceImpact = 0;
  }

  solOut = Math.min(solOut, currentRaised);
  const fee = solOut * feeRate;
  const netSolOut = solOut - fee;
  const minAmountOut = netSolOut * (1 - slippage);

  return {
    amountIn: tokenAmount,
    amountOut: Math.max(netSolOut, 0),
    fee,
    priceImpact: Math.min(Math.abs(priceImpact), 100),
    minAmountOut: Math.max(minAmountOut, 0),
  };
}

export function getCurrentPrice(
  currentRaised: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  totalSupply: number = DEFAULT_TOTAL_SUPPLY,
  targetRaised: number = DEFAULT_FUNDRAISING_TARGET
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
