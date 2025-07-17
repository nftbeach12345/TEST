import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { 
  users, 
  botConfig, 
  trades, 
  arbitrageOpportunities,
  User,
  NewUser,
  BotConfig,
  NewBotConfig,
  Trade,
  NewTrade,
  ArbitrageOpportunity,
  NewArbitrageOpportunity
} from '../shared/schema.js';

export class StorageService {
  private db: any;
  private isDbConnected = false;
  
  // In-memory fallback storage
  private memoryStorage = {
    users: new Map<string, User>(),
    botConfigs: new Map<string, BotConfig>(),
    trades: new Map<string, Trade>(),
    opportunities: new Map<string, ArbitrageOpportunity>()
  };

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.log('⚠️ No DATABASE_URL found, using in-memory storage');
        return;
      }

      const sql = neon(databaseUrl);
      this.db = drizzle(sql);
      
      // Test the connection
      await this.db.select().from(users).limit(1);
      this.isDbConnected = true;
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.log('⚠️ Database connection failed, using in-memory storage:', error.message);
      this.isDbConnected = false;
    }
  }

  // User operations
  async createUser(user: NewUser): Promise<User> {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(users).values(user).returning();
        return created;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const newUser: User = {
      ...user,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.memoryStorage.users.set(user.id, newUser);
    return newUser;
  }

  async getUserById(id: string): Promise<User | null> {
    if (this.isDbConnected) {
      try {
        const [user] = await this.db.select().from(users).where(eq(users.id, id));
        return user || null;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    return this.memoryStorage.users.get(id) || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    if (this.isDbConnected) {
      try {
        const [user] = await this.db.select().from(users).where(eq(users.username, username));
        return user || null;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    for (const user of this.memoryStorage.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  // Bot config operations
  async createBotConfig(config: NewBotConfig): Promise<BotConfig> {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(botConfig).values(config).returning();
        return created;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const newConfig: BotConfig = {
      ...config,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.memoryStorage.botConfigs.set(config.id, newConfig);
    return newConfig;
  }

  async getBotConfigById(id: string): Promise<BotConfig | null> {
    if (this.isDbConnected) {
      try {
        const [config] = await this.db.select().from(botConfig).where(eq(botConfig.id, id));
        return config || null;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    return this.memoryStorage.botConfigs.get(id) || null;
  }

  async getBotConfigsByUserId(userId: string): Promise<BotConfig[]> {
    if (this.isDbConnected) {
      try {
        const configs = await this.db.select().from(botConfig).where(eq(botConfig.userId, userId));
        return configs;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    return Array.from(this.memoryStorage.botConfigs.values()).filter(
      config => config.userId === userId
    );
  }

  async updateBotConfig(id: string, updates: Partial<NewBotConfig>): Promise<BotConfig | null> {
    if (this.isDbConnected) {
      try {
        const [updated] = await this.db
          .update(botConfig)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(botConfig.id, id))
          .returning();
        return updated || null;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const existing = this.memoryStorage.botConfigs.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      this.memoryStorage.botConfigs.set(id, updated);
      return updated;
    }
    return null;
  }

  // Trade operations
  async createTrade(trade: NewTrade): Promise<Trade> {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(trades).values(trade).returning();
        return created;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const newTrade: Trade = trade;
    this.memoryStorage.trades.set(trade.id, newTrade);
    return newTrade;
  }

  async updateTrade(id: string, updates: Partial<NewTrade>): Promise<Trade | null> {
    if (this.isDbConnected) {
      try {
        const [updated] = await this.db
          .update(trades)
          .set(updates)
          .where(eq(trades.id, id))
          .returning();
        return updated || null;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const existing = this.memoryStorage.trades.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.memoryStorage.trades.set(id, updated);
      return updated;
    }
    return null;
  }

  async getTradesByUserId(userId: string, limit: number = 50): Promise<Trade[]> {
    if (this.isDbConnected) {
      try {
        const tradeList = await this.db
          .select()
          .from(trades)
          .where(eq(trades.userId, userId))
          .limit(limit);
        return tradeList;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    return Array.from(this.memoryStorage.trades.values())
      .filter(trade => trade.userId === userId)
      .slice(0, limit);
  }

  // Arbitrage opportunity operations
  async createOpportunity(opportunity: NewArbitrageOpportunity): Promise<ArbitrageOpportunity> {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(arbitrageOpportunities).values(opportunity).returning();
        return created;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const newOpportunity: ArbitrageOpportunity = opportunity;
    this.memoryStorage.opportunities.set(opportunity.id, newOpportunity);
    return newOpportunity;
  }

  async updateOpportunity(id: string, updates: Partial<NewArbitrageOpportunity>): Promise<ArbitrageOpportunity | null> {
    if (this.isDbConnected) {
      try {
        const [updated] = await this.db
          .update(arbitrageOpportunities)
          .set(updates)
          .where(eq(arbitrageOpportunities.id, id))
          .returning();
        return updated || null;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    const existing = this.memoryStorage.opportunities.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.memoryStorage.opportunities.set(id, updated);
      return updated;
    }
    return null;
  }

  async getOpportunitiesByUserId(userId: string, limit: number = 100): Promise<ArbitrageOpportunity[]> {
    if (this.isDbConnected) {
      try {
        const opportunities = await this.db
          .select()
          .from(arbitrageOpportunities)
          .where(eq(arbitrageOpportunities.userId, userId))
          .limit(limit);
        return opportunities;
      } catch (error) {
        console.error('Database error, falling back to memory:', error);
        this.isDbConnected = false;
      }
    }
    
    // Memory fallback
    return Array.from(this.memoryStorage.opportunities.values())
      .filter(opportunity => opportunity.userId === userId)
      .slice(0, limit);
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (this.isDbConnected) {
      try {
        await this.db.select().from(users).limit(1);
        return true;
      } catch (error) {
        console.error('Database health check failed:', error);
        this.isDbConnected = false;
        return false;
      }
    }
    return true; // Memory storage is always "healthy"
  }

  get connected(): boolean {
    return this.isDbConnected;
  }
}