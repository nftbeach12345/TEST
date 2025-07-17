export interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp: number;
}

export interface BotStatusMessage extends WebSocketMessage {
  type: 'bot_status';
  data: {
    isRunning: boolean;
    configId: string;
    lastScanTime?: number;
    errorMessage?: string;
  };
}

export interface OpportunityMessage extends WebSocketMessage {
  type: 'opportunity';
  data: {
    id: string;
    tokenA: string;
    tokenB: string;
    priceA: number;
    priceB: number;
    profitOpportunity: number;
    profitPercentage: number;
    amountRequired: number;
    dexA: string;
    dexB: string;
    detectedAt: number;
  };
}

export interface TradeMessage extends WebSocketMessage {
  type: 'trade';
  data: {
    id: string;
    tokenA: string;
    tokenB: string;
    amountIn: number;
    amountOut: number;
    profit: number;
    profitPercentage: number;
    txSignature?: string;
    status: 'pending' | 'completed' | 'failed';
    errorMessage?: string;
    executedAt: number;
    isMock: boolean;
  };
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface DexInfo {
  name: string;
  url: string;
  fee: number; // in basis points
}

export interface ArbitrageConfig {
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  profitThreshold: number; // minimum profit percentage
  maxTradeAmount: number; // maximum amount to trade
  scanInterval: number; // seconds between scans
  mockMode: boolean;
}

export interface SystemStatus {
  isConnected: boolean;
  botRunning: boolean;
  lastHeartbeat: number;
  rpcStatus: 'connected' | 'disconnected' | 'error';
  dbStatus: 'connected' | 'disconnected' | 'error';
}

export const COMMON_TOKENS: TokenInfo[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
  },
  {
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
  },
  {
    address: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 8,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png'
  }
];

export const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%