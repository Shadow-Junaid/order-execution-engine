// src/routes/orders.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { orderQueue } from '../lib/queue';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Input Validation Schema
const OrderSchema = z.object({
  type: z.enum(['MARKET', 'LIMIT', 'SNIPER']),
  side: z.enum(['BUY', 'SELL']),
  inputToken: z.string(),
  outputToken: z.string(),
  amount: z.number().positive()
});

export async function orderRoutes(fastify: FastifyInstance) {
  
  // HTTP POST: Submit an Order
  fastify.post('/execute', async (request, reply) => {
    try {
      // 1. Validate input
      const body = OrderSchema.parse(request.body);

      // 2. Create "Pending" order in DB
      const order = await prisma.order.create({
        data: {
          type: body.type,
          side: body.side,
          inputToken: body.inputToken,
          outputToken: body.outputToken,
          amount: body.amount,
          status: 'pending',
          logs: ['Order received']
        }
      });

      // 3. Add to Queue (Worker will process this)
      await orderQueue.add('execute-trade', {
        orderId: order.id,
        inputAmount: body.amount,
        inputToken: body.inputToken
      });

      // 4. Return the Order ID immediately
      return reply.send({ 
        success: true, 
        orderId: order.id, 
        message: 'Order queued' 
      });

    } catch (error: any) {
      request.log.error(error);
      return reply.status(400).send({ error: error.message });
    }
  });
}