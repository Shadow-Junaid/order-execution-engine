// src/app.ts
import fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { orderRoutes } from './routes/orders';
import Redis from 'ioredis';

const app = fastify({ logger: true });

// --- CLOUD READY CONNECTION ---
const redisConfig = process.env.REDIS_URL || {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379
};
const redisSubscriber = new Redis(redisConfig as any);

// Global State: Map<OrderId, Set<WebSocket>>
const clients = new Map<string, Set<any>>();

// --- 1. Redis Listener (The Bridge) ---
redisSubscriber.on('message', (channel, message) => {
  const orderId = channel.split(':')[1]; 
  if (!orderId) return;

  const activeConnections = clients.get(orderId);
  if (activeConnections) {
    for (const socket of activeConnections) {
      // DEFENSIVE CHECK: Only try to send if socket exists and is open
      if (socket && socket.readyState === 1) {
        socket.send(message);
      }
    }
  }
});

// --- 2. Server Setup ---
app.register(cors, { origin: true });
app.register(websocket);
app.register(orderRoutes, { prefix: '/orders' });

// --- 3. WebSocket Endpoint ---
app.register(async (fastify) => {
  fastify.get('/ws', { websocket: true }, (connection: any, req: any) => {
    const query = req.query as { id?: string };
    const orderId = query.id;

    // *** THE FIX: Handle both possibilities ***
    // Some versions give 'connection.socket', some give just 'connection'
    const socket = connection.socket || connection;

    if (!orderId) {
      socket.close(1008, 'Order ID required');
      return;
    }
    
    // *** CRITICAL SAFETY CHECK ***
    // If for some reason we still don't have a socket, stop here.
    if (!socket || !socket.on) {
        console.error("[WS] Error: Could not resolve WebSocket object");
        return;
    }

    console.log(`[WS] Client connected for order: ${orderId}`);

    // Add to Map
    if (!clients.has(orderId)) {
      clients.set(orderId, new Set());
      redisSubscriber.subscribe(`updates:${orderId}`);
    }
    clients.get(orderId)?.add(socket);

    // Handle Disconnect
    socket.on('close', () => {
      console.log(`[WS] Client disconnected: ${orderId}`);
      const orderClients = clients.get(orderId);
      if (orderClients) {
        orderClients.delete(socket); // Remove this specific client
        if (orderClients.size === 0) {
          clients.delete(orderId);
          redisSubscriber.unsubscribe(`updates:${orderId}`);
        }
      }
    });
  });
}, { prefix: '/orders' });

// --- 4. Start Server ---
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