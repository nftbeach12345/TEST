import { pgTable, text, integer, timestamp, boolean, decimal, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const botConfig = pgTable("bot_config", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  tokenA: text("token_a").notNull(),
  tokenB: text("token_b").notNull(),
  profitThreshold: decimal("profit_threshold", { precision: 10, scale: 4 }).notNull(),
  maxTradeAmount: decimal("max_trade_amount", { precision: 18, scale: 9 }).notNull(),
  scanInterval: integer("scan_interval").notNull().default(15), // seconds
  isActive: boolean("is_active").default(false).notNull(),
  walletAddress: text("wallet_address"),
  privateKey: text("private_key"), // This should be encrypted in production
  mockMode: boolean("mock_mode").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
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
  status: text("status").notNull(), // 'pending', 'completed', 'failed'
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  isMock: boolean("is_mock").default(true).notNull(),
});

export const arbitrageOpportunities = pgTable("arbitrage_opportunities", {
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
  executedTradeId: text("executed_trade_id").references(() => trades.id),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BotConfig = typeof botConfig.$inferSelect;
export type NewBotConfig = typeof botConfig.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type ArbitrageOpportunity = typeof arbitrageOpportunities.$inferSelect;
export type NewArbitrageOpportunity = typeof arbitrageOpportunities.$inferInsert;