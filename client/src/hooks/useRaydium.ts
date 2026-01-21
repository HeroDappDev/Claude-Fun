import { useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  Raydium, 
  TxVersion, 
  LAUNCHPAD_PROGRAM, 
  getPdaLaunchpadPoolId, 
  getPdaLaunchpadConfigId,
  LaunchpadConfig,
  PlatformConfig 
} from '@raydium-io/raydium-sdk-v2';
import { 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  Transaction, 
  VersionedTransaction,
  SystemProgram,
  TransactionMessage,
  TransactionInstruction
} from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';

// Raydium's default platform ID for LaunchLab (mainnet)
const RAYDIUM_PLATFORM_ID = new PublicKey('4Bu96XjU84XjPDSpveTVf6LYGCkfW5FK7SNkREWcEfV4');

// Claude.fun platform treasury for fee collection
const CLAUDE_PLATFORM_TREASURY = new PublicKey('8kt95geX4dXzVzeEdBBYzxM1XD27dSgaXUD85fEss2Di');
const CLAUDE_PLATFORM_FEE_RATE = 0.0025; // 0.25% platform fee

export interface CreateLaunchpadParams {
  name: string;
  symbol: string;
  metadataUri: string;
  totalSupply: number;
  fundraisingTarget: number;
  decimals?: number;
  initialPurchase?: number; // SOL amount to buy tokens at launch
  customMintKeypair?: import('@solana/web3.js').Keypair; // Optional vanity address keypair
}

export interface CreateLaunchpadResult {
  signature: string;
  poolId: string;
  mintAddress: string;
  success: boolean;
}

export interface LaunchLabPool {
  poolId: string;
  mintA: string;
  mintB: string;
  virtualA: string;
  virtualB: string;
  realA: string;
  realB: string;
  totalRaised: number;
  curveType: number;
  status: 'trading' | 'graduated';
  configInfo: any;
  platformId: string;
}

export interface TradeResult {
  signature: string;
  success: boolean;
  amountOut?: number;
}

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export function useRaydium() {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, signTransaction, connected, sendTransaction } = useWallet();
  const [raydium, setRaydium] = useState<Raydium | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sdkReady, setSdkReady] = useState(false);
  const [walletCapable, setWalletCapable] = useState(false);

  useEffect(() => {
    const hasRequiredMethods = !!publicKey && connected && !!signAllTransactions;
    setWalletCapable(hasRequiredMethods);
    
    if (!hasRequiredMethods) {
      setRaydium(null);
      setSdkReady(false);
      setErrorMessage(connected && !signAllTransactions ? 'Wallet does not support batch signing' : '');
      return;
    }

    let mounted = true;

    async function initRaydium() {
      try {
        setIsLoading(true);
        setError(null);
        setErrorMessage('');
        setSdkReady(false);
        
        const sdk = await Raydium.load({
          connection,
          owner: publicKey!,
          signAllTransactions,
          disableLoadToken: false,
        });

        if (mounted) {
          setRaydium(sdk);
          setSdkReady(true);
        }
      } catch (e) {
        console.error('Failed to initialize Raydium SDK:', e);
        if (mounted) {
          const errMsg = e instanceof Error ? e.message : 'Failed to initialize SDK';
          setError(e instanceof Error ? e : new Error(errMsg));
          setErrorMessage(errMsg);
          setSdkReady(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initRaydium();

    return () => {
      mounted = false;
    };
  }, [publicKey, connected, signAllTransactions, connection]);

  const getPoolInfo = useCallback(async (mintAddress: string): Promise<LaunchLabPool | null> => {
    if (!raydium) return null;

    try {
      const mintA = new PublicKey(mintAddress);
      const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
      
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });
      
      if (!poolInfo) return null;

      return {
        poolId: poolId.toBase58(),
        mintA: mintAddress,
        mintB: NATIVE_MINT.toBase58(),
        virtualA: poolInfo.virtualA?.toString() || '0',
        virtualB: poolInfo.virtualB?.toString() || '0',
        realA: poolInfo.realA?.toString() || '0',
        realB: poolInfo.realB?.toString() || '0',
        totalRaised: (poolInfo.realB?.toNumber() || 0) / LAMPORTS_PER_SOL,
        curveType: poolInfo.configInfo?.curveType || 0,
        status: poolInfo.status === 2 ? 'graduated' : 'trading',
        configInfo: poolInfo.configInfo,
        platformId: poolInfo.platformId?.toBase58() || '',
      };
    } catch (e) {
      console.error('Error fetching pool info:', e);
      return null;
    }
  }, [raydium]);

  // Helper to create and send platform fee transaction
  const sendPlatformFee = useCallback(async (solAmount: number): Promise<string | null> => {
    if (!publicKey || !signTransaction) {
      console.warn('Cannot send platform fee: wallet not ready');
      return null;
    }

    try {
      const feeAmount = Math.floor(solAmount * LAMPORTS_PER_SOL * CLAUDE_PLATFORM_FEE_RATE);
      
      // Skip if fee is too small (less than 1000 lamports = 0.000001 SOL)
      if (feeAmount < 1000) {
        console.log('Platform fee too small, skipping:', feeAmount, 'lamports');
        return null;
      }

      console.log(`Sending platform fee: ${feeAmount} lamports (${feeAmount / LAMPORTS_PER_SOL} SOL)`);

      const feeInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: CLAUDE_PLATFORM_TREASURY,
        lamports: feeAmount,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      const feeTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey,
      }).add(feeInstruction);

      const signedFeeTx = await signTransaction(feeTx);
      const feeSig = await connection.sendRawTransaction(signedFeeTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      await connection.confirmTransaction({
        signature: feeSig,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('Platform fee sent successfully:', feeSig);
      return feeSig;
    } catch (feeError) {
      console.error('Platform fee transaction failed:', feeError);
      // Don't throw - fee failure shouldn't block the trade
      return null;
    }
  }, [publicKey, signTransaction, connection]);

  const buyToken = useCallback(async (
    mintAddress: string,
    solAmount: number,
    slippageBps: number = 100
  ): Promise<TradeResult> => {
    if (!raydium || !publicKey) {
      throw new Error('Raydium SDK not initialized or wallet not connected');
    }

    try {
      const mintA = new PublicKey(mintAddress);
      const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
      
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });
      
      if (!poolInfo) {
        throw new Error('Pool not found on LaunchLab');
      }

      const platformData = await connection.getAccountInfo(poolInfo.platformId);
      if (!platformData) {
        throw new Error('Platform config not found');
      }
      const platformInfo = PlatformConfig.decode(platformData.data);
      
      const mintInfo = await raydium.token.getTokenInfo(mintA);
      
      const inAmount = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
      const slippage = new BN(slippageBps);

      if (!mintInfo || !mintInfo.programId) {
        throw new Error('Could not determine token program for mint');
      }

      const { transaction, extInfo, execute } = await raydium.launchpad.buyToken({
        programId: LAUNCHPAD_PROGRAM,
        mintA,
        mintAProgram: new PublicKey(mintInfo.programId),
        poolInfo,
        slippage,
        configInfo: poolInfo.configInfo,
        platformFeeRate: platformInfo.feeRate,
        txVersion: TxVersion.V0,
        buyAmount: inAmount,
        computeBudgetConfig: {
          units: 400000,
          microLamports: 100000,
        },
      });

      let txId: string;
      try {
        const sentInfo = await execute({ sendAndConfirm: true });
        txId = sentInfo.txId;
      } catch (executeError) {
        console.warn('SDK execute failed, attempting manual send:', executeError);
        
        if (!signAllTransactions) {
          throw new Error('Wallet does not support transaction signing');
        }
        
        const txs = Array.isArray(transaction) ? transaction : [transaction];
        const signedTxs = await signAllTransactions(txs);
        
        for (const signedTx of signedTxs) {
          const serialized = signedTx.serialize();
          const sig = await connection.sendRawTransaction(serialized, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          await connection.confirmTransaction(sig, 'confirmed');
          txId = sig;
        }
        
        if (!txId!) {
          throw new Error('No transaction was sent');
        }
      }

      // Send platform fee after successful trade
      await sendPlatformFee(solAmount);
      
      return {
        signature: txId!,
        success: true,
        amountOut: extInfo?.decimalOutAmount ? parseFloat(extInfo.decimalOutAmount.toString()) : undefined,
      };
    } catch (e) {
      console.error('Buy transaction failed:', e);
      throw e;
    }
  }, [raydium, publicKey, connection, sendPlatformFee]);

  const sellToken = useCallback(async (
    mintAddress: string,
    tokenAmount: number,
    slippageBps: number = 100
  ): Promise<TradeResult> => {
    if (!raydium || !publicKey) {
      throw new Error('Raydium SDK not initialized or wallet not connected');
    }

    try {
      const mintA = new PublicKey(mintAddress);
      const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
      
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });
      
      if (!poolInfo) {
        throw new Error('Pool not found on LaunchLab');
      }

      const platformData = await connection.getAccountInfo(poolInfo.platformId);
      if (!platformData) {
        throw new Error('Platform config not found');
      }
      const platformInfo = PlatformConfig.decode(platformData.data);
      
      const mintInfo = await raydium.token.getTokenInfo(mintA);
      
      const decimals = mintInfo.decimals || 6;
      const sellAmount = new BN(Math.floor(tokenAmount * Math.pow(10, decimals)));

      if (!mintInfo || !mintInfo.programId) {
        throw new Error('Could not determine token program for mint');
      }

      // Estimate SOL output for platform fee calculation using pool state
      let estimatedSolOutput = 0;
      try {
        // Use pool's virtual reserves to estimate price
        // Price = virtualB / virtualA (SOL per token)
        const virtualA = poolInfo.virtualA?.toNumber() || 0;
        const virtualB = poolInfo.virtualB?.toNumber() || 0;
        if (virtualA > 0 && virtualB > 0) {
          const tokensToSell = sellAmount.toNumber();
          const pricePerToken = virtualB / virtualA;
          estimatedSolOutput = (tokensToSell * pricePerToken) / LAMPORTS_PER_SOL;
          console.log('Estimated SOL output for sell:', estimatedSolOutput);
        }
      } catch (quoteError) {
        console.warn('Could not estimate SOL output for fee calculation:', quoteError);
      }

      const { transaction, execute } = await raydium.launchpad.sellToken({
        programId: LAUNCHPAD_PROGRAM,
        mintA,
        mintAProgram: new PublicKey(mintInfo.programId),
        poolInfo,
        configInfo: poolInfo.configInfo,
        platformFeeRate: platformInfo.feeRate,
        txVersion: TxVersion.V0,
        sellAmount,
      });

      let txId: string;
      try {
        const sentInfo = await execute({ sendAndConfirm: true });
        txId = sentInfo.txId;
      } catch (executeError) {
        console.warn('SDK execute failed, attempting manual send:', executeError);
        
        if (!signAllTransactions) {
          throw new Error('Wallet does not support transaction signing');
        }
        
        const txs = Array.isArray(transaction) ? transaction : [transaction];
        const signedTxs = await signAllTransactions(txs);
        
        for (const signedTx of signedTxs) {
          const serialized = signedTx.serialize();
          const sig = await connection.sendRawTransaction(serialized, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          await connection.confirmTransaction(sig, 'confirmed');
          txId = sig;
        }
        
        if (!txId!) {
          throw new Error('No transaction was sent');
        }
      }

      // Send platform fee after successful trade (based on SOL received)
      if (estimatedSolOutput > 0) {
        await sendPlatformFee(estimatedSolOutput);
      }
      
      return {
        signature: txId!,
        success: true,
        amountOut: estimatedSolOutput || undefined,
      };
    } catch (e) {
      console.error('Sell transaction failed:', e);
      throw e;
    }
  }, [raydium, publicKey, connection, sendPlatformFee]);

  const checkPoolExists = useCallback(async (mintAddress: string): Promise<boolean> => {
    if (!raydium || !sdkReady || !walletCapable) {
      console.warn('SDK not ready or wallet not capable - on-chain trading disabled');
      return false;
    }
    
    try {
      const mintA = new PublicKey(mintAddress);
      const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintA, NATIVE_MINT).publicKey;
      
      const account = await connection.getAccountInfo(poolId);
      if (!account) return false;
      
      if (!account.owner.equals(LAUNCHPAD_PROGRAM)) {
        console.warn('Pool account owner is not LaunchLab program');
        return false;
      }
      
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });
      
      if (!poolInfo) return false;
      if (!poolInfo.configInfo) return false;
      if (poolInfo.status === undefined) return false;
      if (!poolInfo.platformId) return false;
      
      const mintInfo = await raydium.token.getTokenInfo(mintA);
      if (!mintInfo || !mintInfo.programId) {
        console.warn('Could not determine token program for mint - on-chain trading disabled');
        return false;
      }
      
      const mintProgramPubkey = new PublicKey(mintInfo.programId);
      if (!mintProgramPubkey.equals(TOKEN_PROGRAM_ID) && !mintProgramPubkey.equals(TOKEN_2022_PROGRAM_ID)) {
        console.warn('Mint uses unsupported token program:', mintInfo.programId);
        return false;
      }
      
      return true;
    } catch (e) {
      console.warn('Pool validation failed:', e);
      return false;
    }
  }, [connection, raydium, sdkReady, walletCapable]);

  const createLaunchpadPool = useCallback(async (params: CreateLaunchpadParams): Promise<CreateLaunchpadResult> => {
    if (!raydium || !publicKey) {
      throw new Error('Raydium SDK not initialized or wallet not connected');
    }

    const { name, symbol, metadataUri, totalSupply, fundraisingTarget, decimals = 6, initialPurchase = 0, customMintKeypair } = params;

    // Raydium LaunchLab minimum requirements
    const MIN_SUPPLY = 10_000_000; // 10 million tokens minimum
    const MIN_FUNDRAISING_SOL = 30; // 30 SOL minimum

    if (totalSupply < MIN_SUPPLY) {
      throw new Error(`Minimum token supply is ${MIN_SUPPLY.toLocaleString()} tokens. You entered ${totalSupply.toLocaleString()}.`);
    }

    if (fundraisingTarget < MIN_FUNDRAISING_SOL) {
      throw new Error(`Minimum fundraising target is ${MIN_FUNDRAISING_SOL} SOL. You entered ${fundraisingTarget} SOL.`);
    }

    try {
      // Use custom vanity keypair if provided, otherwise generate a random one
      const { Keypair } = await import('@solana/web3.js');
      const mintKeypair = customMintKeypair || Keypair.generate();
      const mintA = mintKeypair.publicKey;

      // Get the launchpad config ID using SDK method (SOL pairs, curveType 0, migrateType 0)
      const configId = getPdaLaunchpadConfigId(LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
      
      // Fetch and decode config data from chain
      const configData = await connection.getAccountInfo(configId);
      if (!configData) {
        throw new Error('LaunchLab config not found on chain. Please try again.');
      }
      const configInfo = LaunchpadConfig.decode(configData.data);
      
      // Get SOL decimals
      const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);
      const mintBDecimals = mintBInfo?.decimals || 9;

      // Calculate amounts with decimals - use string to avoid precision issues with large numbers
      const supplyWithDecimals = new BN(totalSupply.toString()).mul(new BN(10).pow(new BN(decimals)));
      
      // Tokens to sell on the bonding curve (79.31% following Raydium's recommended ratio)
      const totalSellA = supplyWithDecimals.mul(new BN(7931)).div(new BN(10000));
      
      // Target raise amount in lamports (SOL)
      const totalFundRaisingB = new BN(Math.floor(fundraisingTarget * LAMPORTS_PER_SOL));

      // Calculate initial buy amount in lamports
      const buyAmountLamports = new BN(Math.floor(initialPurchase * LAMPORTS_PER_SOL));

      console.log('Creating LaunchLab pool with params:', {
        name,
        symbol,
        metadataUri,
        totalSupply,
        decimals,
        supplyWithDecimals: supplyWithDecimals.toString(),
        totalSellA: totalSellA.toString(),
        totalFundRaisingB: totalFundRaisingB.toString(),
        platformId: RAYDIUM_PLATFORM_ID.toBase58(),
        mintA: mintA.toBase58(),
        configId: configId.toBase58(),
        initialPurchase: initialPurchase,
        buyAmountLamports: buyAmountLamports.toString(),
      });

      // Create launchpad pool using Raydium SDK
      const { execute, extInfo } = await raydium.launchpad.createLaunchpad({
        programId: LAUNCHPAD_PROGRAM,
        platformId: RAYDIUM_PLATFORM_ID,
        mintA,
        name,
        symbol,
        uri: metadataUri,
        decimals,
        
        // Pool configuration - use derived configId and fetched configInfo
        configId,
        configInfo,
        mintBDecimals,
        
        // Supply parameters
        supply: supplyWithDecimals,
        totalSellA,
        totalFundRaisingB,
        totalLockedAmount: new BN(0),
        
        // Migration settings
        migrateType: 'cpmm',
        
        // Slippage for initial buy (1%)
        slippage: new BN(100),
        
        // Initial buy amount (creator can optionally purchase tokens at launch)
        buyAmount: buyAmountLamports,
        
        // Create only if no initial purchase, otherwise create and buy
        createOnly: initialPurchase <= 0,
        
        // Vesting schedule (no vesting)
        cliffPeriod: new BN(0),
        unlockPeriod: new BN(0),
        
        txVersion: TxVersion.V0,
        
        computeBudgetConfig: {
          units: 600000,
          microLamports: 100000,
        },
        
        // Extra signers for the mint keypair
        extraSigners: [mintKeypair],
      });

      console.log('LaunchLab transaction built, executing...');
      console.log('Pool ID:', extInfo.address.poolId.toBase58());
      console.log('Mint Address:', extInfo.address.mintA.toBase58());

      // Execute the transaction(s)
      let txId: string = '';
      
      try {
        // Try SDK execute with sequentially option
        const sentInfo = await execute({ sequentially: true, sendAndConfirm: true });
        txId = sentInfo.txIds[0] || '';
      } catch (executeError: any) {
        console.warn('SDK execute failed:', executeError);
        throw executeError;
      }

      console.log('LaunchLab pool created successfully:', txId);

      return {
        signature: txId,
        poolId: extInfo.address.poolId.toBase58(),
        mintAddress: extInfo.address.mintA.toBase58(),
        success: true,
      };
    } catch (e: any) {
      console.error('LaunchLab pool creation failed:', e);
      throw new Error(e.message || 'Failed to create LaunchLab pool');
    }
  }, [raydium, publicKey, connection, signAllTransactions]);

  const canTradeOnChain = sdkReady && walletCapable && connected;

  return {
    raydium,
    isLoading,
    error,
    errorMessage,
    sdkReady,
    walletCapable,
    canTradeOnChain,
    connected: canTradeOnChain,
    getPoolInfo,
    buyToken,
    sellToken,
    checkPoolExists,
    createLaunchpadPool,
  };
}
