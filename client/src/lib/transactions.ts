import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { connection } from './solana';
import BN from 'bn.js';

// Fetch blockhash from server API (uses server's secret RPC)
async function getBlockhashFromServer(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const response = await fetch('/api/blockhash');
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`failed to get recent blockhash: ${error}`);
  }
  return response.json();
}

// Fetch rent exemption from server API (uses server's secret RPC)
async function getRentExemptionFromServer(space: number): Promise<number> {
  const response = await fetch(`/api/rent-exemption?space=${space}`);
  if (!response.ok) {
    // Fallback to hardcoded value for mint account (82 bytes)
    return 1461600; // ~0.00146 SOL for mint account
  }
  const data = await response.json();
  return data.lamports;
}

// Send transaction via server API (uses server's secret RPC)
async function sendTransactionViaServer(serializedTx: string): Promise<string> {
  const response = await fetch('/api/transactions/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: serializedTx }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send transaction');
  }
  const data = await response.json();
  return data.signature;
}

export interface CreateTokenParams {
  name: string;
  symbol: string;
  description?: string;
  totalSupply: string;
  decimals?: number;
  creatorPublicKey: PublicKey;
  curveType: 'linear' | 'exponential' | 'logarithmic';
  fundraisingTarget: string;
}

export interface TokenCreationResult {
  transaction: Transaction;
  mintKeypair: Keypair;
  blockhash: string;
  lastValidBlockHeight: number;
}

export async function buildCreateTokenTransaction(params: CreateTokenParams): Promise<TokenCreationResult> {
  const {
    totalSupply,
    decimals = 9,
    creatorPublicKey,
  } = params;

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  
  // Use server API for RPC calls (uses secret RPC URL)
  const { blockhash, lastValidBlockHeight } = await getBlockhashFromServer();
  
  const lamportsForMint = await getRentExemptionFromServer(82);
  
  const transaction = new Transaction();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = creatorPublicKey;
  
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: creatorPublicKey,
      newAccountPubkey: mint,
      lamports: lamportsForMint,
      space: 82,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  
  transaction.add(
    createInitializeMint2Instruction(
      mint,
      decimals,
      creatorPublicKey,
      creatorPublicKey,
      TOKEN_PROGRAM_ID
    )
  );

  const creatorAta = getAssociatedTokenAddressSync(mint, creatorPublicKey);
  
  transaction.add(
    createAssociatedTokenAccountInstruction(
      creatorPublicKey,
      creatorAta,
      creatorPublicKey,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const supplyBN = new BN(totalSupply);
  const supplyWithDecimals = supplyBN.mul(new BN(10).pow(new BN(decimals)));
  
  transaction.add(
    createMintToInstruction(
      mint,
      creatorAta,
      creatorPublicKey,
      BigInt(supplyWithDecimals.toString()),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  return {
    transaction,
    mintKeypair,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function signAndSendTransaction(
  transaction: Transaction,
  mintKeypair: Keypair,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<string> {
  transaction.partialSign(mintKeypair);
  
  const signedTx = await signTransaction(transaction);
  
  // Send via server API (uses secret RPC URL)
  const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
  const signature = await sendTransactionViaServer(serializedTx);
  
  return signature;
}

export async function confirmTransaction(
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
): Promise<boolean> {
  try {
    // Use server API for confirmation (uses secret RPC URL)
    const response = await fetch('/api/transactions/confirm-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, blockhash, lastValidBlockHeight }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.confirmed;
  } catch (error) {
    console.error('Confirmation error:', error);
    return false;
  }
}

export async function estimateCreationFee(): Promise<number> {
  try {
    const mintRent = await getRentExemptionFromServer(82);
    const ataRent = await getRentExemptionFromServer(165);
    const txFee = 10000;
    
    return (txFee + mintRent + ataRent) / LAMPORTS_PER_SOL;
  } catch (error) {
    return 0.01;
  }
}

export function shortenSignature(sig: string, chars = 8): string {
  return `${sig.slice(0, chars)}...${sig.slice(-chars)}`;
}
