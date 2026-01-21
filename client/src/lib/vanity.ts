import { Keypair } from '@solana/web3.js';

export interface VanityResult {
  keypair: Keypair;
  address: string;
  attempts: number;
  timeMs: number;
}

export interface VanityProgress {
  attempts: number;
  rate: number;
  elapsed: number;
}

export async function grindVanityAddress(
  suffix: string,
  caseInsensitive: boolean = true,
  onProgress?: (progress: VanityProgress) => void,
  signal?: AbortSignal
): Promise<VanityResult> {
  const startTime = Date.now();
  let attempts = 0;
  const targetSuffix = caseInsensitive ? suffix.toLowerCase() : suffix;
  
  const BATCH_SIZE = 1000;
  const PROGRESS_INTERVAL = 500;
  let lastProgressTime = startTime;

  while (true) {
    if (signal?.aborted) {
      throw new Error('Vanity address generation cancelled');
    }

    for (let i = 0; i < BATCH_SIZE; i++) {
      attempts++;
      const keypair = Keypair.generate();
      const address = keypair.publicKey.toBase58();
      
      const addressToCheck = caseInsensitive ? address.toLowerCase() : address;
      
      if (addressToCheck.endsWith(targetSuffix)) {
        return {
          keypair,
          address,
          attempts,
          timeMs: Date.now() - startTime,
        };
      }
    }

    const now = Date.now();
    if (onProgress && now - lastProgressTime >= PROGRESS_INTERVAL) {
      const elapsed = (now - startTime) / 1000;
      onProgress({
        attempts,
        rate: Math.round(attempts / elapsed),
        elapsed,
      });
      lastProgressTime = now;
    }

    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

export function estimateVanityTime(suffixLength: number, caseInsensitive: boolean): string {
  const base = caseInsensitive ? 36 : 58;
  const avgAttempts = Math.pow(base, suffixLength) / 2;
  const keysPerSecond = 15000;
  const seconds = avgAttempts / keysPerSecond;
  
  if (seconds < 60) {
    return `~${Math.round(seconds)} seconds`;
  } else if (seconds < 3600) {
    return `~${Math.round(seconds / 60)} minutes`;
  } else {
    return `~${Math.round(seconds / 3600)} hours`;
  }
}
