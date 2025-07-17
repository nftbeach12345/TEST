import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { SolanaService } from './solana-service.js';
import { StorageService } from './storage-service.js';
import { WebSocketService } from './websocket-service.js';
import { ArbitrageBot } from './arbitrage-bot.js';
import { nanoid } from 'nanoid';
import { COMMON_TOKENS } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to get error message
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist/public')));

// Initialize services
const solanaService = new SolanaService();
const storageService = new StorageService();
const wsService = new WebSocketService(server);
const arbitrageBot = new ArbitrageBot(solanaService, storageService, wsService);

// Initialize Solana connection
await solanaService.initialize();

// Create a demo user and config for testing
const demoUser = {
  id: 'demo-user',
  username: 'demo',
  passwordHash: 'demo-hash'
};

const demoConfig = {
  id: 'demo-config',
  userId: 'demo-user',
  tokenA: 'So11111111111111111111111111111111111111112', // SOL
  tokenB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  profitThreshold: '0.5', // 0.5% minimum profit
  maxTradeAmount: '0.1', // 0.1 SOL
  scanInterval: 15, // 15 seconds
  isActive: false,
  walletAddress: null,
  privateKey: null,
  mockMode: true
};

// Create demo user and config
try {
  await storageService.createUser(demoUser);
  await storageService.createBotConfig(demoConfig);
  console.log('✅ Demo user and config created');
} catch (error) {
  console.log('Demo user and config already exist or error occurred:', error instanceof Error ? error.message : 'Unknown error');
}

// API Routes

// Get bot status
app.get('/api/bot/status', async (req, res) => {
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
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Start bot
app.post('/api/bot/start', async (req, res) => {
  try {
    const { configId } = req.body;
    
    if (!configId) {
      return res.status(400).json({ error: 'Config ID is required' });
    }

    const config = await storageService.getBotConfigById(configId);
    if (!config) {
      return res.status(404).json({ error: 'Bot configuration not found' });
    }

    const success = await arbitrageBot.start(config);
    if (success) {
      res.json({ message: 'Bot started successfully' });
    } else {
      res.status(400).json({ error: 'Failed to start bot' });
    }
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Stop bot
app.post('/api/bot/stop', async (req, res) => {
  try {
    await arbitrageBot.stop();
    res.json({ message: 'Bot stopped successfully' });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get bot configurations
app.get('/api/configs', async (req, res) => {
  try {
    const configs = await storageService.getBotConfigsByUserId('demo-user');
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Create bot configuration
app.post('/api/configs', async (req, res) => {
  try {
    const config = {
      id: nanoid(),
      userId: 'demo-user',
      ...req.body
    };
    
    const created = await storageService.createBotConfig(config);
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Update bot configuration
app.put('/api/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await storageService.updateBotConfig(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get trade history
app.get('/api/trades', async (req, res) => {
  try {
    const trades = await storageService.getTradesByUserId('demo-user');
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get arbitrage opportunities
app.get('/api/opportunities', async (req, res) => {
  try {
    const opportunities = await storageService.getOpportunitiesByUserId('demo-user');
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get wallet balance
app.get('/api/wallet/balance', async (req, res) => {
  try {
    const { token } = req.query;
    const balance = await solanaService.getBalance(token as string);
    res.json({ balance });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get wallet address
app.get('/api/wallet/address', async (req, res) => {
  try {
    const address = solanaService.getWalletAddress();
    res.json({ address });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get common tokens
app.get('/api/tokens', (req, res) => {
  res.json(COMMON_TOKENS);
});

// Test arbitrage opportunity
app.post('/api/test/arbitrage', async (req, res) => {
  try {
    const { tokenA, tokenB, amount } = req.body;
    
    const opportunity = await solanaService.simulateArbitrageOpportunity(
      tokenA,
      tokenB,
      parseFloat(amount)
    );
    
    res.json(opportunity);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      server: 'ok',
      solana: await solanaService.healthCheck(),
      database: await storageService.healthCheck(),
      websocket: wsService.getStats().connectedClients > 0 ? 'connected' : 'no_clients',
      timestamp: new Date().toISOString()
    };
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/public/index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  
  arbitrageBot.stop().then(() => {
    wsService.closeAllConnections();
    server.close(() => {
      console.log('✅ Server shut down successfully');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  
  arbitrageBot.stop().then(() => {
    wsService.closeAllConnections();
    server.close(() => {
      console.log('✅ Server shut down successfully');
      process.exit(0);
    });
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Solana Arbitrage Bot server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`📊 External: http://0.0.0.0:${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🔧 Mock mode: ${demoConfig.mockMode ? 'ENABLED' : 'DISABLED'}`);
});

export default app;