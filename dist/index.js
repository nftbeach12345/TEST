// server/index.ts
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

// server/solana-service.ts
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

// shared/types.ts
var COMMON_TOKENS = [
  {
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
  },
  {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png"
  },
  {
    address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    symbol: "mSOL",
    name: "Marinade staked SOL",
    decimals: 9,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png"
  },
  {
    address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 8,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png"
  }
];
var JUPITER_API_BASE = "https://quote-api.jup.ag/v6";
var DEFAULT_SLIPPAGE_BPS = 50;

// server/solana-service.ts
import axios from "axios";
import bs58 from "bs58";
var SolanaService = class {
  connection;
  wallet;
  constructor(rpcUrl = "https://api.mainnet-beta.solana.com") {
    this.connection = new Connection(rpcUrl, "confirmed");
  }
  async initialize() {
    try {
      await this.connection.getVersion();
      console.log("\u2705 Solana RPC connection established");
      return true;
    } catch (error) {
      console.error("\u274C Failed to connect to Solana RPC:", error);
      return false;
    }
  }
  setWallet(privateKeyString) {
    try {
      let privateKeyBytes;
      if (privateKeyString.startsWith("[") && privateKeyString.endsWith("]")) {
        const keyArray = JSON.parse(privateKeyString);
        privateKeyBytes = new Uint8Array(keyArray);
      } else {
        privateKeyBytes = bs58.decode(privateKeyString);
      }
      this.wallet = Keypair.fromSecretKey(privateKeyBytes);
      console.log("\u2705 Wallet loaded:", this.wallet.publicKey.toBase58());
      return true;
    } catch (error) {
      console.error("\u274C Failed to load wallet:", error);
      return false;
    }
  }
  getWalletAddress() {
    return this.wallet?.publicKey.toBase58() || null;
  }
  async getBalance(tokenMint) {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }
    try {
      if (!tokenMint || tokenMint === "So11111111111111111111111111111111111111112") {
        const balance = await this.connection.getBalance(this.wallet.publicKey);
        return balance / 1e9;
      } else {
        return 0;
      }
    } catch (error) {
      console.error("Error getting balance:", error);
      return 0;
    }
  }
  async getQuote(inputMint, outputMint, amount, slippageBps = DEFAULT_SLIPPAGE_BPS) {
    try {
      const response = await axios.get(`${JUPITER_API_BASE}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount: Math.floor(amount * 1e9),
          // Convert to lamports/smallest unit
          slippageBps,
          onlyDirectRoutes: false,
          asLegacyTransaction: false
        },
        timeout: 1e4
      });
      return response.data;
    } catch (error) {
      console.error("Error getting Jupiter quote:", error);
      return null;
    }
  }
  async getSwapTransaction(quoteResponse) {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }
    try {
      const response = await axios.post(`${JUPITER_API_BASE}/swap`, {
        quoteResponse,
        userPublicKey: this.wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto"
      }, {
        timeout: 1e4
      });
      return response.data;
    } catch (error) {
      console.error("Error getting swap transaction:", error);
      return null;
    }
  }
  async executeSwap(swapTransaction) {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }
    try {
      const transactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      transaction.sign([this.wallet]);
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false
      });
      const confirmation = await this.connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) {
        console.error("Transaction failed:", confirmation.value.err);
        return null;
      }
      console.log("\u2705 Transaction confirmed:", signature);
      return signature;
    } catch (error) {
      console.error("Error executing swap:", error);
      return null;
    }
  }
  async simulateArbitrageOpportunity(tokenA, tokenB, amount) {
    try {
      const quoteAtoB = await this.getQuote(tokenA, tokenB, amount);
      if (!quoteAtoB) return null;
      const quoteBtoA = await this.getQuote(tokenB, tokenA, parseInt(quoteAtoB.outAmount) / 1e9);
      if (!quoteBtoA) return null;
      const inputAmount = amount;
      const outputAmount = parseInt(quoteBtoA.outAmount) / 1e9;
      const profit = outputAmount - inputAmount;
      const profitPercentage = profit / inputAmount * 100;
      const priceA = parseInt(quoteAtoB.outAmount) / (parseInt(quoteAtoB.inAmount) / 1e9);
      const priceB = parseInt(quoteBtoA.outAmount) / (parseInt(quoteBtoA.inAmount) / 1e9);
      return {
        profitOpportunity: profit,
        profitPercentage,
        priceA,
        priceB
      };
    } catch (error) {
      console.error("Error simulating arbitrage:", error);
      return null;
    }
  }
  async executeArbitrage(tokenA, tokenB, amount, mockMode = true) {
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        const simulation = await this.simulateArbitrageOpportunity(tokenA, tokenB, amount);
        if (!simulation) {
          return { success: false, error: "Failed to simulate trade" };
        }
        return {
          success: true,
          txSignature: "mock_tx_" + Date.now(),
          profit: simulation.profitOpportunity
        };
      }
      if (!this.wallet) {
        return { success: false, error: "Wallet not initialized" };
      }
      const quoteAtoB = await this.getQuote(tokenA, tokenB, amount);
      if (!quoteAtoB) {
        return { success: false, error: "Failed to get quote A->B" };
      }
      const swapTxAtoB = await this.getSwapTransaction(quoteAtoB);
      if (!swapTxAtoB) {
        return { success: false, error: "Failed to get swap transaction A->B" };
      }
      const txSignature1 = await this.executeSwap(swapTxAtoB.swapTransaction);
      if (!txSignature1) {
        return { success: false, error: "Failed to execute swap A->B" };
      }
      const quoteBtoA = await this.getQuote(tokenB, tokenA, parseInt(quoteAtoB.outAmount) / 1e9);
      if (!quoteBtoA) {
        return { success: false, error: "Failed to get quote B->A" };
      }
      const swapTxBtoA = await this.getSwapTransaction(quoteBtoA);
      if (!swapTxBtoA) {
        return { success: false, error: "Failed to get swap transaction B->A" };
      }
      const txSignature2 = await this.executeSwap(swapTxBtoA.swapTransaction);
      if (!txSignature2) {
        return { success: false, error: "Failed to execute swap B->A" };
      }
      const finalAmount = parseInt(quoteBtoA.outAmount) / 1e9;
      const profit = finalAmount - amount;
      return {
        success: true,
        txSignature: txSignature2,
        // Return the final transaction
        profit
      };
    } catch (error) {
      console.error("Error executing arbitrage:", error);
      return { success: false, error: error.message };
    }
  }
  // Rate limiting helper
  lastRequestTime = 0;
  MIN_REQUEST_INTERVAL = 1e3;
  // 1 second between requests
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.lastRequestTime = Date.now();
  }
  async healthCheck() {
    try {
      await this.connection.getVersion();
      return true;
    } catch (error) {
      console.error("Solana health check failed:", error);
      return false;
    }
  }
};

// server/storage-service.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

// shared/schema.ts
import { pgTable, text, integer, timestamp, boolean, decimal } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var botConfig = pgTable("bot_config", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  tokenA: text("token_a").notNull(),
  tokenB: text("token_b").notNull(),
  profitThreshold: decimal("profit_threshold", { precision: 10, scale: 4 }).notNull(),
  maxTradeAmount: decimal("max_trade_amount", { precision: 18, scale: 9 }).notNull(),
  scanInterval: integer("scan_interval").notNull().default(15),
  // seconds
  isActive: boolean("is_active").default(false).notNull(),
  walletAddress: text("wallet_address"),
  privateKey: text("private_key"),
  // This should be encrypted in production
  mockMode: boolean("mock_mode").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var trades = pgTable("trades", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  configId: text("config_id").references(() => botConfig.id).notNull(),
  tokenA: text("token_a").notNull(),
  tokenB: text("token_b").notNull(),
  amountIn: decimal("amount_in", { precision: 18, scale: 9 }).notNull(),
  amountOut: decimal("amount_out", { precision: 18, scale: 9 }).notNull(),
  profit: decimal("profit", { precision: 18, scale: 9 }).notNull(),
  profitPercentage: decimal("profit_percentage", { precision: 10, scale: 4 }).notNull(),
  txSignature: text("tx_signature"),
  status: text("status").notNull(),
  // 'pending', 'completed', 'failed'
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  isMock: boolean("is_mock").default(true).notNull()
});
var arbitrageOpportunities = pgTable("arbitrage_opportunities", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  tokenA: text("token_a").notNull(),
  tokenB: text("token_b").notNull(),
  priceA: decimal("price_a", { precision: 18, scale: 9 }).notNull(),
  priceB: decimal("price_b", { precision: 18, scale: 9 }).notNull(),
  profitOpportunity: decimal("profit_opportunity", { precision: 18, scale: 9 }).notNull(),
  profitPercentage: decimal("profit_percentage", { precision: 10, scale: 4 }).notNull(),
  amountRequired: decimal("amount_required", { precision: 18, scale: 9 }).notNull(),
  dexA: text("dex_a").notNull(),
  dexB: text("dex_b").notNull(),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  wasExecuted: boolean("was_executed").default(false).notNull(),
  executedTradeId: text("executed_trade_id").references(() => trades.id)
});

// server/storage-service.ts
var StorageService = class {
  db;
  isDbConnected = false;
  // In-memory fallback storage
  memoryStorage = {
    users: /* @__PURE__ */ new Map(),
    botConfigs: /* @__PURE__ */ new Map(),
    trades: /* @__PURE__ */ new Map(),
    opportunities: /* @__PURE__ */ new Map()
  };
  constructor() {
    this.initializeDatabase();
  }
  async initializeDatabase() {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.log("\u26A0\uFE0F No DATABASE_URL found, using in-memory storage");
        return;
      }
      const sql = neon(databaseUrl);
      this.db = drizzle(sql);
      await this.db.select().from(users).limit(1);
      this.isDbConnected = true;
      console.log("\u2705 Database connected successfully");
    } catch (error) {
      console.log("\u26A0\uFE0F Database connection failed, using in-memory storage:", error.message);
      this.isDbConnected = false;
    }
  }
  // User operations
  async createUser(user) {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(users).values(user).returning();
        return created;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const newUser = {
      ...user,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.memoryStorage.users.set(user.id, newUser);
    return newUser;
  }
  async getUserById(id) {
    if (this.isDbConnected) {
      try {
        const [user] = await this.db.select().from(users).where(eq(users.id, id));
        return user || null;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    return this.memoryStorage.users.get(id) || null;
  }
  async getUserByUsername(username) {
    if (this.isDbConnected) {
      try {
        const [user] = await this.db.select().from(users).where(eq(users.username, username));
        return user || null;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    for (const user of this.memoryStorage.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }
  // Bot config operations
  async createBotConfig(config) {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(botConfig).values(config).returning();
        return created;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const newConfig = {
      ...config,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.memoryStorage.botConfigs.set(config.id, newConfig);
    return newConfig;
  }
  async getBotConfigById(id) {
    if (this.isDbConnected) {
      try {
        const [config] = await this.db.select().from(botConfig).where(eq(botConfig.id, id));
        return config || null;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    return this.memoryStorage.botConfigs.get(id) || null;
  }
  async getBotConfigsByUserId(userId) {
    if (this.isDbConnected) {
      try {
        const configs = await this.db.select().from(botConfig).where(eq(botConfig.userId, userId));
        return configs;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    return Array.from(this.memoryStorage.botConfigs.values()).filter(
      (config) => config.userId === userId
    );
  }
  async updateBotConfig(id, updates) {
    if (this.isDbConnected) {
      try {
        const [updated] = await this.db.update(botConfig).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(botConfig.id, id)).returning();
        return updated || null;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const existing = this.memoryStorage.botConfigs.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: /* @__PURE__ */ new Date() };
      this.memoryStorage.botConfigs.set(id, updated);
      return updated;
    }
    return null;
  }
  // Trade operations
  async createTrade(trade) {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(trades).values(trade).returning();
        return created;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const newTrade = trade;
    this.memoryStorage.trades.set(trade.id, newTrade);
    return newTrade;
  }
  async updateTrade(id, updates) {
    if (this.isDbConnected) {
      try {
        const [updated] = await this.db.update(trades).set(updates).where(eq(trades.id, id)).returning();
        return updated || null;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const existing = this.memoryStorage.trades.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.memoryStorage.trades.set(id, updated);
      return updated;
    }
    return null;
  }
  async getTradesByUserId(userId, limit = 50) {
    if (this.isDbConnected) {
      try {
        const tradeList = await this.db.select().from(trades).where(eq(trades.userId, userId)).limit(limit);
        return tradeList;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    return Array.from(this.memoryStorage.trades.values()).filter((trade) => trade.userId === userId).slice(0, limit);
  }
  // Arbitrage opportunity operations
  async createOpportunity(opportunity) {
    if (this.isDbConnected) {
      try {
        const [created] = await this.db.insert(arbitrageOpportunities).values(opportunity).returning();
        return created;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const newOpportunity = opportunity;
    this.memoryStorage.opportunities.set(opportunity.id, newOpportunity);
    return newOpportunity;
  }
  async updateOpportunity(id, updates) {
    if (this.isDbConnected) {
      try {
        const [updated] = await this.db.update(arbitrageOpportunities).set(updates).where(eq(arbitrageOpportunities.id, id)).returning();
        return updated || null;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    const existing = this.memoryStorage.opportunities.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.memoryStorage.opportunities.set(id, updated);
      return updated;
    }
    return null;
  }
  async getOpportunitiesByUserId(userId, limit = 100) {
    if (this.isDbConnected) {
      try {
        const opportunities = await this.db.select().from(arbitrageOpportunities).where(eq(arbitrageOpportunities.userId, userId)).limit(limit);
        return opportunities;
      } catch (error) {
        console.error("Database error, falling back to memory:", error);
        this.isDbConnected = false;
      }
    }
    return Array.from(this.memoryStorage.opportunities.values()).filter((opportunity) => opportunity.userId === userId).slice(0, limit);
  }
  // Health check
  async healthCheck() {
    if (this.isDbConnected) {
      try {
        await this.db.select().from(users).limit(1);
        return true;
      } catch (error) {
        console.error("Database health check failed:", error);
        this.isDbConnected = false;
        return false;
      }
    }
    return true;
  }
  get connected() {
    return this.isDbConnected;
  }
};

// server/websocket-service.ts
import { WebSocketServer, WebSocket } from "ws";
var WebSocketService = class {
  wss;
  clients = /* @__PURE__ */ new Set();
  constructor(server2) {
    this.wss = new WebSocketServer({
      server: server2,
      path: "/ws"
    });
    this.wss.on("connection", (ws, request) => {
      this.handleConnection(ws, request);
    });
    console.log("\u{1F4E1} WebSocket server initialized");
  }
  handleConnection(ws, request) {
    console.log("\u{1F50C} New WebSocket connection from:", request.socket.remoteAddress);
    this.clients.add(ws);
    this.sendToClient(ws, {
      type: "connection",
      data: { status: "connected" },
      timestamp: Date.now()
    });
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    });
    ws.on("close", () => {
      console.log("\u{1F50C} WebSocket connection closed");
      this.clients.delete(ws);
    });
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.clients.delete(ws);
    });
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, {
          type: "heartbeat",
          timestamp: Date.now()
        });
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 3e4);
  }
  handleMessage(ws, message) {
    console.log("\u{1F4E8} Received WebSocket message:", message.type);
    switch (message.type) {
      case "ping":
        this.sendToClient(ws, {
          type: "pong",
          timestamp: Date.now()
        });
        break;
      case "subscribe":
        this.sendToClient(ws, {
          type: "subscribed",
          data: { channel: message.channel },
          timestamp: Date.now()
        });
        break;
      default:
        console.log("Unknown message type:", message.type);
    }
  }
  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending message to client:", error);
        this.clients.delete(ws);
      }
    }
  }
  // Broadcast message to all connected clients
  broadcast(message) {
    const messageString = JSON.stringify(message);
    const deadClients = [];
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
        } catch (error) {
          console.error("Error broadcasting to client:", error);
          deadClients.push(client);
        }
      } else {
        deadClients.push(client);
      }
    });
    deadClients.forEach((client) => {
      this.clients.delete(client);
    });
    console.log(`\u{1F4E1} Broadcasted ${message.type} to ${this.clients.size} clients`);
  }
  // Send message to specific client (if needed in the future)
  sendToSpecificClient(clientId, message) {
    this.broadcast(message);
  }
  // Get connection stats
  getStats() {
    return {
      connectedClients: this.clients.size,
      totalConnections: this.clients.size
      // Could track historical data
    };
  }
  // Close all connections (for graceful shutdown)
  closeAllConnections() {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1e3, "Server shutting down");
      }
    });
    this.clients.clear();
    console.log("\u{1F50C} All WebSocket connections closed");
  }
};

// server/arbitrage-bot.ts
import { nanoid } from "nanoid";
var ArbitrageBot = class {
  solanaService;
  storageService;
  wsService;
  isRunning = false;
  scanInterval;
  currentConfig;
  lastScanTime = 0;
  errorCount = 0;
  MAX_ERRORS = 5;
  constructor(solanaService2, storageService2, wsService2) {
    this.solanaService = solanaService2;
    this.storageService = storageService2;
    this.wsService = wsService2;
  }
  async start(config) {
    if (this.isRunning) {
      console.log("Bot is already running");
      return false;
    }
    try {
      this.currentConfig = config;
      this.errorCount = 0;
      if (config.privateKey) {
        const walletLoaded = this.solanaService.setWallet(config.privateKey);
        if (!walletLoaded) {
          throw new Error("Failed to load wallet");
        }
      }
      this.isRunning = true;
      this.startScanning();
      this.broadcastBotStatus();
      console.log(`\u{1F680} Arbitrage bot started for ${config.tokenA} <-> ${config.tokenB}`);
      console.log(`\u{1F4CA} Profit threshold: ${config.profitThreshold}%`);
      console.log(`\u{1F4B0} Max trade amount: ${config.maxTradeAmount}`);
      console.log(`\u23F1\uFE0F Scan interval: ${config.scanInterval}s`);
      console.log(`\u{1F527} Mock mode: ${config.mockMode ? "ON" : "OFF"}`);
      return true;
    } catch (error) {
      console.error("Failed to start bot:", error);
      this.isRunning = false;
      this.broadcastBotStatus(error.message);
      return false;
    }
  }
  async stop() {
    if (!this.isRunning) {
      console.log("Bot is not running");
      return;
    }
    this.isRunning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = void 0;
    }
    this.broadcastBotStatus();
    console.log("\u{1F6D1} Arbitrage bot stopped");
  }
  startScanning() {
    if (!this.currentConfig) return;
    const scanIntervalMs = this.currentConfig.scanInterval * 1e3;
    this.scanForOpportunities();
    this.scanInterval = setInterval(() => {
      this.scanForOpportunities();
    }, scanIntervalMs);
  }
  async scanForOpportunities() {
    if (!this.isRunning || !this.currentConfig) return;
    try {
      this.lastScanTime = Date.now();
      const opportunity = await this.solanaService.simulateArbitrageOpportunity(
        this.currentConfig.tokenA,
        this.currentConfig.tokenB,
        parseFloat(this.currentConfig.maxTradeAmount)
      );
      if (!opportunity) {
        console.log("No arbitrage data available");
        return;
      }
      if (opportunity.profitPercentage >= parseFloat(this.currentConfig.profitThreshold)) {
        console.log(`\u{1F3AF} Arbitrage opportunity detected: ${opportunity.profitPercentage.toFixed(4)}% profit`);
        const opportunityRecord = await this.recordOpportunity(opportunity);
        this.broadcastOpportunity(opportunityRecord);
        await this.executeTrade(opportunityRecord);
      } else {
        console.log(`\u{1F4C9} Opportunity below threshold: ${opportunity.profitPercentage.toFixed(4)}% < ${this.currentConfig.profitThreshold}%`);
      }
      this.errorCount = 0;
    } catch (error) {
      console.error("Error during opportunity scan:", error);
      this.errorCount++;
      if (this.errorCount >= this.MAX_ERRORS) {
        console.error("Too many errors, stopping bot");
        await this.stop();
        this.broadcastBotStatus("Too many errors occurred");
      }
    }
  }
  async recordOpportunity(opportunity) {
    const record = {
      id: nanoid(),
      userId: this.currentConfig.userId,
      tokenA: this.currentConfig.tokenA,
      tokenB: this.currentConfig.tokenB,
      priceA: opportunity.priceA.toString(),
      priceB: opportunity.priceB.toString(),
      profitOpportunity: opportunity.profitOpportunity.toString(),
      profitPercentage: opportunity.profitPercentage.toString(),
      amountRequired: this.currentConfig.maxTradeAmount,
      dexA: "Jupiter",
      dexB: "Jupiter",
      detectedAt: /* @__PURE__ */ new Date(),
      wasExecuted: false
    };
    await this.storageService.createOpportunity(record);
    return record;
  }
  async executeTrade(opportunity) {
    if (!this.currentConfig) return;
    const tradeId = nanoid();
    console.log(`\u{1F504} Executing trade ${tradeId}...`);
    const tradeRecord = {
      id: tradeId,
      userId: this.currentConfig.userId,
      configId: this.currentConfig.id,
      tokenA: this.currentConfig.tokenA,
      tokenB: this.currentConfig.tokenB,
      amountIn: this.currentConfig.maxTradeAmount,
      amountOut: "0",
      profit: "0",
      profitPercentage: "0",
      status: "pending",
      executedAt: /* @__PURE__ */ new Date(),
      isMock: this.currentConfig.mockMode
    };
    await this.storageService.createTrade(tradeRecord);
    this.broadcastTrade(tradeRecord);
    try {
      const result = await this.solanaService.executeArbitrage(
        this.currentConfig.tokenA,
        this.currentConfig.tokenB,
        parseFloat(this.currentConfig.maxTradeAmount),
        this.currentConfig.mockMode
      );
      if (result.success) {
        const updatedTrade = {
          ...tradeRecord,
          amountOut: (parseFloat(tradeRecord.amountIn) + (result.profit || 0)).toString(),
          profit: (result.profit || 0).toString(),
          profitPercentage: ((result.profit || 0) / parseFloat(tradeRecord.amountIn) * 100).toString(),
          txSignature: result.txSignature,
          status: "completed"
        };
        await this.storageService.updateTrade(tradeId, updatedTrade);
        await this.storageService.updateOpportunity(opportunity.id, {
          wasExecuted: true,
          executedTradeId: tradeId
        });
        console.log(`\u2705 Trade ${tradeId} completed successfully`);
        console.log(`\u{1F4B0} Profit: ${result.profit} SOL`);
        this.broadcastTrade(updatedTrade);
      } else {
        const failedTrade = {
          ...tradeRecord,
          status: "failed",
          errorMessage: result.error
        };
        await this.storageService.updateTrade(tradeId, failedTrade);
        console.log(`\u274C Trade ${tradeId} failed: ${result.error}`);
        this.broadcastTrade(failedTrade);
      }
    } catch (error) {
      console.error(`Error executing trade ${tradeId}:`, error);
      const errorTrade = {
        ...tradeRecord,
        status: "failed",
        errorMessage: error.message
      };
      await this.storageService.updateTrade(tradeId, errorTrade);
      this.broadcastTrade(errorTrade);
    }
  }
  broadcastBotStatus(errorMessage) {
    const message = {
      type: "bot_status",
      data: {
        isRunning: this.isRunning,
        configId: this.currentConfig?.id || "",
        lastScanTime: this.lastScanTime,
        errorMessage
      },
      timestamp: Date.now()
    };
    this.wsService.broadcast(message);
  }
  broadcastOpportunity(opportunity) {
    const message = {
      type: "opportunity",
      data: {
        id: opportunity.id,
        tokenA: opportunity.tokenA,
        tokenB: opportunity.tokenB,
        priceA: parseFloat(opportunity.priceA),
        priceB: parseFloat(opportunity.priceB),
        profitOpportunity: parseFloat(opportunity.profitOpportunity),
        profitPercentage: parseFloat(opportunity.profitPercentage),
        amountRequired: parseFloat(opportunity.amountRequired),
        dexA: opportunity.dexA,
        dexB: opportunity.dexB,
        detectedAt: opportunity.detectedAt.getTime()
      },
      timestamp: Date.now()
    };
    this.wsService.broadcast(message);
  }
  broadcastTrade(trade) {
    const message = {
      type: "trade",
      data: {
        id: trade.id,
        tokenA: trade.tokenA,
        tokenB: trade.tokenB,
        amountIn: parseFloat(trade.amountIn),
        amountOut: parseFloat(trade.amountOut),
        profit: parseFloat(trade.profit),
        profitPercentage: parseFloat(trade.profitPercentage),
        txSignature: trade.txSignature,
        status: trade.status,
        errorMessage: trade.errorMessage,
        executedAt: trade.executedAt.getTime(),
        isMock: trade.isMock
      },
      timestamp: Date.now()
    };
    this.wsService.broadcast(message);
  }
  // Getters for status
  get running() {
    return this.isRunning;
  }
  get config() {
    return this.currentConfig;
  }
  get lastScan() {
    return this.lastScanTime;
  }
  get errors() {
    return this.errorCount;
  }
};

// server/index.ts
import { nanoid as nanoid2 } from "nanoid";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var server = createServer(app);
var PORT = process.env.PORT || 3e3;
app.use(express.json());
app.use(express.static(path.join(__dirname, "../dist/public")));
var solanaService = new SolanaService();
var storageService = new StorageService();
var wsService = new WebSocketService(server);
var arbitrageBot = new ArbitrageBot(solanaService, storageService, wsService);
await solanaService.initialize();
var demoUser = {
  id: "demo-user",
  username: "demo",
  passwordHash: "demo-hash"
};
var demoConfig = {
  id: "demo-config",
  userId: "demo-user",
  tokenA: "So11111111111111111111111111111111111111112",
  // SOL
  tokenB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  // USDC
  profitThreshold: "0.5",
  // 0.5% minimum profit
  maxTradeAmount: "0.1",
  // 0.1 SOL
  scanInterval: 15,
  // 15 seconds
  isActive: false,
  walletAddress: null,
  privateKey: null,
  mockMode: true
};
try {
  await storageService.createUser(demoUser);
  await storageService.createBotConfig(demoConfig);
  console.log("\u2705 Demo user and config created");
} catch (error) {
  console.log("Demo user and config already exist or error occurred:", error.message);
}
app.get("/api/bot/status", async (req, res) => {
  try {
    const status = {
      isRunning: arbitrageBot.running,
      config: arbitrageBot.config,
      lastScan: arbitrageBot.lastScan,
      errors: arbitrageBot.errors,
      solanaConnected: await solanaService.healthCheck(),
      dbConnected: storageService.connected,
      wsConnections: wsService.getStats().connectedClients
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/bot/start", async (req, res) => {
  try {
    const { configId } = req.body;
    if (!configId) {
      return res.status(400).json({ error: "Config ID is required" });
    }
    const config = await storageService.getBotConfigById(configId);
    if (!config) {
      return res.status(404).json({ error: "Bot configuration not found" });
    }
    const success = await arbitrageBot.start(config);
    if (success) {
      res.json({ message: "Bot started successfully" });
    } else {
      res.status(400).json({ error: "Failed to start bot" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/bot/stop", async (req, res) => {
  try {
    await arbitrageBot.stop();
    res.json({ message: "Bot stopped successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/configs", async (req, res) => {
  try {
    const configs = await storageService.getBotConfigsByUserId("demo-user");
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/configs", async (req, res) => {
  try {
    const config = {
      id: nanoid2(),
      userId: "demo-user",
      ...req.body
    };
    const created = await storageService.createBotConfig(config);
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.put("/api/configs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await storageService.updateBotConfig(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Configuration not found" });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/trades", async (req, res) => {
  try {
    const trades2 = await storageService.getTradesByUserId("demo-user");
    res.json(trades2);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/opportunities", async (req, res) => {
  try {
    const opportunities = await storageService.getOpportunitiesByUserId("demo-user");
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/wallet/balance", async (req, res) => {
  try {
    const { token } = req.query;
    const balance = await solanaService.getBalance(token);
    res.json({ balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/wallet/address", async (req, res) => {
  try {
    const address = solanaService.getWalletAddress();
    res.json({ address });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/tokens", (req, res) => {
  res.json(COMMON_TOKENS);
});
app.post("/api/test/arbitrage", async (req, res) => {
  try {
    const { tokenA, tokenB, amount } = req.body;
    const opportunity = await solanaService.simulateArbitrageOpportunity(
      tokenA,
      tokenB,
      parseFloat(amount)
    );
    res.json(opportunity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/health", async (req, res) => {
  try {
    const health = {
      server: "ok",
      solana: await solanaService.healthCheck(),
      database: await storageService.healthCheck(),
      websocket: wsService.getStats().connectedClients > 0 ? "connected" : "no_clients",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/public/index.html"));
});
app.use((err, req, res, next) => {
  console.error("Express error:", err);
  res.status(500).json({ error: "Internal server error" });
});
process.on("SIGTERM", () => {
  console.log("\u{1F6D1} Received SIGTERM, shutting down gracefully...");
  arbitrageBot.stop().then(() => {
    wsService.closeAllConnections();
    server.close(() => {
      console.log("\u2705 Server shut down successfully");
      process.exit(0);
    });
  });
});
process.on("SIGINT", () => {
  console.log("\u{1F6D1} Received SIGINT, shutting down gracefully...");
  arbitrageBot.stop().then(() => {
    wsService.closeAllConnections();
    server.close(() => {
      console.log("\u2705 Server shut down successfully");
      process.exit(0);
    });
  });
});
server.listen(PORT, () => {
  console.log(`\u{1F680} Solana Arbitrage Bot server running on port ${PORT}`);
  console.log(`\u{1F4CA} Dashboard: http://localhost:${PORT}`);
  console.log(`\u{1F4E1} WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`\u{1F527} Mock mode: ${demoConfig.mockMode ? "ENABLED" : "DISABLED"}`);
});
var index_default = app;
export {
  index_default as default
};
