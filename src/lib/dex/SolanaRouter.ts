import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

export interface Quote {
  dex: 'RAYDIUM' | 'METEORA';
  price: number;
  fee: number;
  estimatedOutput: number;
}

export class SolanaRouter {
  private connection: Connection;
  private wallet: Keypair;
  private BASE_PRICE = 150.0; 

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const privateKey = process.env.WALLET_PRIVATE_KEY;

    if (!privateKey) {
      throw new Error("WALLET_PRIVATE_KEY is missing in .env");
    }

    this.connection = new Connection(rpcUrl, "confirmed");
    this.wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  }

  async findBestRoute(inputAmount: number): Promise<Quote> {
    await new Promise(r => setTimeout(r, 500)); 

    const raydiumPrice = this.BASE_PRICE * (0.99 + Math.random() * 0.02);
    const meteoraPrice = this.BASE_PRICE * (0.99 + Math.random() * 0.02);

    console.log(`[Router] Raydium: $${raydiumPrice.toFixed(2)} | Meteora: $${meteoraPrice.toFixed(2)}`);

    if (raydiumPrice < meteoraPrice) {
      return { dex: 'RAYDIUM', price: raydiumPrice, fee: 0.003, estimatedOutput: inputAmount * raydiumPrice };
    } else {
      return { dex: 'METEORA', price: meteoraPrice, fee: 0.002, estimatedOutput: inputAmount * meteoraPrice };
    }
  }

  // --- UPDATED EXECUTION METHOD WITH 666 TRIGGER ---
  async executeTrade(quote: Quote, inputAmount: number): Promise<{ txHash: string; finalPrice: number }> {
    console.log(`[Router] 🟢 Initiating REAL Blockchain Transaction on Devnet...`);
    
    // THE GLITCH TRIGGER
    if (inputAmount === 666) {
        console.warn("[Router] ⚠️ Simulating Network Failure for Retry Test...");
        // Wait 1s to make it feel real
        await new Promise(r => setTimeout(r, 1000));
        throw new Error("Simulated Solana Network Timeout");
    }

    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: Keypair.generate().publicKey, 
          lamports: LAMPORTS_PER_SOL * 0.001, 
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );

      console.log(`[Router] ✅ Confirmed! Tx: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

      return {
        txHash: signature,
        finalPrice: quote.price
      };

    } catch (error: any) {
      console.error("[Router] 🔴 Blockchain Error:", error);
      throw new Error(`Solana Network Fail: ${error.message}`);
    }
  }
}