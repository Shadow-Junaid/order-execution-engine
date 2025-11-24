import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { SolanaRouter } from './dex/SolanaRouter'; 
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis Config
const redisConfig = process.env.REDIS_URL 
  ? process.env.REDIS_URL 
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null,
    };

const connection = new Redis(redisConfig as any, { maxRetriesPerRequest: null });
const redisPublisher = new Redis(redisConfig as any);

export const orderQueue = new Queue('order-execution', { 
  connection,
  defaultJobOptions: {
    attempts: 3, 
    backoff: { type: 'exponential', delay: 1000 }
  }
});

const prisma = new PrismaClient();
const router = new SolanaRouter();

export const orderWorker = new Worker(
  'order-execution',
  async (job: Job) => {
    const { orderId, inputAmount } = job.data;
    const attempt = job.attemptsMade + 1;
    console.log(`[Worker] Processing Order: ${orderId} (Attempt ${attempt})`);

    try {
      if (job.attemptsMade === 0) {
        await updateStatus(orderId, 'routing', 'Fetching quotes from DEXs...');
      }
      
      // 1. Get Quote
      const quote = await router.findBestRoute(inputAmount);
      
      if (job.attemptsMade === 0) {
        await updateStatus(orderId, 'routing', `Selected ${quote.dex} at $${quote.price.toFixed(2)}`);
        await updateStatus(orderId, 'submitted', 'Building & Signing Solana Transaction...');
      }

      // 2. Execute Real Trade
      const result = await router.executeTrade(quote, inputAmount);

      // 3. Success
      const explorerLink = `https://explorer.solana.com/tx/${result.txHash}?cluster=devnet`;
      
      // Update DB and Notify
      await updateStatus(orderId, 'confirmed', `Swap Success! View on Explorer: ${explorerLink}`);

      console.log(`[Worker] Order ${orderId} Confirmed.`);
      return result;

    } catch (error: any) {
      console.error(`[Worker] Error order ${orderId}:`, error.message);

      // RETRY LOGIC
      const maxAttempts = job.opts.attempts || 3;
      
      // If we have attempts left (attemptsMade starts at 0. So 0, 1 are retries. 2 is final)
      if (job.attemptsMade < maxAttempts - 1) {
        await updateStatus(orderId, 'routing', `Network error. Retrying...`);
        throw error; // Throwing triggers the retry
      } else {
        // FINAL FAILURE
        console.log(`[Worker] ❌ Final failure for ${orderId}. Sending failed status.`);
        
        try {
          // Force status to failed
          await updateStatus(orderId, 'failed', `Permanent Failure: ${error.message}`);
        } catch (e) {
          console.error("[Worker] Failed to update status DB:", e);
        }
        // Do not throw here, so the job finishes as "completed" (but failed state)
        return; 
      }
    }
  },
  {
    connection,
    concurrency: 10, 
    limiter: { max: 100, duration: 60000 }
  }
);

// Consolidated Helper
async function updateStatus(orderId: string, status: string, logMessage: string) {
  try {
    // 1. Update DB
    await prisma.order.update({
      where: { id: orderId },
      data: { status: status, logs: { push: logMessage } }
    });

    // 2. Update WebSocket
    await redisPublisher.publish(`updates:${orderId}`, JSON.stringify({ 
      status, 
      log: logMessage,
      // If confirmed, parse the link for the UI
      link: logMessage.includes('http') ? logMessage.match(/https?:\/\/[^\s]+/)?.[0] : undefined
    }));
  } catch (err) {
    console.error(`[System] Failed to push update for ${orderId}`, err);
  }
}