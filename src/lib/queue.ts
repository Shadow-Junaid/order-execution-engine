import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { MockDexRouter } from './dex/MockDexRouter'; // Ensure this path matches your folder
import Redis from 'ioredis';

// 1. Setup Redis Connection for BullMQ
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

// 2. Setup Redis Connection for Publishing Updates (WebSocket)
const redisPublisher = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
});

export const orderQueue = new Queue('order-execution', { connection });

const prisma = new PrismaClient();
const router = new MockDexRouter();

// 3. Define the Worker (The "Brain" that processes orders)
export const orderWorker = new Worker(
  'order-execution',
  async (job: Job) => {
    const { orderId, inputAmount } = job.data;
    console.log(`[Worker] Processing Order: ${orderId}`);

    try {
      // Step A: Update Status -> Routing
      await updateStatus(orderId, 'routing', 'Fetching quotes from DEXs...');
      
      // Step B: Get Best Quote (Simulated)
      const quote = await router.findBestRoute(inputAmount);
      await updateStatus(orderId, 'routing', `Selected ${quote.dex} at $${quote.price.toFixed(2)}`);

      // Step C: Update Status -> Building Transaction
      await updateStatus(orderId, 'building', 'Constructing transaction...');
      await new Promise(r => setTimeout(r, 500)); // Fake building time

      // Step D: Update Status -> Submitted
      await updateStatus(orderId, 'submitted', 'Transaction sent to network...');

      // Step E: Execute Trade (Simulated)
      const result = await router.executeTrade(quote);

      // Step F: Final Success Update
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'confirmed',
          txHash: result.txHash,
          price: result.finalPrice,
          logs: {
            push: `Swap Success! Hash: ${result.txHash}`
          }
        }
      });
      
      // Notify Frontend of success
      await redisPublisher.publish(`updates:${orderId}`, JSON.stringify({ 
        status: 'confirmed', 
        txHash: result.txHash,
        price: result.finalPrice,
        log: 'Swap Confirmed'
      }));

      console.log(`[Worker] Order ${orderId} Confirmed.`);
      return result;

    } catch (error: any) {
      console.error(`[Worker] Failed order ${orderId}:`, error);
      
      // Database Update
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'failed',
          logs: { push: `Error: ${error.message}` }
        }
      });

      // Notify Frontend of failure
      await redisPublisher.publish(`updates:${orderId}`, JSON.stringify({ 
        status: 'failed', 
        log: `Error: ${error.message}` 
      }));

      throw error; 
    }
  },
  {
    connection,
    concurrency: 10, // Requirement: 10 concurrent orders
    limiter: {
      max: 100,      // Requirement: 100 orders...
      duration: 60000 // ...per 1 minute
    }
  }
);

/**
 * Helper function to:
 * 1. Update Database
 * 2. Publish event to Redis (so WebSocket can pick it up)
 */
async function updateStatus(orderId: string, status: string, logMessage: string) {
  // 1. DB Update
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: status,
      logs: { push: logMessage }
    }
  });

  // 2. Redis Publish
  await redisPublisher.publish(`updates:${orderId}`, JSON.stringify({ 
    status, 
    log: logMessage,
    timestamp: new Date().toISOString()
  }));
}