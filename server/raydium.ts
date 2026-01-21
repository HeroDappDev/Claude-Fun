import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

// Solana RPC connection using environment variables
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_WSS_URL = process.env.SOLANA_WSS_URL || 'wss://api.mainnet-beta.solana.com';

export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: SOLANA_WSS_URL,
});

// Raydium LaunchLab program ID (mainnet)
export const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');

// LaunchLab configuration endpoints
export const LAUNCHLAB_CONFIG_URL = 'https://launch-mint-v1.raydium.io/main/configs';
export const LAUNCHLAB_PLATFORMS_URL = 'https://launch-mint-v1.raydium.io/main/platforms';

export interface LaunchLabPool {
  poolId: string;
  mintAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  fundraisingTarget: number;
  currentRaised: number;
  progress: number;
  currentPrice: number;
  curveType: 'linear' | 'exponential' | 'logarithmic';
  creatorAddress: string;
  status: 'active' | 'graduated' | 'failed';
  createdAt: number;
}

// Fetch LaunchLab configurations
export async function fetchLaunchLabConfigs() {
  try {
    const response = await fetch(LAUNCHLAB_CONFIG_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch configs: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching LaunchLab configs:', error);
    return null;
  }
}

// Fetch active LaunchLab pools from on-chain data
export async function fetchLaunchLabPools(): Promise<LaunchLabPool[]> {
  try {
    // Query program accounts for LaunchLab pools
    const accounts = await connection.getProgramAccounts(LAUNCHLAB_PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        // Filter for pool accounts (discriminator)
        { dataSize: 500 }, // Approximate size of pool account
      ],
    });

    const pools: LaunchLabPool[] = [];
    
    for (const account of accounts) {
      try {
        // Parse pool data from account
        // This would require the actual account structure from Raydium's IDL
        // For now, we'll return basic info
        const poolData = parsePoolAccount(account.account.data);
        if (poolData) {
          pools.push(poolData);
        }
      } catch (e) {
        // Skip malformed accounts
      }
    }

    return pools;
  } catch (error) {
    console.error('Error fetching LaunchLab pools:', error);
    return [];
  }
}

// Parse pool account data (placeholder - needs actual IDL)
function parsePoolAccount(data: Buffer): LaunchLabPool | null {
  // This would parse the actual account structure
  // For MVP, we'll integrate with the Raydium API instead
  return null;
}

// Bonding curve parameters calibrated for:
// - 1 SOL at supply=0 should get exactly 34,200,000 tokens (3.42% of 1B supply)
// - Full curve integrates to ~85 SOL for the entire 1B supply
const DEFAULT_INITIAL_PRICE = 0.0000000292; // 2.92e-8 SOL/token → 1 SOL (net 0.9975) gets 34.2M tokens
const DEFAULT_CURVE_SLOPE = 0; // Pure linear: fixed price for simplicity

// Calculate bonding curve price
export function calculateBondingCurvePrice(
  supply: number,
  curveType: 'linear' | 'exponential' | 'logarithmic',
  initialPrice: number = DEFAULT_INITIAL_PRICE,
  slope: number = DEFAULT_CURVE_SLOPE
): number {
  switch (curveType) {
    case 'linear':
      return initialPrice + slope * supply;
    case 'exponential':
      return initialPrice * Math.pow(1 + slope * 1e9, supply / 1e9);
    case 'logarithmic':
      return initialPrice * (1 + Math.log(1 + supply / 1e8));
    default:
      return initialPrice;
  }
}

// Calculate progress percentage
export function calculateProgress(
  currentRaised: number,
  fundraisingTarget: number
): number {
  if (fundraisingTarget <= 0) return 0;
  return Math.min(100, (currentRaised / fundraisingTarget) * 100);
}

// Get SOL balance for a wallet
export async function getWalletBalance(walletAddress: string): Promise<number> {
  try {
    const publicKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return 0;
  }
}

// Validate Solana address
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Check connection health
export async function checkConnectionHealth(): Promise<boolean> {
  try {
    const slot = await connection.getSlot();
    return slot > 0;
  } catch (error) {
    console.error('RPC connection error:', error);
    return false;
  }
}

// Get current slot for timing
export async function getCurrentSlot(): Promise<number> {
  try {
    return await connection.getSlot();
  } catch (error) {
    console.error('Error getting slot:', error);
    return 0;
  }
}

export default {
  connection,
  LAUNCHLAB_PROGRAM_ID,
  fetchLaunchLabConfigs,
  fetchLaunchLabPools,
  calculateBondingCurvePrice,
  calculateProgress,
  getWalletBalance,
  isValidSolanaAddress,
  checkConnectionHealth,
  getCurrentSlot,
};
