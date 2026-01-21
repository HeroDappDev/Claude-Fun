import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Curve type enum
export const CurveType = {
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential',
  LOGARITHMIC: 'logarithmic',
} as const;

export type CurveTypeValue = typeof CurveType[keyof typeof CurveType];

// Token launch status
export const LaunchStatus = {
  ACTIVE: 'active',
  GRADUATED: 'graduated',
  FAILED: 'failed',
} as const;

export type LaunchStatusValue = typeof LaunchStatus[keyof typeof LaunchStatus];

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Token launches table (for tracking in backend, though most data comes from chain)
export const tokenLaunches = pgTable("token_launches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mintAddress: text("mint_address").notNull().unique(),
  poolId: text("pool_id"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  metadataUri: text("metadata_uri"),
  website: text("website"),
  twitter: text("twitter"),
  telegram: text("telegram"),
  curveType: text("curve_type").notNull(),
  totalSupply: text("total_supply").notNull(),
  fundraisingTarget: text("fundraising_target").notNull(),
  currentRaised: text("current_raised").notNull().default("0"),
  creatorAddress: text("creator_address").notNull(),
  status: text("status").notNull().default("active"),
  txSignature: text("tx_signature"),
  platformId: text("platform_id"),
  holders: integer("holders").default(0),
  volume24h: integer("volume_24h").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTokenLaunchSchema = createInsertSchema(tokenLaunches).omit({
  id: true,
  createdAt: true,
}).extend({
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  metadataUri: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  twitter: z.string().nullable().optional(),
  telegram: z.string().nullable().optional(),
  currentRaised: z.string().optional().default("0"),
  status: z.string().optional().default("active"),
  poolId: z.string().nullable().optional(),
  txSignature: z.string().nullable().optional(),
  platformId: z.string().nullable().optional(),
  holders: z.number().optional().default(0),
  volume24h: z.number().optional().default(0),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTokenLaunch = z.infer<typeof insertTokenLaunchSchema>;
export type TokenLaunch = typeof tokenLaunches.$inferSelect;

// Frontend-specific types for Solana integration
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  totalSupply: string;
}

export interface BondingCurveConfig {
  curveType: CurveTypeValue;
  initialPrice: number;
  slope: number;
  fundraisingTarget: number;
}

export interface LaunchConfig extends TokenMetadata, BondingCurveConfig {}

export interface ActiveLaunch {
  id: string;
  mintAddress: string;
  poolId?: string | null;
  name: string;
  symbol: string;
  description: string;
  imageUrl?: string | null;
  metadataUri?: string | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  curveType: CurveTypeValue;
  totalSupply: string;
  fundraisingTarget: number;
  currentRaised: number;
  progress: number;
  currentPrice: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  creatorAddress: string;
  age: string;
  status: LaunchStatusValue;
  txSignature?: string | null;
  platformId?: string | null;
}

export interface TradeQuote {
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  fee: number;
  averagePrice: number;
}

// Bonding curve calculation helpers
export const calculateLinearPrice = (supply: number, k: number, initialPrice: number): number => {
  return initialPrice + k * supply;
};

export const calculateExponentialPrice = (supply: number, k: number, initialPrice: number): number => {
  return initialPrice * Math.pow(1 + k, supply / 1e9);
};

export const calculateLogarithmicPrice = (supply: number, k: number, initialPrice: number): number => {
  return initialPrice + k * Math.log(1 + supply / 1e9);
};

export const calculatePrice = (
  supply: number,
  curveType: CurveTypeValue,
  k: number,
  initialPrice: number
): number => {
  switch (curveType) {
    case CurveType.LINEAR:
      return calculateLinearPrice(supply, k, initialPrice);
    case CurveType.EXPONENTIAL:
      return calculateExponentialPrice(supply, k, initialPrice);
    case CurveType.LOGARITHMIC:
      return calculateLogarithmicPrice(supply, k, initialPrice);
    default:
      return initialPrice;
  }
};

// Form validation schemas
export const launchFormSchema = z.object({
  name: z.string().min(1, "Token name is required").max(32, "Name too long"),
  symbol: z.string().min(1, "Symbol is required").max(10, "Symbol too long").toUpperCase(),
  description: z.string().max(200, "Description too long").optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal('')),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  totalSupply: z.string().default("1000000000"),
  curveType: z.enum(['linear', 'exponential', 'logarithmic']).default('linear'),
  fundraisingTarget: z.string().default("85"),
  initialPurchase: z.string().default("0"),
});

export type LaunchFormData = z.infer<typeof launchFormSchema>;

export const tradeFormSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  slippage: z.number().min(0.1).max(50).default(1),
});

export type TradeFormData = z.infer<typeof tradeFormSchema>;
