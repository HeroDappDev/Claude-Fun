import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMint,
  getAccount,
} from '@solana/spl-token';
import BN from 'bn.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
});

export const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Platform treasury wallet for fee collection
export const PLATFORM_TREASURY = new PublicKey('8kt95geX4dXzVzeEdBBYzxM1XD27dSgaXUD85fEss2Di');

// Platform fee: 0.25% on all trades (25 basis points)
export const PLATFORM_FEE_BPS = 25;
export const PLATFORM_FEE_RATE = 0.0025;

export interface CreateTokenParams {
  name: string;
  symbol: string;
  description?: string;
  totalSupply: string;
  decimals?: number;
  creatorAddress: string;
  mintAddress: string;
  curveType: 'linear' | 'exponential' | 'logarithmic';
  fundraisingTarget: string;
}

export interface TransactionBundle {
  instructions: string[];
  blockhash: string;
  lastValidBlockHeight: number;
  mintAddress: string;
  estimatedFee: number;
}

export async function buildCreateTokenInstructions(params: CreateTokenParams): Promise<TransactionBundle> {
  const {
    totalSupply,
    decimals = 9,
    creatorAddress,
    mintAddress,
  } = params;

  const creator = new PublicKey(creatorAddress);
  const mint = new PublicKey(mintAddress);
  
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  
  const lamportsForMint = await connection.getMinimumBalanceForRentExemption(82);
  
  const instructions: TransactionInstruction[] = [];
  
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mint,
      lamports: lamportsForMint,
      space: 82,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  
  instructions.push(
    createInitializeMint2Instruction(
      mint,
      decimals,
      creator,
      creator,
      TOKEN_PROGRAM_ID
    )
  );

  const creatorAta = getAssociatedTokenAddressSync(mint, creator);
  
  instructions.push(
    createAssociatedTokenAccountInstruction(
      creator,
      creatorAta,
      creator,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const supplyBN = new BN(totalSupply);
  const supplyWithDecimals = supplyBN.mul(new BN(10).pow(new BN(decimals)));
  
  instructions.push(
    createMintToInstruction(
      mint,
      creatorAta,
      creator,
      BigInt(supplyWithDecimals.toString()),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const serializedInstructions = instructions.map(ix => {
    return Buffer.from(JSON.stringify({
      programId: ix.programId.toBase58(),
      keys: ix.keys.map(k => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: ix.data.toString('base64'),
    })).toString('base64');
  });

  const ataRent = await connection.getMinimumBalanceForRentExemption(165);
  const estimatedFee = (lamportsForMint + ataRent + 10000) / LAMPORTS_PER_SOL;

  return {
    instructions: serializedInstructions,
    blockhash,
    lastValidBlockHeight,
    mintAddress,
    estimatedFee,
  };
}

export async function getTransactionStatus(signature: string): Promise<{
  confirmed: boolean;
  slot?: number;
  error?: string;
}> {
  try {
    const status = await connection.getSignatureStatus(signature);
    
    if (status.value?.err) {
      return { confirmed: false, error: JSON.stringify(status.value.err) };
    }
    
    const confirmed = status.value?.confirmationStatus === 'confirmed' || 
                      status.value?.confirmationStatus === 'finalized';
    
    return { confirmed, slot: status.value?.slot };
  } catch (error) {
    return { confirmed: false, error: String(error) };
  }
}

export interface TransactionVerification {
  valid: boolean;
  mintAddress?: string;
  creatorAddress?: string;
  error?: string;
}

export interface VerifyTokenCreationParams {
  signature: string;
  expectedMint: string;
  expectedCreator: string;
  expectedTotalSupply: string;
  expectedDecimals?: number;
}

export async function verifyTokenCreation(params: VerifyTokenCreationParams): Promise<TransactionVerification> {
  const {
    signature,
    expectedMint,
    expectedCreator,
    expectedTotalSupply,
    expectedDecimals = 9,
  } = params;

  try {
    // First check if the transaction is confirmed
    const status = await connection.getSignatureStatus(signature);
    if (!status.value) {
      return { valid: false, error: 'Transaction not found' };
    }
    
    if (status.value.err) {
      return { valid: false, error: 'Transaction failed on-chain' };
    }
    
    const confirmed = status.value.confirmationStatus === 'confirmed' || 
                      status.value.confirmationStatus === 'finalized';
    
    if (!confirmed) {
      return { valid: false, error: 'Transaction not yet confirmed' };
    }

    // Verify on-chain state directly instead of parsing transaction instructions
    // This is more reliable as instruction parsing can miss nested/CPI calls
    const expectedSupplyWithDecimals = new BN(expectedTotalSupply)
      .mul(new BN(10).pow(new BN(expectedDecimals)))
      .toString();
    const expectedSupplyBigInt = BigInt(expectedSupplyWithDecimals);
    
    // Check mint account exists and has correct state
    let mintData;
    try {
      mintData = await getMint(connection, new PublicKey(expectedMint), 'confirmed');
    } catch (e) {
      return { valid: false, error: 'Mint account not found on-chain after transaction' };
    }
    
    // Verify mint authority matches creator
    if (!mintData.mintAuthority || mintData.mintAuthority.toBase58() !== expectedCreator) {
      return { valid: false, error: 'On-chain mint authority does not match creator' };
    }
    
    // Verify decimals
    if (mintData.decimals !== expectedDecimals) {
      return { valid: false, error: `On-chain decimals mismatch: expected ${expectedDecimals}, got ${mintData.decimals}` };
    }
    
    // Verify supply matches (with tolerance for potential early buys)
    if (mintData.supply < expectedSupplyBigInt) {
      return { 
        valid: false, 
        error: `On-chain supply too low: expected ${expectedSupplyWithDecimals}, got ${mintData.supply.toString()}` 
      };
    }

    // Check creator's ATA exists and has tokens
    const expectedCreatorAta = getAssociatedTokenAddressSync(
      new PublicKey(expectedMint),
      new PublicKey(expectedCreator)
    );
    
    let ataAccount;
    try {
      ataAccount = await getAccount(connection, expectedCreatorAta, 'confirmed');
    } catch (e) {
      return { valid: false, error: 'Creator token account not found on-chain' };
    }
    
    // Verify ATA has tokens (creator should have at least some tokens)
    if (ataAccount.amount === BigInt(0)) {
      return { valid: false, error: 'Creator token account has zero balance' };
    }
    
    // Verify ATA mint matches
    if (ataAccount.mint.toBase58() !== expectedMint) {
      return { valid: false, error: 'Creator ATA mint mismatch' };
    }
    
    // All on-chain checks passed
    return { 
      valid: true, 
      mintAddress: expectedMint,
      creatorAddress: expectedCreator,
    };
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return { valid: false, error: String(error) };
  }
}

export async function waitForConfirmation(
  signature: string, 
  blockhash: string, 
  lastValidBlockHeight: number
): Promise<boolean> {
  try {
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    return !confirmation.value.err;
  } catch (error) {
    console.error('Confirmation error:', error);
    return false;
  }
}

export async function estimateTransactionFee(): Promise<number> {
  try {
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    const ataRent = await connection.getMinimumBalanceForRentExemption(165);
    const txFee = 10000;
    
    const totalLamports = txFee + mintRent + ataRent;
    return totalLamports / LAMPORTS_PER_SOL;
  } catch (error) {
    return 0.01;
  }
}

export async function getRecentBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  return await connection.getLatestBlockhash('confirmed');
}

export interface TradeVerification {
  valid: boolean;
  solAmount?: number;
  tokenAmount?: number;
  walletAddress?: string;
  mintAddress?: string;
  error?: string;
}

export interface VerifyTradeParams {
  signature: string;
  expectedWallet: string;
  expectedMint: string;
  expectedSolAmount: number;
  isBuy: boolean; // true for buy (SOL -> tokens), false for sell (tokens -> SOL)
}

/**
 * Verifies a trade transaction on-chain.
 * Checks that:
 * 1. Transaction is confirmed and succeeded
 * 2. Expected wallet is a signer
 * 3. Token transfer instruction explicitly references the expected mint
 * 4. Token balance changes on wallet's ATA
 * 5. SOL transfer amount matches within tolerance
 */
export async function verifyTradeTransaction(params: VerifyTradeParams): Promise<TradeVerification> {
  const { signature, expectedWallet, expectedMint, expectedSolAmount, isBuy } = params;
  
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    
    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }
    
    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed on-chain' };
    }
    
    const accountKeys = tx.transaction.message.accountKeys;
    
    // Verify wallet is a signer
    const walletIsSigner = accountKeys.some(k => 
      k.pubkey.toBase58() === expectedWallet && k.signer === true
    );
    
    if (!walletIsSigner) {
      return { valid: false, error: 'Wallet is not a signer of the transaction' };
    }
    
    // Collect all instructions
    const instructions = tx.transaction.message.instructions;
    const innerInstructions = tx.meta?.innerInstructions || [];
    const allInstructions: any[] = [...instructions];
    for (const inner of innerInstructions) {
      allInstructions.push(...(inner.instructions || []));
    }
    
    // Find token transfer instruction that explicitly references the expected mint
    let mintVerified = false;
    let tokenTransferFound = false;
    
    for (const ix of allInstructions) {
      const parsed = (ix as any).parsed;
      const program = (ix as any).program;
      
      if (program === 'spl-token' && parsed) {
        const info = parsed.info;
        const instructionType = parsed.type;
        
        // Check for transfer, transferChecked, mintTo, burn operations
        if (['transfer', 'transferChecked', 'mintTo', 'burn', 'burnChecked'].includes(instructionType)) {
          tokenTransferFound = true;
          
          // transferChecked and mintTo include the mint explicitly
          if (info?.mint === expectedMint) {
            mintVerified = true;
            break;
          }
          
          // For regular transfer, the mint might not be in info
          // But the accounts involved should match our expected ATA
          const expectedAta = getAssociatedTokenAddressSync(
            new PublicKey(expectedMint),
            new PublicKey(expectedWallet)
          ).toBase58();
          
          if (info?.source === expectedAta || info?.destination === expectedAta || 
              info?.account === expectedAta) {
            mintVerified = true;
            break;
          }
        }
      }
    }
    
    if (!tokenTransferFound) {
      return { valid: false, error: 'No token transfer found in transaction' };
    }
    
    if (!mintVerified) {
      return { valid: false, error: 'Token transfer does not involve the expected mint' };
    }
    
    // Verify token balance changes on wallet's ATA
    const expectedAta = getAssociatedTokenAddressSync(
      new PublicKey(expectedMint),
      new PublicKey(expectedWallet)
    ).toBase58();
    
    const ataIndex = accountKeys.findIndex(k => k.pubkey.toBase58() === expectedAta);
    
    if (ataIndex !== -1) {
      const preTokenBalances = tx.meta?.preTokenBalances || [];
      const postTokenBalances = tx.meta?.postTokenBalances || [];
      
      const preBalance = preTokenBalances.find(b => b.accountIndex === ataIndex);
      const postBalance = postTokenBalances.find(b => b.accountIndex === ataIndex);
      
      // Verify the token balance changed in the expected direction
      const preBal = parseFloat(preBalance?.uiTokenAmount?.uiAmount?.toString() || '0');
      const postBal = parseFloat(postBalance?.uiTokenAmount?.uiAmount?.toString() || '0');
      const tokenChange = postBal - preBal;
      
      // For buy: token balance should increase (positive change)
      // For sell: token balance should decrease (negative change)
      if (isBuy && tokenChange <= 0) {
        return { valid: false, error: 'Expected token balance increase for buy, but got decrease or no change' };
      }
      if (!isBuy && tokenChange >= 0) {
        return { valid: false, error: 'Expected token balance decrease for sell, but got increase or no change' };
      }
    }
    
    // Verify SOL transfer amount from pre/post balances
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    
    // Find wallet index in account keys
    const walletIndex = accountKeys.findIndex(k => k.pubkey.toBase58() === expectedWallet);
    if (walletIndex === -1) {
      return { valid: false, error: 'Wallet not found in transaction accounts' };
    }
    
    const preBal = preBalances[walletIndex] || 0;
    const postBal = postBalances[walletIndex] || 0;
    const balanceChange = (postBal - preBal) / LAMPORTS_PER_SOL;
    
    // For buy: wallet balance should decrease (negative change)
    // For sell: wallet balance should increase (positive change)
    const actualSolAmount = isBuy ? -balanceChange : balanceChange;
    
    // Allow 5% tolerance for fees
    const tolerance = expectedSolAmount * 0.05 + 0.001; // 5% + small fixed tolerance for tx fees
    const amountDiff = Math.abs(actualSolAmount - expectedSolAmount);
    
    if (amountDiff > tolerance) {
      return { 
        valid: false, 
        error: `SOL amount mismatch: expected ${expectedSolAmount}, actual ${actualSolAmount.toFixed(6)}` 
      };
    }
    
    return {
      valid: true,
      solAmount: actualSolAmount,
      walletAddress: expectedWallet,
      mintAddress: expectedMint,
    };
  } catch (error) {
    console.error('Error verifying trade transaction:', error);
    return { valid: false, error: String(error) };
  }
}

export default {
  connection,
  LAUNCHLAB_PROGRAM_ID,
  buildCreateTokenInstructions,
  getTransactionStatus,
  verifyTokenCreation,
  verifyTradeTransaction,
  waitForConfirmation,
  estimateTransactionFee,
  getRecentBlockhash,
};
