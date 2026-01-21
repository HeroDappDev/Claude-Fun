import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTokenLaunchSchema, type TokenLaunch, CurveType } from "@shared/schema";
import { z } from "zod";
import raydium, { calculateBondingCurvePrice, calculateProgress } from "./raydium";
import launchlab from "./launchlab";
import launchpadUtils from "./raydium-launchlab";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.originalname);
    cb(null, `token-${uniqueSuffix}${ext}`);
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."));
    }
  },
});

// Helper to calculate token metrics
function calculateTokenMetrics(launch: TokenLaunch) {
  const currentRaised = parseFloat(launch.currentRaised);
  const fundraisingTarget = parseFloat(launch.fundraisingTarget);
  const totalSupply = parseFloat(launch.totalSupply);
  const progress = calculateProgress(currentRaised, fundraisingTarget);
  
  // Calculate current price based on curve type and progress
  const supply = totalSupply * (progress / 100);
  const curveType = launch.curveType as 'linear' | 'exponential' | 'logarithmic';
  const currentPrice = calculateBondingCurvePrice(supply, curveType);
  
  const marketCap = currentPrice * totalSupply;
  
  // For real implementation, these would come from on-chain data
  // Holders and volume would be tracked via transaction history
  const holders = launch.holders || 0;
  const volume24h = launch.volume24h || 0;
  
  // Format age
  const createdAt = launch.createdAt ? new Date(launch.createdAt).getTime() : Date.now();
  const now = Date.now();
  const diff = now - createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  let age = `${minutes}m ago`;
  if (days > 0) age = `${days}d ago`;
  else if (hours > 0) age = `${hours}h ago`;
  
  return {
    id: launch.id,
    mintAddress: launch.mintAddress,
    poolId: launch.poolId || null,
    name: launch.name,
    symbol: launch.symbol,
    description: launch.description || '',
    imageUrl: launch.imageUrl || null,
    curveType: launch.curveType as typeof CurveType[keyof typeof CurveType],
    totalSupply: launch.totalSupply,
    fundraisingTarget,
    currentRaised,
    progress,
    currentPrice,
    marketCap,
    holders,
    volume24h,
    creatorAddress: launch.creatorAddress,
    age,
    status: launch.status as 'active' | 'graduated' | 'failed',
    txSignature: launch.txSignature || null,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Serve uploaded images
  app.use("/uploads", (await import("express")).default.static(uploadsDir));

  // Image upload endpoint with proper error handling
  app.post("/api/upload/image", (req, res) => {
    imageUpload.single("image")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ 
            error: "File too large. Maximum size is 5MB." 
          });
        }
        if (err.message?.includes("Invalid file type")) {
          return res.status(400).json({ 
            error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." 
          });
        }
        console.error("Image upload error:", err);
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }
      
      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ 
        success: true, 
        imageUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    });
  });

  // Upload image to Pinata IPFS
  async function uploadImageToIPFS(filePath: string, fileName: string): Promise<string> {
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
    
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API keys not configured");
    }

    const fileStream = fs.createReadStream(filePath);
    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    formData.append("file", fileStream, fileName);
    
    formData.append("pinataMetadata", JSON.stringify({
      name: fileName,
      keyvalues: {
        platform: "claude.fun",
        type: "token-image"
      }
    }));

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        "pinata_api_key": PINATA_API_KEY,
        "pinata_secret_api_key": PINATA_SECRET_KEY,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json() as { IpfsHash: string };
    return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
  }

  // Upload JSON metadata to Pinata IPFS
  async function uploadMetadataToIPFS(metadata: any, name: string): Promise<string> {
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
    
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API keys not configured");
    }

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "pinata_api_key": PINATA_API_KEY,
        "pinata_secret_api_key": PINATA_SECRET_KEY,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `${name}-metadata.json`,
          keyvalues: {
            platform: "claude.fun",
            type: "token-metadata"
          }
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata metadata upload failed: ${error}`);
    }

    const result = await response.json() as { IpfsHash: string };
    return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
  }

  // Create and upload token metadata to IPFS via Pinata
  app.post("/api/metadata/create", async (req, res) => {
    try {
      const { name, symbol, description, imageUrl, website, twitter, telegram } = req.body;
      
      if (!name || !symbol) {
        return res.status(400).json({ error: "Name and symbol are required" });
      }

      let ipfsImageUrl = "";
      
      // If we have a local image URL, upload it to IPFS first
      if (imageUrl && imageUrl.startsWith("/uploads/")) {
        const localImagePath = path.join(process.cwd(), imageUrl);
        if (fs.existsSync(localImagePath)) {
          const fileName = path.basename(imageUrl);
          console.log("Uploading image to IPFS:", fileName);
          ipfsImageUrl = await uploadImageToIPFS(localImagePath, fileName);
          console.log("Image uploaded to IPFS:", ipfsImageUrl);
        }
      } else if (imageUrl) {
        // Already an external URL
        ipfsImageUrl = imageUrl;
      }

      // Normalize social links
      const normalizedWebsite = website || "";
      const normalizedTwitter = twitter ? (twitter.startsWith('http') ? twitter : `https://x.com/${twitter.replace('@', '')}`) : "";
      const normalizedTelegram = telegram ? (telegram.startsWith('http') ? telegram : `https://t.me/${telegram.replace('@', '')}`) : "";
      
      // Create metadata JSON following Metaplex standard with social links
      // These will be visible on trading platforms like Photon, Padre, Axiom
      const metadata: Record<string, any> = {
        name,
        symbol,
        description: description || `${name} token on Claude.fun`,
        image: ipfsImageUrl,
        external_url: normalizedWebsite || "https://claude.fun",
        attributes: [
          { trait_type: "Platform", value: "Claude.fun" },
          { trait_type: "Type", value: "LaunchLab Token" },
        ],
        properties: {
          files: ipfsImageUrl ? [{ uri: ipfsImageUrl, type: "image/png" }] : [],
          category: "token",
        },
        extensions: {
          website: normalizedWebsite,
          twitter: normalizedTwitter,
          telegram: normalizedTelegram,
        },
      };

      // Also add social links at root level for maximum compatibility
      if (normalizedTwitter) metadata.twitter = normalizedTwitter;
      if (normalizedTelegram) metadata.telegram = normalizedTelegram;
      if (normalizedWebsite) metadata.website = normalizedWebsite;

      console.log("Uploading metadata to IPFS:", name);
      const metadataUri = await uploadMetadataToIPFS(metadata, symbol);
      console.log("Metadata uploaded to IPFS:", metadataUri);
      
      res.json({
        success: true,
        metadataUri,
        imageUri: ipfsImageUrl,
        metadata,
      });
    } catch (error: any) {
      console.error("Error creating metadata:", error);
      res.status(500).json({ error: error.message || "Failed to create metadata" });
    }
  });

  // Serve token metadata JSON (fallback for local storage)
  app.get("/api/metadata/:id", (req, res) => {
    try {
      const { id } = req.params;
      const metadataPath = path.join(process.cwd(), "metadata", `${id}.json`);
      
      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: "Metadata not found" });
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      res.json(metadata);
    } catch (error: any) {
      console.error("Error serving metadata:", error);
      res.status(500).json({ error: "Failed to serve metadata" });
    }
  });

  // Provide RPC config to frontend (allows using premium RPC without exposing in frontend code)
  app.get("/api/config/rpc", (req, res) => {
    res.json({
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      wssUrl: process.env.SOLANA_WSS_URL || 'wss://api.mainnet-beta.solana.com',
    });
  });

  // Health check for RPC connection
  app.get("/api/health", async (req, res) => {
    try {
      const isHealthy = await raydium.checkConnectionHealth();
      const slot = await raydium.getCurrentSlot();
      res.json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        rpc: process.env.SOLANA_RPC_URL ? 'configured' : 'default',
        slot,
      });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: 'RPC connection failed' });
    }
  });

  // Get all token launches with calculated metrics
  app.get("/api/launches", async (req, res) => {
    try {
      const launches = await storage.getAllLaunches();
      const launchesWithMetrics = launches.map(calculateTokenMetrics);
      res.json(launchesWithMetrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch launches" });
    }
  });

  // Get active token launches only
  app.get("/api/launches/active", async (req, res) => {
    try {
      const launches = await storage.getActiveLaunches();
      const launchesWithMetrics = launches.map(calculateTokenMetrics);
      res.json(launchesWithMetrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active launches" });
    }
  });

  // Get single token launch by ID
  app.get("/api/launches/:id", async (req, res) => {
    try {
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      res.json(calculateTokenMetrics(launch));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch launch" });
    }
  });

  // Create new token launch
  // In production, this would create the token on-chain via Raydium LaunchLab
  app.post("/api/launches", async (req, res) => {
    try {
      const validatedData = insertTokenLaunchSchema.parse(req.body);
      
      // Validate creator address
      if (!raydium.isValidSolanaAddress(validatedData.creatorAddress)) {
        return res.status(400).json({ error: "Invalid creator wallet address" });
      }
      
      // Create launch record (in production, this happens after on-chain confirmation)
      const launch = await storage.createLaunch({
        ...validatedData,
        holders: 0,
        volume24h: 0,
      });
      
      res.status(201).json(calculateTokenMetrics(launch));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create launch" });
    }
  });

  // Update launch (for recording on-chain data)
  app.patch("/api/launches/:id", async (req, res) => {
    try {
      const launch = await storage.updateLaunch(req.params.id, req.body);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      res.json(calculateTokenMetrics(launch));
    } catch (error) {
      res.status(500).json({ error: "Failed to update launch" });
    }
  });

  // Record a buy transaction (called after on-chain confirmation)
  app.post("/api/launches/:id/buy", async (req, res) => {
    try {
      const { solAmount, walletAddress, txSignature } = req.body;
      
      if (!solAmount || solAmount <= 0) {
        return res.status(400).json({ error: "Invalid SOL amount" });
      }
      
      if (!raydium.isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      if (launch.status !== 'active') {
        return res.status(400).json({ error: "Token has graduated or failed" });
      }
      
      const currentRaised = parseFloat(launch.currentRaised);
      const newRaised = currentRaised + solAmount;
      const fundraisingTarget = parseFloat(launch.fundraisingTarget);
      
      // Check if this trade graduates the token
      const newStatus = newRaised >= fundraisingTarget ? 'graduated' : 'active';
      const holders = (launch.holders || 0) + 1;
      const volume24h = (launch.volume24h || 0) + (solAmount * 150); // Approximate USD value
      
      const updated = await storage.updateLaunch(req.params.id, {
        currentRaised: newRaised.toString(),
        status: newStatus,
        holders,
        volume24h,
        txSignature: txSignature || launch.txSignature,
      });
      
      res.json({
        success: true,
        graduated: newStatus === 'graduated',
        txSignature,
        launch: updated ? calculateTokenMetrics(updated) : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process buy" });
    }
  });

  // Record a sell transaction (called after on-chain confirmation)
  app.post("/api/launches/:id/sell", async (req, res) => {
    try {
      const { tokenAmount, walletAddress, txSignature, solReceived } = req.body;
      
      if (!tokenAmount || tokenAmount <= 0) {
        return res.status(400).json({ error: "Invalid token amount" });
      }
      
      if (!raydium.isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      // Update volume
      const volume24h = (launch.volume24h || 0) + ((solReceived || 0) * 150);
      
      const updated = await storage.updateLaunch(req.params.id, {
        volume24h,
      });
      
      res.json({
        success: true,
        txSignature,
        launch: updated ? calculateTokenMetrics(updated) : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process sell" });
    }
  });

  // Get platform stats
  app.get("/api/stats", async (req, res) => {
    try {
      const launches = await storage.getAllLaunches();
      const active = launches.filter(l => l.status === 'active').length;
      const graduated = launches.filter(l => l.status === 'graduated').length;
      const totalRaised = launches.reduce(
        (acc, l) => acc + parseFloat(l.currentRaised), 
        0
      );
      
      res.json({
        activeLaunches: active,
        graduatedLaunches: graduated,
        totalLaunches: launches.length,
        totalRaised,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get wallet balance
  app.get("/api/wallet/:address/balance", async (req, res) => {
    try {
      if (!raydium.isValidSolanaAddress(req.params.address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      const balance = await raydium.getWalletBalance(req.params.address);
      res.json({ address: req.params.address, balance });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Build token creation transaction (returns unsigned transaction for client signing)
  app.post("/api/transactions/create-token", async (req, res) => {
    try {
      const { name, symbol, description, totalSupply, curveType, fundraisingTarget, creatorAddress, mintAddress } = req.body;
      
      if (!raydium.isValidSolanaAddress(creatorAddress)) {
        return res.status(400).json({ error: "Invalid creator wallet address" });
      }
      
      if (!raydium.isValidSolanaAddress(mintAddress)) {
        return res.status(400).json({ error: "Invalid mint address" });
      }
      
      const txBundle = await launchlab.buildCreateTokenInstructions({
        name,
        symbol,
        description,
        totalSupply: totalSupply || '1000000000',
        curveType: curveType || 'linear',
        fundraisingTarget: fundraisingTarget || '85',
        creatorAddress,
        mintAddress,
      });
      
      res.json(txBundle);
    } catch (error) {
      console.error('Error building transaction:', error);
      res.status(500).json({ error: "Failed to build transaction" });
    }
  });

  // Confirm transaction and create launch record
  app.post("/api/transactions/confirm", async (req, res) => {
    try {
      const { signature, blockhash, lastValidBlockHeight, launchData } = req.body;
      
      if (!signature) {
        return res.status(400).json({ error: "Transaction signature required" });
      }
      
      if (!launchData || !launchData.mintAddress || !launchData.creatorAddress) {
        return res.status(400).json({ error: "Launch data with mint and creator addresses required" });
      }
      
      // Wait for confirmation
      const confirmed = await launchlab.waitForConfirmation(
        signature,
        blockhash,
        lastValidBlockHeight
      );
      
      if (!confirmed) {
        return res.status(400).json({ error: "Transaction failed or not confirmed" });
      }
      
      // Verify the transaction actually created the token with claimed addresses and supply
      const verification = await launchlab.verifyTokenCreation({
        signature,
        expectedMint: launchData.mintAddress,
        expectedCreator: launchData.creatorAddress,
        expectedTotalSupply: launchData.totalSupply || '1000000000',
        expectedDecimals: 9,
      });
      
      if (!verification.valid) {
        return res.status(400).json({ 
          error: "Transaction verification failed", 
          details: verification.error 
        });
      }
      
      // Create the launch record after verification
      const validatedData = insertTokenLaunchSchema.parse({
        ...launchData,
        txSignature: signature,
        status: 'active',
      });
      
      const launch = await storage.createLaunch({
        ...validatedData,
        holders: 1,
        volume24h: 0,
      });
      
      return res.json({
        success: true,
        signature,
        verified: true,
        launch: calculateTokenMetrics(launch),
      });
    } catch (error) {
      console.error('Error confirming transaction:', error);
      res.status(500).json({ error: "Failed to confirm transaction" });
    }
  });

  // Get transaction status
  app.get("/api/transactions/:signature/status", async (req, res) => {
    try {
      const status = await launchlab.getTransactionStatus(req.params.signature);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get transaction status" });
    }
  });

  // Get blockhash for transaction building
  app.get("/api/blockhash", async (req, res) => {
    try {
      const { blockhash, lastValidBlockHeight } = await launchlab.getRecentBlockhash();
      res.json({ blockhash, lastValidBlockHeight });
    } catch (error) {
      res.status(500).json({ error: "Failed to get blockhash" });
    }
  });

  // Get rent exemption for account space
  app.get("/api/rent-exemption", async (req, res) => {
    try {
      const space = parseInt(req.query.space as string) || 82;
      const lamports = await launchlab.connection.getMinimumBalanceForRentExemption(space);
      res.json({ lamports, space });
    } catch (error) {
      res.status(500).json({ error: "Failed to get rent exemption" });
    }
  });

  // Send raw transaction via server RPC
  app.post("/api/transactions/send", async (req, res) => {
    try {
      const { transaction } = req.body;
      if (!transaction) {
        return res.status(400).json({ error: "Transaction data required" });
      }
      
      const txBuffer = Buffer.from(transaction, 'base64');
      const signature = await launchlab.connection.sendRawTransaction(txBuffer, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      res.json({ signature });
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      
      // Parse simulation errors for better user messages
      let errorMessage = error.message || "Failed to send transaction";
      
      if (errorMessage.includes('Simulation failed')) {
        // Check for common issues
        if (errorMessage.includes('insufficient lamports') || errorMessage.includes('Insufficient funds')) {
          errorMessage = 'Insufficient SOL balance. You need at least 0.01 SOL for token creation.';
        } else if (errorMessage.includes('blockhash not found') || errorMessage.includes('Blockhash not found')) {
          errorMessage = 'Transaction expired. Please try again.';
        } else if (errorMessage.includes('already in use') || errorMessage.includes('already exists')) {
          errorMessage = 'Transaction conflict. Please try again.';
        } else {
          // Extract simulation error details if available
          const logs = error.logs || error.transactionLogs || [];
          if (logs.length > 0) {
            const errorLog = logs.find((log: string) => log.includes('Error') || log.includes('failed'));
            if (errorLog) {
              errorMessage = `Simulation failed: ${errorLog}`;
            }
          } else {
            errorMessage = 'Simulation failed. Please ensure you have enough SOL and try again.';
          }
        }
      }
      
      res.status(500).json({ error: errorMessage });
    }
  });

  // Confirm transaction status via server RPC
  app.post("/api/transactions/confirm-status", async (req, res) => {
    try {
      const { signature, blockhash, lastValidBlockHeight } = req.body;
      if (!signature || !blockhash || !lastValidBlockHeight) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const confirmation = await launchlab.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      res.json({ confirmed: !confirmation.value.err });
    } catch (error) {
      console.error('Error confirming transaction:', error);
      res.status(500).json({ error: "Failed to confirm transaction", confirmed: false });
    }
  });

  // Estimate transaction fee
  app.get("/api/estimate-fee", async (req, res) => {
    try {
      const fee = await launchlab.estimateTransactionFee();
      res.json({ fee });
    } catch (error) {
      res.status(500).json({ error: "Failed to estimate fee" });
    }
  });

  // Get buy quote for a token
  app.post("/api/launches/:id/quote/buy", async (req, res) => {
    try {
      const { solAmount } = req.body;
      
      if (!solAmount || solAmount <= 0) {
        return res.status(400).json({ error: "Invalid SOL amount" });
      }
      
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      if (launch.status !== 'active') {
        return res.status(400).json({ error: "Token has graduated or is not active" });
      }
      
      const currentRaised = parseFloat(launch.currentRaised);
      const totalSupply = parseFloat(launch.totalSupply);
      const targetRaised = parseFloat(launch.fundraisingTarget);
      const curveType = launch.curveType as 'linear' | 'exponential' | 'logarithmic';
      
      const quote = launchpadUtils.getBuyQuote(
        solAmount,
        currentRaised,
        curveType,
        totalSupply,
        targetRaised
      );
      
      res.json({
        ...quote,
        willGraduate: (currentRaised + solAmount - quote.fee) >= targetRaised,
        tokenSymbol: launch.symbol,
        feeRecipient: launchpadUtils.PLATFORM_TREASURY.toBase58(),
        feeRate: launchpadUtils.PLATFORM_FEE_RATE,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get buy quote" });
    }
  });

  // Get sell quote for a token
  app.post("/api/launches/:id/quote/sell", async (req, res) => {
    try {
      const { tokenAmount } = req.body;
      
      if (!tokenAmount || tokenAmount <= 0) {
        return res.status(400).json({ error: "Invalid token amount" });
      }
      
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      if (launch.status !== 'active') {
        return res.status(400).json({ error: "Token has graduated or is not active" });
      }
      
      const currentRaised = parseFloat(launch.currentRaised);
      const totalSupply = parseFloat(launch.totalSupply);
      const targetRaised = parseFloat(launch.fundraisingTarget);
      const curveType = launch.curveType as 'linear' | 'exponential' | 'logarithmic';
      
      const quote = launchpadUtils.getSellQuote(
        tokenAmount,
        currentRaised,
        curveType,
        totalSupply,
        targetRaised
      );
      
      res.json({
        ...quote,
        tokenSymbol: launch.symbol,
        feeRecipient: launchpadUtils.PLATFORM_TREASURY.toBase58(),
        feeRate: launchpadUtils.PLATFORM_FEE_RATE,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get sell quote" });
    }
  });

  // Get current token price
  app.get("/api/launches/:id/price", async (req, res) => {
    try {
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      const currentRaised = parseFloat(launch.currentRaised);
      const totalSupply = parseFloat(launch.totalSupply);
      const targetRaised = parseFloat(launch.fundraisingTarget);
      const curveType = launch.curveType as 'linear' | 'exponential' | 'logarithmic';
      
      const currentPrice = launchpadUtils.getCurrentPrice(
        currentRaised,
        curveType,
        totalSupply,
        targetRaised
      );
      
      res.json({
        currentPrice,
        currentRaised,
        targetRaised,
        progress: (currentRaised / targetRaised) * 100,
        curveType,
        status: launch.status,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get price" });
    }
  });

  // Confirm buy transaction after on-chain execution
  // Verifies:
  // 1. Transaction is confirmed on-chain
  // 2. Wallet is a signer of the transaction
  // 3. Transaction involves the expected mint
  // 4. SOL amount matches (within tolerance for fees)
  app.post("/api/launches/:id/confirm-buy", async (req, res) => {
    try {
      const { txSignature, walletAddress, solAmount, tokensReceived } = req.body;
      
      // Validate required parameters
      if (!txSignature || typeof txSignature !== 'string') {
        return res.status(400).json({ error: "Valid transaction signature required" });
      }
      
      if (!raydium.isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      // Validate numeric inputs
      const solAmountNum = Number(solAmount);
      if (!Number.isFinite(solAmountNum) || solAmountNum <= 0) {
        return res.status(400).json({ error: "Invalid SOL amount: must be a positive number" });
      }
      
      const tokensReceivedNum = Number(tokensReceived);
      if (!Number.isFinite(tokensReceivedNum) || tokensReceivedNum <= 0) {
        return res.status(400).json({ error: "Invalid tokens received: must be a positive number" });
      }
      
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      if (launch.status !== 'active') {
        return res.status(400).json({ error: "Token has graduated or is not active" });
      }
      
      // Verify transaction on-chain: wallet is signer, mint is involved, amount matches
      const verification = await launchlab.verifyTradeTransaction({
        signature: txSignature,
        expectedWallet: walletAddress,
        expectedMint: launch.mintAddress,
        expectedSolAmount: solAmountNum,
        isBuy: true,
      });
      
      if (!verification.valid) {
        return res.status(400).json({ 
          error: "Transaction verification failed", 
          details: verification.error 
        });
      }
      
      // Update launch with new raised amount
      const currentRaised = parseFloat(launch.currentRaised);
      const verifiedSolAmount = verification.solAmount || solAmountNum;
      const newRaised = currentRaised + verifiedSolAmount;
      const fundraisingTarget = parseFloat(launch.fundraisingTarget);
      
      const newStatus = newRaised >= fundraisingTarget ? 'graduated' : 'active';
      const holders = (launch.holders || 0) + 1;
      const volume24h = (launch.volume24h || 0) + (verifiedSolAmount * 150);
      
      const updated = await storage.updateLaunch(req.params.id, {
        currentRaised: newRaised.toString(),
        status: newStatus,
        holders,
        volume24h,
      });
      
      res.json({
        success: true,
        confirmed: true,
        verified: true,
        graduated: newStatus === 'graduated',
        txSignature,
        solAmount: verifiedSolAmount,
        tokensReceived: tokensReceivedNum,
        launch: updated ? calculateTokenMetrics(updated) : null,
      });
    } catch (error) {
      console.error('Error confirming buy:', error);
      res.status(500).json({ error: "Failed to confirm buy transaction" });
    }
  });

  // Confirm sell transaction after on-chain execution
  // Verifies:
  // 1. Transaction is confirmed on-chain
  // 2. Wallet is a signer of the transaction
  // 3. Transaction involves the expected mint
  // 4. SOL amount matches (within tolerance for fees)
  app.post("/api/launches/:id/confirm-sell", async (req, res) => {
    try {
      const { txSignature, walletAddress, tokenAmount, solReceived } = req.body;
      
      // Validate required parameters
      if (!txSignature || typeof txSignature !== 'string') {
        return res.status(400).json({ error: "Valid transaction signature required" });
      }
      
      if (!raydium.isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      // Validate numeric inputs
      const tokenAmountNum = Number(tokenAmount);
      if (!Number.isFinite(tokenAmountNum) || tokenAmountNum <= 0) {
        return res.status(400).json({ error: "Invalid token amount: must be a positive number" });
      }
      
      const solReceivedNum = Number(solReceived);
      if (!Number.isFinite(solReceivedNum) || solReceivedNum <= 0) {
        return res.status(400).json({ error: "Invalid SOL received: must be a positive number" });
      }
      
      const launch = await storage.getLaunchById(req.params.id);
      if (!launch) {
        return res.status(404).json({ error: "Launch not found" });
      }
      
      // Verify transaction on-chain: wallet is signer, mint is involved, amount matches
      const verification = await launchlab.verifyTradeTransaction({
        signature: txSignature,
        expectedWallet: walletAddress,
        expectedMint: launch.mintAddress,
        expectedSolAmount: solReceivedNum,
        isBuy: false,
      });
      
      if (!verification.valid) {
        return res.status(400).json({ 
          error: "Transaction verification failed", 
          details: verification.error 
        });
      }
      
      // Update volume with verified amount
      const verifiedSolReceived = verification.solAmount || solReceivedNum;
      const volume24h = (launch.volume24h || 0) + (verifiedSolReceived * 150);
      
      const updated = await storage.updateLaunch(req.params.id, {
        volume24h,
      });
      
      res.json({
        success: true,
        confirmed: true,
        verified: true,
        txSignature,
        solReceived: verifiedSolReceived,
        tokenAmount: tokenAmountNum,
        launch: updated ? calculateTokenMetrics(updated) : null,
      });
    } catch (error) {
      console.error('Error confirming sell:', error);
      res.status(500).json({ error: "Failed to confirm sell transaction" });
    }
  });

  // Check if we have a launch record for a mint address
  // Note: This checks our database, not on-chain pool existence
  app.get("/api/launches/by-mint/:mintAddress", async (req, res) => {
    try {
      if (!raydium.isValidSolanaAddress(req.params.mintAddress)) {
        return res.status(400).json({ error: "Invalid mint address" });
      }
      
      // Check if we have a launch record for this mint
      const launches = await storage.getAllLaunches();
      const launch = launches.find(l => l.mintAddress === req.params.mintAddress);
      
      if (!launch) {
        return res.status(404).json({ error: "No launch found for this mint address" });
      }
      
      res.json(calculateTokenMetrics(launch));
    } catch (error) {
      res.status(500).json({ error: "Failed to find launch" });
    }
  });

  return httpServer;
}
