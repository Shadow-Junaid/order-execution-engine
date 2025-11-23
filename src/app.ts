// src/app.ts
import fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { orderRoutes } from './routes/orders';
import Redis from 'ioredis';

const app = fastify({ logger: true });

// --- CLOUD READY REDIS CONNECTION ---
const redisConfig = process.env.REDIS_URL || {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379
};
const redisSubscriber = new Redis(redisConfig as any); 
// -----------------------------

// Global State
const clients = new Map<string, Set<any>>();

// Redis Listener
redisSubscriber.on('message', (channel, message) => {
  const orderId = channel.split(':')[1]; 
  if (!orderId) return;

  const activeConnections = clients.get(orderId);
  if (activeConnections) {
    for (const socket of activeConnections) {
      if (socket && socket.readyState === 1) {
        socket.send(message);
      }
    }
  }
});

app.register(cors, { origin: true });
app.register(websocket);
app.register(orderRoutes, { prefix: '/orders' });

// WebSocket Endpoint
app.register(async (fastify) => {
  fastify.get('/ws', { websocket: true }, (connection: any, req: any) => {
    const query = req.query as { id?: string };
    const orderId = query.id;
    const socket = connection.socket || connection;

    if (!orderId) {
      socket.close(1008, 'Order ID required');
      return;
    }

    if (!socket || !socket.on) {
        return;
    }

    console.log(`[WS] Client connected for order: ${orderId}`);

    if (!clients.has(orderId)) {
      clients.set(orderId, new Set());
      redisSubscriber.subscribe(`updates:${orderId}`);
    }
    clients.get(orderId)?.add(socket);

    socket.on('close', () => {
      console.log(`[WS] Client disconnected: ${orderId}`);
      const orderClients = clients.get(orderId);
      if (orderClients) {
        orderClients.delete(socket);
        if (orderClients.size === 0) {
          clients.delete(orderId);
          redisSubscriber.unsubscribe(`updates:${orderId}`);
        }
      }
    });
  });
}, { prefix: '/orders' });

// --- NEW: ROOT HEALTH CHECK ROUTE ---
app.get('/', async () => {
  return { 
    status: 'ok', 
    service: 'Solana Order Execution Engine', 
    uptime: process.uptime() 
  };
});
// ------------------------------------

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running at http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();