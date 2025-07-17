import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { JupiterQuoteResponse, JupiterSwapResponse, JUPITER_API_BASE, DEFAULT_SLIPPAGE_BPS } from '../shared/types.js';
import axios from 'axios';
import bs58 from 'bs58';

export class SolanaService {
  private connection: Connection;
  private wallet?: Keypair;

  constructor(rpcUrl: string = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async initialize() {
    try {
      // Test connection
      await this.connection.getVersion();
      console.log('✅ Solana RPC connection established');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Solana RPC:', error);
      return false;
    }
  }

  setWallet(privateKeyString: string) {
    try {
      // Support both base58 and array formats
      let privateKeyBytes: Uint8Array;
      
      if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
        // Array format: [1,2,3,...]
        const keyArray = JSON.parse(privateKeyString);
        privateKeyBytes = new Uint8Array(keyArray);
      } else {
        // Base58 format
        privateKeyBytes = bs58.decode(privateKeyString);
      }

      this.wallet = Keypair.fromSecretKey(privateKeyBytes);
      console.log('✅ Wallet loaded:', this.wallet.publicKey.toBase58());
      return true;
    } catch (error) {
      console.error('❌ Failed to load wallet:', error);
      return false;
    }
  }

  getWalletAddress(): string | null {
    return this.wallet?.publicKey.toBase58() || null;
  }

  async getBalance(tokenMint?: string): Promise<number> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      if (!tokenMint || tokenMint === 'So11111111111111111111111111111111111111112') {
        // SOL balance
        const balance = await this.connection.getBalance(this.wallet.publicKey);
        return balance / 1e9; // Convert lamports to SOL
      } else {
        // SPL token balance - simplified for now
        // In production, you'd use @solana/spl-token to get token account balance
        return 0;
      }
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = DEFAULT_SLIPPAGE_BPS
  ): Promise<JupiterQuoteResponse | null> {
    try {
      const response = await axios.get(`${JUPITER_API_BASE}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount: Math.floor(amount * 1e9), // Convert to lamports/smallest unit
          slippageBps,
          onlyDirectRoutes: false,
          asLegacyTransaction: false
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Error getting Jupiter quote:', error);
      return null;
    }
  }

  async getSwapTransaction(quoteResponse: JupiterQuoteResponse): Promise<JupiterSwapResponse | null> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      const response = await axios.post(`${JUPITER_API_BASE}/swap`, {
        quoteResponse,
        userPublicKey: this.wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      }, {
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Error getting swap transaction:', error);
      return null;
    }
  }

  async executeSwap(swapTransaction: string): Promise<string | null> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      // Deserialize the transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);

      // Sign the transaction
      transaction.sign([this.wallet]);

      // Send the transaction
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false
      });

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('Transaction failed:', confirmation.value.err);
        return null;
      }

      console.log('✅ Transaction confirmed:', signature);
      return signature;
    } catch (error) {
      console.error('Error executing swap:', error);
      return null;
    }
  }

  async simulateArbitrageOpportunity(
    tokenA: string,
    tokenB: string,
    amount: number
  ): Promise<{
    profitOpportunity: number;
    profitPercentage: number;
    priceA: number;
    priceB: number;
  } | null> {
    try {
      // Get quote for A -> B
      const quoteAtoB = await this.getQuote(tokenA, tokenB, amount);
      if (!quoteAtoB) return null;

      // Get quote for B -> A (reverse)
      const quoteBtoA = await this.getQuote(tokenB, tokenA, parseInt(quoteAtoB.outAmount) / 1e9);
      if (!quoteBtoA) return null;

      const inputAmount = amount;
      const outputAmount = parseInt(quoteBtoA.outAmount) / 1e9;
      const profit = outputAmount - inputAmount;
      const profitPercentage = (profit / inputAmount) * 100;

      const priceA = parseInt(quoteAtoB.outAmount) / (parseInt(quoteAtoB.inAmount) / 1e9);
      const priceB = parseInt(quoteBtoA.outAmount) / (parseInt(quoteBtoA.inAmount) / 1e9);

      return {
        profitOpportunity: profit,
        profitPercentage,
        priceA,
        priceB
      };
    } catch (error) {
      console.error('Error simulating arbitrage:', error);
      return null;
    }
  }

  async executeArbitrage(
    tokenA: string,
    tokenB: string,
    amount: number,
    mockMode: boolean = true
  ): Promise<{
    success: boolean;
    txSignature?: string;
    profit?: number;
    error?: string;
  }> {
    try {
      if (mockMode) {
        // Simulate trade execution
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const simulation = await this.simulateArbitrageOpportunity(tokenA, tokenB, amount);
        if (!simulation) {
          return { success: false, error: 'Failed to simulate trade' };
        }

        return {
          success: true,
          txSignature: 'mock_tx_' + Date.now(),
          profit: simulation.profitOpportunity
        };
      }

      // Real trade execution
      if (!this.wallet) {
        return { success: false, error: 'Wallet not initialized' };
      }

      // Step 1: Get quote for A -> B
      const quoteAtoB = await this.getQuote(tokenA, tokenB, amount);
      if (!quoteAtoB) {
        return { success: false, error: 'Failed to get quote A->B' };
      }

      // Step 2: Execute A -> B swap
      const swapTxAtoB = await this.getSwapTransaction(quoteAtoB);
      if (!swapTxAtoB) {
        return { success: false, error: 'Failed to get swap transaction A->B' };
      }

      const txSignature1 = await this.executeSwap(swapTxAtoB.swapTransaction);
      if (!txSignature1) {
        return { success: false, error: 'Failed to execute swap A->B' };
      }

      // Step 3: Get quote for B -> A
      const quoteBtoA = await this.getQuote(tokenB, tokenA, parseInt(quoteAtoB.outAmount) / 1e9);
      if (!quoteBtoA) {
        return { success: false, error: 'Failed to get quote B->A' };
      }

      // Step 4: Execute B -> A swap
      const swapTxBtoA = await this.getSwapTransaction(quoteBtoA);
      if (!swapTxBtoA) {
        return { success: false, error: 'Failed to get swap transaction B->A' };
      }

      const txSignature2 = await this.executeSwap(swapTxBtoA.swapTransaction);
      if (!txSignature2) {
        return { success: false, error: 'Failed to execute swap B->A' };
      }

      const finalAmount = parseInt(quoteBtoA.outAmount) / 1e9;
      const profit = finalAmount - amount;

      return {
        success: true,
        txSignature: txSignature2, // Return the final transaction
        profit
      };
    } catch (error) {
      console.error('Error executing arbitrage:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Rate limiting helper
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

  private async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.connection.getVersion();
      return true;
    } catch (error) {
      console.error('Solana health check failed:', error);
      return false;
    }
  }
}