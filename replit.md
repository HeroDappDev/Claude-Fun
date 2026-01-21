# Claude.fun - Solana Token Launchpad

## Overview
Claude.fun is a Solana mainnet token launchpad application allowing users to launch tokens with bonding curves (linear, exponential, or logarithmic), trade them on the curve, and automatically graduate to Raydium CPMM pools when the fundraising target (85 SOL) is reached.

## Current State
MVP implementation with Raydium LaunchLab integration:
- Complete terminal/hacker aesthetic UI with orange/amber color scheme
- Phantom wallet-only integration via Solana wallet adapter
- Token launch form with bonding curve selection and initial purchase
- Token list table with search/filter/sort functionality
- Trading interface with buy/sell panels
- Mainnet warning modal for user safety
- PostgreSQL database for persistent storage
- IPFS metadata storage via Pinata for permanent token metadata
- Raydium LaunchLab SDK integration for on-chain pool creation

## Architecture

### Frontend (client/)
- React 18 with TypeScript
- Vite for bundling
- TanStack Query for data fetching
- Wouter for routing
- Shadcn/UI components with Radix primitives
- Solana wallet adapter for Phantom integration
- JetBrains Mono / Fira Code fonts

### Backend (server/)
- Express.js with TypeScript
- PostgreSQL database with Drizzle ORM
- RESTful API endpoints
- Bonding curve calculation logic
- Pinata IPFS integration for metadata storage

### Shared (shared/)
- TypeScript types and Zod validation schemas
- Token launch interfaces
- Curve type definitions

## Key Files
- `client/src/index.css` - Terminal design system with scanline effects
- `shared/schema.ts` - TypeScript types and Zod schemas
- `server/routes.ts` - API endpoints for launches, buy/sell, image upload
- `server/storage.ts` - PostgreSQL storage with Drizzle ORM
- `server/db.ts` - Database connection pool
- `client/src/lib/solana.ts` - Bonding curve math and Solana utilities
- `client/src/hooks/useRaydium.ts` - Raydium SDK hook with buy/sell functions
- `client/src/hooks/useDexScreener.ts` - DexScreener API hook for live token data
- `client/src/components/WalletProvider.tsx` - Phantom wallet integration
- `client/src/components/TokenImageUpload.tsx` - Token image upload with validation
- `client/src/pages/Home.tsx` - Main token list page
- `client/src/pages/Trade.tsx` - Trading interface with DexScreener chart
- `client/src/pages/Create.tsx` - Token launch form with image upload

## Routes
- `/` - Home page with token list and platform stats
- `/create` - Token creation form
- `/trade/:id` - Trading interface for specific token
- `/docs` - Comprehensive documentation page

## API Endpoints
- `GET /api/launches` - Get all token launches
- `GET /api/launches/:id` - Get single token launch
- `POST /api/launches` - Create new token launch
- `POST /api/launches/:id/buy` - Execute buy transaction
- `POST /api/launches/:id/sell` - Execute sell transaction
- `POST /api/launches/:id/confirm-buy` - Confirm on-chain buy with verification
- `POST /api/launches/:id/confirm-sell` - Confirm on-chain sell with verification
- `POST /api/launches/:id/quote/buy` - Get buy quote with tokens received, fee, price impact
- `POST /api/launches/:id/quote/sell` - Get sell quote with SOL received, fee, price impact
- `GET /api/launches/:id/price` - Get current token price and progress
- `GET /api/stats` - Get platform statistics
- `POST /api/upload/image` - Upload token image (max 5MB, 1:1 aspect ratio)
- `POST /api/transactions/create-token` - Build token creation transaction
- `POST /api/transactions/confirm` - Confirm and verify token creation
- `GET /api/transactions/:signature/status` - Get transaction status
- `GET /api/blockhash` - Get recent blockhash for transactions
- `GET /api/estimate-fee` - Estimate transaction fee
- `GET /api/launches/by-mint/:mintAddress` - Get launch by mint address

## Bonding Curve Formulas
- **Linear**: `price = initialPrice + (slope × supply)`
- **Exponential**: `price = initialPrice × (1 + rate)^supply`
- **Logarithmic**: `price = initialPrice × (1 + multiplier × ln(1 + supply))`

## Design System
- Background: Pure black (#000000)
- Primary: Green (#22c55e) with terminal glow
- Secondary: Cyan (#06b6d4)
- Accent: Orange/amber for warnings
- Fonts: JetBrains Mono, Fira Code, Source Code Pro
- Effects: Scanlines, cursor blink, ASCII art

## Fee Structure
- **Trading Fee**: 0.25% (25 basis points) on all buy/sell transactions
- **Fee Recipient**: Platform treasury wallet (8kt95geX4dXzVzeEdBBYzxM1XD27dSgaXUD85fEss2Di)
- **Token Creation**: Only network fees (rent + transaction fee, ~0.01 SOL)
- **LP Burn**: 100% of LP tokens burned on graduation (no fee, just mechanism)

Note: Currently trading is simulated in-memory. For production, on-chain trading would require building transactions that include SOL transfers to the treasury wallet.

## Security Features
- Multi-layer on-chain verification before persisting launches
- Transaction parsing validates: createAccount, initializeMint, ATA creation, mintTo
- Signer verification ensures creator signed the transaction
- On-chain state verification via getMint() and getAccount()
- Validates: supply, decimals, mint authority, freeze authority, ATA balance
- Trade confirmation verifies: wallet signer, mint involvement, token balance direction, SOL amount

## Trade Confirmation Architecture
The platform uses a hybrid trading verification approach:

**LaunchLab Pools (On-Chain)**
- Trading is executed via Raydium SDK's `launchpad.buyToken/sellToken`
- SDK handles full on-chain verification: pool state, amounts, signatures
- Server's confirm-buy/sell endpoints record already-verified trades

**Custom SPL Tokens (Simulated)**
- Server verifies: wallet is transaction signer, mint is involved in token transfers
- Token balance direction validated (increase for buy, decrease for sell)
- SOL amount verified from balance changes (5% tolerance for fees)
- Note: Full pool-level verification requires real LaunchLab pools

## Trading Architecture

### Hybrid Trading System
The platform supports two trading modes:

**1. Raydium LaunchLab Pools (On-Chain)**
- Tokens created via LaunchLab have real on-chain bonding curves
- Uses `@raydium-io/raydium-sdk-v2` for transaction building
- Trading executes on-chain via LaunchLab program
- Graduation to Raydium CPMM is automatic at 85 SOL target

**2. Custom SPL Tokens (Simulated)**
- Tokens created via custom mint process
- Bonding curve quotes calculated locally
- Trades recorded in database (not on-chain)
- For demonstration/testing purposes

### Quote API Endpoints
- `POST /api/launches/:id/quote/buy` - Get buy quote with tokens received, fee, price impact
- `POST /api/launches/:id/quote/sell` - Get sell quote with SOL received, fee, price impact
- `GET /api/launches/:id/price` - Get current token price and progress

### Raydium SDK Integration
- `client/src/hooks/useRaydium.ts` - React hook for SDK initialization with wallet adapter
- Uses `Raydium.load()` with wallet's `signAllTransactions` for client-side signing
- Automatic pool detection via `checkPoolExists()`
- Direct on-chain buy/sell via `raydium.launchpad.buyToken/sellToken`

### Key Files
- `client/src/hooks/useRaydium.ts` - Raydium SDK hook with buy/sell functions
- `client/src/lib/launchlab.ts` - Quote calculations and pool info utilities
- `server/raydium-launchlab.ts` - Server-side LaunchLab utilities

## Live Data Integration

### Raydium Pool Data (Primary - On-Chain)
- Fetches data directly from Raydium LaunchLab pool accounts on Solana
- Provides: current price (SOL), total raised, tokens sold, bonding curve progress
- Auto-refresh every 10-15 seconds
- Hook: `client/src/hooks/useRaydiumPool.ts`

### DexScreener (Secondary - USD Prices & Charts)
- Live token data: price (USD), market cap (USD), 24h volume, liquidity, price changes
- Auto-refresh every 10 seconds
- Embedded DexScreener chart iframe on trade pages
- Pair selection prefers Raydium pairs, then highest liquidity pair
- Link to view full chart on DexScreener
- Hook: `client/src/hooks/useDexScreener.ts`

### Data Priority
1. Raydium on-chain pool data for SOL-based metrics (price, raised, progress)
2. DexScreener for USD conversions and trading metrics when available
3. Database fallback for tokens not yet indexed

## Next Steps for Production

### Token Creation via LaunchLab
To enable full on-chain trading for new tokens:
1. Update LaunchForm to use `raydium.launchpad.createPool()` instead of custom mint
2. This creates both the token AND bonding curve pool in one transaction
3. All subsequent trades will be on-chain automatically

### Other Improvements
1. Persistent database storage (PostgreSQL)
2. Real-time WebSocket updates for price/balance changes
3. Transaction history from chain
4. Wallet balance display and refresh
