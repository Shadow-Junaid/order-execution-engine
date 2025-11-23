import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { MockDexRouter } from '../src/lib/dex/MockDexRouter';

// NOTE: Ensure your server is running (npm run dev) before running these tests!
const API_URL = 'http://127.0.0.1:3000';

describe('1. DEX Router Logic (Unit Tests)', () => {
  const router = new MockDexRouter();

  // Test 1: Raydium Quote
  it('should return a valid quote from Raydium', async () => {
    const quote = await router.getRaydiumQuote(100);
    expect(quote.dex).toBe('RAYDIUM');
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.fee).toBe(0.003);
  });

  // Test 2: Meteora Quote
  it('should return a valid quote from Meteora', async () => {
    const quote = await router.getMeteoraQuote(100);
    expect(quote.dex).toBe('METEORA');
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.fee).toBe(0.002);
  });

  // Test 3: Best Price Selection (Routing Logic)
  it('should always select the DEX with better output', async () => {
    // We spy on the methods to force specific prices
    vi.spyOn(router, 'getRaydiumQuote').mockResolvedValue({
      dex: 'RAYDIUM', price: 100, fee: 0, estimatedOutput: 100
    });
    vi.spyOn(router, 'getMeteoraQuote').mockResolvedValue({
      dex: 'METEORA', price: 110, fee: 0, estimatedOutput: 110 // Higher is better
    });

    const bestRoute = await router.findBestRoute(1);
    expect(bestRoute.dex).toBe('METEORA');
  });
});

describe('2. API Validation (Integration Tests)', () => {
  
  // Test 4: Valid Order
  it('should accept a valid market order', async () => {
    const res = await request(API_URL).post('/orders/execute').send({
      type: "MARKET",
      side: "BUY",
      inputToken: "USDC",
      outputToken: "SOL",
      amount: 100
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.success).toBe(true);
  });

  // Test 5: Negative Amount
  it('should reject orders with negative amounts', async () => {
    const res = await request(API_URL).post('/orders/execute').send({
      type: "MARKET",
      side: "BUY",
      inputToken: "USDC",
      outputToken: "SOL",
      amount: -50
    });
    expect(res.status).toBe(400); // Validation error
  });

  // Test 6: Invalid Order Type
  it('should reject invalid order types', async () => {
    const res = await request(API_URL).post('/orders/execute').send({
      type: "LIMIT", // Our logic handles MARKET, but schema allows LIMIT.
                     // If you want to strictly fail LIMIT in logic, you'd need to update controller.
                     // For now, let's test a completely garbage type:
      side: "BUY", 
      inputToken: "USDC", 
      outputToken: "SOL", 
      amount: 100
    }).send({ type: "GARBAGE_TYPE" }); 
    
    // Actually, Zod will catch this before it hits logic
    const resGarbage = await request(API_URL).post('/orders/execute').send({
        type: "NON_EXISTENT", side: "BUY", inputToken: "A", outputToken: "B", amount: 10
    });
    expect(resGarbage.status).toBe(400);
  });

  // Test 7: Missing Fields
  it('should reject requests missing required fields', async () => {
    const res = await request(API_URL).post('/orders/execute').send({
      side: "BUY",
      amount: 100
      // Missing type and tokens
    });
    expect(res.status).toBe(400);
  });
});

describe('3. Queue & Concurrency (System Tests)', () => {
  
  // Test 8: High Concurrency (Queue Behaviour)
  it('should handle multiple concurrent orders without crashing', async () => {
    const requests = Array(5).fill(0).map(() => 
      request(API_URL).post('/orders/execute').send({
        type: "MARKET", side: "BUY", inputToken: "USDC", outputToken: "SOL", amount: 10
      })
    );
    
    const responses = await Promise.all(requests);
    const successes = responses.filter(r => r.status === 200);
    
    // We expect all 5 to be queued successfully
    expect(successes.length).toBe(5);
  });

  // Test 9: Data Persistence
  it('should return unique Order IDs for every request', async () => {
    const res1 = await request(API_URL).post('/orders/execute').send({
      type: "MARKET", side: "BUY", inputToken: "USDC", outputToken: "SOL", amount: 10
    });
    const res2 = await request(API_URL).post('/orders/execute').send({
      type: "MARKET", side: "BUY", inputToken: "USDC", outputToken: "SOL", amount: 10
    });

    expect(res1.body.orderId).not.toBe(res2.body.orderId);
  });

  // Test 10: WebSocket Connection Endpoint
  it('should return 404/Error if connecting to WS without Order ID', async () => {
      // Trying to hit the HTTP endpoint that upgrades to WS
      // Fastify usually handles this, but let's ensure the route exists
      const res = await request(API_URL).get('/orders/ws');
      // Should close or fail because we didn't provide ?id=
      // In HTTP terms, the upgrade failing usually looks like 404 or connection closed
      expect(res.status).not.toBe(200); 
  });
});