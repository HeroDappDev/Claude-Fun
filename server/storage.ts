// Database storage implementation using Drizzle ORM
import { users, tokenLaunches, type User, type InsertUser, type TokenLaunch, type InsertTokenLaunch } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Token launches
  getAllLaunches(): Promise<TokenLaunch[]>;
  getActiveLaunches(): Promise<TokenLaunch[]>;
  getLaunchById(id: string): Promise<TokenLaunch | undefined>;
  getLaunchByMint(mintAddress: string): Promise<TokenLaunch | undefined>;
  createLaunch(launch: InsertTokenLaunch): Promise<TokenLaunch>;
  updateLaunch(id: string, updates: Partial<TokenLaunch>): Promise<TokenLaunch | undefined>;
  deleteLaunch(id: string): Promise<boolean>;
  clearAllLaunches(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllLaunches(): Promise<TokenLaunch[]> {
    return db.select().from(tokenLaunches).orderBy(desc(tokenLaunches.createdAt));
  }

  async getActiveLaunches(): Promise<TokenLaunch[]> {
    return db.select().from(tokenLaunches).where(eq(tokenLaunches.status, 'active')).orderBy(desc(tokenLaunches.createdAt));
  }

  async getLaunchById(id: string): Promise<TokenLaunch | undefined> {
    const [launch] = await db.select().from(tokenLaunches).where(eq(tokenLaunches.id, id));
    return launch || undefined;
  }

  async getLaunchByMint(mintAddress: string): Promise<TokenLaunch | undefined> {
    const [launch] = await db.select().from(tokenLaunches).where(eq(tokenLaunches.mintAddress, mintAddress));
    return launch || undefined;
  }

  async createLaunch(insertLaunch: InsertTokenLaunch): Promise<TokenLaunch> {
    const [launch] = await db.insert(tokenLaunches).values(insertLaunch).returning();
    return launch;
  }

  async updateLaunch(id: string, updates: Partial<TokenLaunch>): Promise<TokenLaunch | undefined> {
    const [updated] = await db
      .update(tokenLaunches)
      .set(updates)
      .where(eq(tokenLaunches.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteLaunch(id: string): Promise<boolean> {
    const result = await db.delete(tokenLaunches).where(eq(tokenLaunches.id, id)).returning();
    return result.length > 0;
  }

  async clearAllLaunches(): Promise<void> {
    await db.delete(tokenLaunches);
  }
}

export const storage = new DatabaseStorage();
