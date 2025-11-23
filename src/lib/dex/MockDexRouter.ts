// src/lib/dex/MockDexRouter.ts

// A simple delay function to simulate network latency
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Quote {
  dex: 'RAYDIUM' | 'METEORA';
  price: number;
  fee: number;
  estimatedOutput: number;
}

export class MockDexRouter {
  // Base price for simulation (e.g., 1 SOL = $150 USDC)
  private readonly BASE_PRICE = 150.0;

  /**
   * Simulates fetching a quote from Raydium (Higher variance)
   */
  async getRaydiumQuote(inputAmount: number): Promise<Quote> {
    await sleep(200); // Simulate 200ms network delay
    // Raydium price is Base Price +/- 2%
    const variance = 0.98 + Math.random() * 0.04; 
    const price = this.BASE_PRICE * variance;
    
    return {
      dex: 'RAYDIUM',
      price: price,
      fee: 0.003, // 0.3% fee
      estimatedOutput: inputAmount * price * (1 - 0.003)
    };
  }

  /**
   * Simulates fetching a quote from Meteora (Lower variance)
   */
  async getMeteoraQuote(inputAmount: number): Promise<Quote> {
    await sleep(200); // Simulate 200ms network delay
    // Meteora price is Base Price +/- 1%
    const variance = 0.99 + Math.random() * 0.02;
    const price = this.BASE_PRICE * variance;

    return {
      dex: 'METEORA',
      price: price,
      fee: 0.002, // 0.2% fee (slightly cheaper)
      estimatedOutput: inputAmount * price * (1 - 0.002)
    };
  }

  /**
   * The "Smart" Routing Logic
   * Queries both, compares, and returns the best one.
   */
  async findBestRoute(inputAmount: number): Promise<Quote> {
    // Run both queries in parallel (like a real aggregator)
    const [raydium, meteora] = await Promise.all([
      this.getRaydiumQuote(inputAmount),
      this.getMeteoraQuote(inputAmount)
    ]);

    // Log the decision (Crucial for the "Transparency" requirement)
    console.log(`[Router] Raydium: $${raydium.price.toFixed(2)} | Meteora: $${meteora.price.toFixed(2)}`);

    // Return the one with higher estimated output
    return raydium.estimatedOutput > meteora.estimatedOutput ? raydium : meteora;
  }

  /**
   * Simulates the actual swap execution
   */
  async executeTrade(quote: Quote): Promise<{ txHash: string; finalPrice: number }> {
    console.log(`[Router] Executing on ${quote.dex}...`);
    
    // Simulate the 2-3 second blockchain delay
    await sleep(2000 + Math.random() * 1000);

    // Simulate slippage (Price might change slightly during execution)
    const slippage = 1 - (Math.random() * 0.005); // Up to 0.5% slippage
    const finalPrice = quote.price * slippage;

    return {
      txHash: 'sol_' + Math.random().toString(36).substring(7), // Mock Hash
      finalPrice: finalPrice
    };
  }
}