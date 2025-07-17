import { SolanaService } from './solana-service.js';
import { StorageService } from './storage-service.js';
import { WebSocketService } from './websocket-service.js';
import { BotConfig, NewArbitrageOpportunity, NewTrade } from '../shared/schema.js';
import { OpportunityMessage, TradeMessage, BotStatusMessage } from '../shared/types.js';
import { nanoid } from 'nanoid';

export class ArbitrageBot {
  private solanaService: SolanaService;
  private storageService: StorageService;
  private wsService: WebSocketService;
  private isRunning = false;
  private scanInterval?: NodeJS.Timeout;
  private currentConfig?: BotConfig;
  private lastScanTime = 0;
  private errorCount = 0;
  private readonly MAX_ERRORS = 5;

  constructor(
    solanaService: SolanaService,
    storageService: StorageService,
    wsService: WebSocketService
  ) {
    this.solanaService = solanaService;
    this.storageService = storageService;
    this.wsService = wsService;
  }

  async start(config: BotConfig): Promise<boolean> {
    if (this.isRunning) {
      console.log('Bot is already running');
      return false;
    }

    try {
      this.currentConfig = config;
      this.errorCount = 0;

      // Initialize wallet if provided
      if (config.privateKey) {
        const walletLoaded = this.solanaService.setWallet(config.privateKey);
        if (!walletLoaded) {
          throw new Error('Failed to load wallet');
        }
      }

      // Start scanning for opportunities
      this.isRunning = true;
      this.startScanning();

      // Broadcast bot status
      this.broadcastBotStatus();

      console.log(`🚀 Arbitrage bot started for ${config.tokenA} <-> ${config.tokenB}`);
      console.log(`📊 Profit threshold: ${config.profitThreshold}%`);
      console.log(`💰 Max trade amount: ${config.maxTradeAmount}`);
      console.log(`⏱️ Scan interval: ${config.scanInterval}s`);
      console.log(`🔧 Mock mode: ${config.mockMode ? 'ON' : 'OFF'}`);

      return true;
    } catch (error) {
      console.error('Failed to start bot:', error);
      this.isRunning = false;
      this.broadcastBotStatus(error.message);
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Bot is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    this.broadcastBotStatus();
    console.log('🛑 Arbitrage bot stopped');
  }

  private startScanning(): void {
    if (!this.currentConfig) return;

    const scanIntervalMs = this.currentConfig.scanInterval * 1000;
    
    // Initial scan
    this.scanForOpportunities();

    // Set up recurring scans
    this.scanInterval = setInterval(() => {
      this.scanForOpportunities();
    }, scanIntervalMs);
  }

  private async scanForOpportunities(): Promise<void> {
    if (!this.isRunning || !this.currentConfig) return;

    try {
      this.lastScanTime = Date.now();
      
      const opportunity = await this.solanaService.simulateArbitrageOpportunity(
        this.currentConfig.tokenA,
        this.currentConfig.tokenB,
        parseFloat(this.currentConfig.maxTradeAmount)
      );

      if (!opportunity) {
        console.log('No arbitrage data available');
        return;
      }

      // Check if opportunity meets profit threshold
      if (opportunity.profitPercentage >= parseFloat(this.currentConfig.profitThreshold)) {
        console.log(`🎯 Arbitrage opportunity detected: ${opportunity.profitPercentage.toFixed(4)}% profit`);
        
        const opportunityRecord = await this.recordOpportunity(opportunity);
        
        // Broadcast opportunity to clients
        this.broadcastOpportunity(opportunityRecord);

        // Execute trade if profitable
        await this.executeTrade(opportunityRecord);
      } else {
        console.log(`📉 Opportunity below threshold: ${opportunity.profitPercentage.toFixed(4)}% < ${this.currentConfig.profitThreshold}%`);
      }

      // Reset error count on successful scan
      this.errorCount = 0;
    } catch (error) {
      console.error('Error during opportunity scan:', error);
      this.errorCount++;

      if (this.errorCount >= this.MAX_ERRORS) {
        console.error('Too many errors, stopping bot');
        await this.stop();
        this.broadcastBotStatus('Too many errors occurred');
      }
    }
  }

  private async recordOpportunity(opportunity: {
    profitOpportunity: number;
    profitPercentage: number;
    priceA: number;
    priceB: number;
  }): Promise<NewArbitrageOpportunity> {
    const record: NewArbitrageOpportunity = {
      id: nanoid(),
      userId: this.currentConfig!.userId,
      tokenA: this.currentConfig!.tokenA,
      tokenB: this.currentConfig!.tokenB,
      priceA: opportunity.priceA.toString(),
      priceB: opportunity.priceB.toString(),
      profitOpportunity: opportunity.profitOpportunity.toString(),
      profitPercentage: opportunity.profitPercentage.toString(),
      amountRequired: this.currentConfig!.maxTradeAmount,
      dexA: 'Jupiter',
      dexB: 'Jupiter',
      detectedAt: new Date(),
      wasExecuted: false
    };

    await this.storageService.createOpportunity(record);
    return record;
  }

  private async executeTrade(opportunity: NewArbitrageOpportunity): Promise<void> {
    if (!this.currentConfig) return;

    const tradeId = nanoid();
    console.log(`🔄 Executing trade ${tradeId}...`);

    // Create pending trade record
    const tradeRecord: NewTrade = {
      id: tradeId,
      userId: this.currentConfig.userId,
      configId: this.currentConfig.id,
      tokenA: this.currentConfig.tokenA,
      tokenB: this.currentConfig.tokenB,
      amountIn: this.currentConfig.maxTradeAmount,
      amountOut: '0',
      profit: '0',
      profitPercentage: '0',
      status: 'pending',
      executedAt: new Date(),
      isMock: this.currentConfig.mockMode
    };

    await this.storageService.createTrade(tradeRecord);

    // Broadcast pending trade
    this.broadcastTrade(tradeRecord);

    try {
      // Execute the arbitrage trade
      const result = await this.solanaService.executeArbitrage(
        this.currentConfig.tokenA,
        this.currentConfig.tokenB,
        parseFloat(this.currentConfig.maxTradeAmount),
        this.currentConfig.mockMode
      );

      if (result.success) {
        // Update trade record with success
        const updatedTrade: NewTrade = {
          ...tradeRecord,
          amountOut: (parseFloat(tradeRecord.amountIn) + (result.profit || 0)).toString(),
          profit: (result.profit || 0).toString(),
          profitPercentage: ((result.profit || 0) / parseFloat(tradeRecord.amountIn) * 100).toString(),
          txSignature: result.txSignature,
          status: 'completed'
        };

        await this.storageService.updateTrade(tradeId, updatedTrade);
        
        // Mark opportunity as executed
        await this.storageService.updateOpportunity(opportunity.id, { 
          wasExecuted: true, 
          executedTradeId: tradeId 
        });

        console.log(`✅ Trade ${tradeId} completed successfully`);
        console.log(`💰 Profit: ${result.profit} SOL`);
        
        // Broadcast successful trade
        this.broadcastTrade(updatedTrade);
      } else {
        // Update trade record with failure
        const failedTrade: NewTrade = {
          ...tradeRecord,
          status: 'failed',
          errorMessage: result.error
        };

        await this.storageService.updateTrade(tradeId, failedTrade);
        
        console.log(`❌ Trade ${tradeId} failed: ${result.error}`);
        
        // Broadcast failed trade
        this.broadcastTrade(failedTrade);
      }
    } catch (error) {
      console.error(`Error executing trade ${tradeId}:`, error);
      
      // Update trade record with error
      const errorTrade: NewTrade = {
        ...tradeRecord,
        status: 'failed',
        errorMessage: error.message
      };

      await this.storageService.updateTrade(tradeId, errorTrade);
      this.broadcastTrade(errorTrade);
    }
  }

  private broadcastBotStatus(errorMessage?: string): void {
    const message: BotStatusMessage = {
      type: 'bot_status',
      data: {
        isRunning: this.isRunning,
        configId: this.currentConfig?.id || '',
        lastScanTime: this.lastScanTime,
        errorMessage
      },
      timestamp: Date.now()
    };

    this.wsService.broadcast(message);
  }

  private broadcastOpportunity(opportunity: NewArbitrageOpportunity): void {
    const message: OpportunityMessage = {
      type: 'opportunity',
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

  private broadcastTrade(trade: NewTrade): void {
    const message: TradeMessage = {
      type: 'trade',
      data: {
        id: trade.id,
        tokenA: trade.tokenA,
        tokenB: trade.tokenB,
        amountIn: parseFloat(trade.amountIn),
        amountOut: parseFloat(trade.amountOut),
        profit: parseFloat(trade.profit),
        profitPercentage: parseFloat(trade.profitPercentage),
        txSignature: trade.txSignature,
        status: trade.status as 'pending' | 'completed' | 'failed',
        errorMessage: trade.errorMessage,
        executedAt: trade.executedAt.getTime(),
        isMock: trade.isMock
      },
      timestamp: Date.now()
    };

    this.wsService.broadcast(message);
  }

  // Getters for status
  get running(): boolean {
    return this.isRunning;
  }

  get config(): BotConfig | undefined {
    return this.currentConfig;
  }

  get lastScan(): number {
    return this.lastScanTime;
  }

  get errors(): number {
    return this.errorCount;
  }
}