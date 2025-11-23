// src/lib/queue.ts
import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { MockDexRouter } from './dex/MockDexRouter'; 
import Redis from 'ioredis';

// --- CLOUD READY REDIS CONNECTION ---
// If REDIS_URL exists (Railway), use it. Otherwise use localhost.
const redisConfig = process.env.REDIS_URL 
  ? process.env.REDIS_URL 
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null,
    };

const connection = new Redis(redisConfig as any, {
  maxRetriesPerRequest: null 
});

const redisPublisher = new Redis(redisConfig as any);
// ------------------------------------

export const orderQueue = new Queue('order-execution', { 
  connection,
  defaultJobOptions: {
    attempts: 3, 
    backoff: { type: 'exponential', delay: 1000 }
  }
});

const prisma = new PrismaClient();
const router = new MockDexRouter();

// 2. The Worker
export const orderWorker = new Worker(
  'order-execution',
  async (job: Job) => {
    const { orderId, inputAmount } = job.data;
    // Log the attempt number (1, 2, or 3)
    console.log(`[Worker] Processing Order: ${orderId} (Attempt ${job.attemptsMade + 1}/3)`);

    try {
      // Step A: Update Status (Only on first attempt to avoid spamming UI)
      if (job.attemptsMade === 0) {
        await updateStatus(orderId, 'routing', 'Fetching quotes from DEXs...');
      }
      
      // Step B: Get Best Quote
      const quote = await router.findBestRoute(inputAmount);
      
      // Step C: Execution
      if (job.attemptsMade === 0) {
        await updateStatus(orderId, 'routing', `Selected ${quote.dex} at $${quote.price.toFixed(2)}`);
        await updateStatus(orderId, 'submitted', 'Transaction sent to network...');
      }

      const result = await router.executeTrade(quote);

      // Step D: Success (Only runs if no error)
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'confirmed',
          txHash: result.txHash,
          price: result.finalPrice,
          logs: { push: `Swap Success! Hash: ${result.txHash}` }
        }
      });
      
      await redisPublisher.publish(`updates:${orderId}`, JSON.stringify({ 
        status: 'confirmed', 
        txHash: result.txHash,
        price: result.finalPrice,
        log: 'Swap Confirmed'
      }));

      console.log(`[Worker] Order ${orderId} Confirmed.`);
      return result;

    } catch (error: any) {
      console.error(`[Worker] Error order ${orderId}: ${error.message}`);

      // CHECK: Is this the LAST attempt?
      // job.attemptsMade starts at 0. So 0, 1, 2. (Total 3).
      // If attemptsMade is 2, it means we just failed the 3rd time.
      if (job.attemptsMade >= 2) {
        // FINAL FAILURE - Update DB
        console.log(`[Worker] Final failure for ${orderId}. Marking as FAILED.`);
        await updateStatus(orderId, 'failed', `Permanent Failure: ${error.message}`);
      } else {
        // TEMPORARY FAILURE - Notify user but don't mark failed yet
        await updateStatus(orderId, 'routing', `Network error (Attempt ${job.attemptsMade + 1}). Retrying...`);
        // We throw the error so BullMQ knows to try again later
        throw error;
      }
    }
  },
  {
    connection,
    concurrency: 10, 
    limiter: { max: 100, duration: 60000 }
  }
);

// Helper
async function updateStatus(orderId: string, status: string, logMessage: string) {
  // Update DB
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: status,
      logs: { push: logMessage }
    }
  });

  // Update WebSocket
  await redisPublisher.publish(`updates:${orderId}`, JSON.stringify({ 
    status, 
    log: logMessage,
    timestamp: new Date().toISOString()
  }));
}