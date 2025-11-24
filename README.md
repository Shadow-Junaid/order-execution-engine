# 🚀 HyperFlash: Solana Order Execution Engine

A high-throughput, low-latency order execution engine designed for Solana DEXs. Built with **Node.js**, **BullMQ**, and **Redis** to handle concurrent user orders with real-time WebSocket updates and On-Chain Settlement.

> **🟢 Live Deployment:** [https://order-execution-engine-production-28ef.up.railway.app/](https://order-execution-engine-production-28ef.up.railway.app/) (Replace with your actual Railway link)
>
> **📺 Video Demo:** [Watch the Walkthrough](https://www.youtube.com/watch?v=vYqUPOR1ZBc)

---

## 🌟 Key Features

* **Real On-Chain Settlement:** Executes actual transactions on Solana Devnet, signing with a real wallet and handling network confirmation latency.
* **Smart DEX Routing:** Simulates quoting from multiple DEXs (Raydium vs. Meteora) and automatically routes the order to the venue with the best price execution.
* **High Concurrency:** Implements a **Token Bucket** rate-limited queue (100 orders/min) using BullMQ to handle burst traffic without triggering RPC bans.
* **Real-Time Streaming:** Decoupled WebSocket architecture streams status updates (`Pending` → `Routing` → `Submitted` → `Confirmed`) instantly using Redis Pub/Sub.
* **Resiliency:** Implements exponential back-off retry logic (≤3 attempts) to handle transient network failures before marking orders as failed.
* **Persistence:** Full order history and execution logs stored in PostgreSQL.

---

## 🛠 Tech Stack

* **Runtime:** Node.js + TypeScript
* **API Server:** Fastify (Chosen for lower overhead compared to Express)
* **Queue System:** BullMQ + Redis (Asynchronous job processing)
* **Database:** PostgreSQL + Prisma ORM
* **Blockchain:** @solana/web3.js (Devnet Interaction)
* **Testing:** Vitest + Supertest
* **Infrastructure:** Docker & Railway

---

## 🧠 Design Decisions & Trade-offs

### 1. Choice of Order Type: Market Orders
I selected **Market Orders** as the primary order type because they demand the highest focus on **system latency** and **queue throughput**. Unlike Limit orders (which require a separate cron-based pricing engine) or Sniper orders (which require mempool scanning), Market orders allowed me to dedicate engineering time to perfecting the **Queue Concurrency**, **Retry Logic**, and **WebSocket Glue**—the critical infrastructure components required for an HFT-style engine.

### 2. Extensibility (How to add Limit Orders)
To extend this engine to support **Limit Orders**, I would:
1.  **Schema Change:** Add `targetPrice` and `expiry` fields to the `Order` model.
2.  **Price Listener:** Create a separate worker service that subscribes to a WebSocket price feed (e.g., Pyth or Chainlink).
3.  **Trigger Logic:** When `livePrice <= targetPrice`, the listener injects a job into the existing `order-execution` queue, reusing the exact same routing and execution logic built here.

### 3. Hybrid Architecture (Mocking vs. Real Execution)
**Constraint:** The assignment suggests using Raydium/Meteora SDKs. However, liquidity pools on Solana Devnet are notoriously scarce or empty, often leading to `Pool Not Found` errors that cause flaky demonstrations.

**Solution:** I implemented a **Hybrid Router**:
1.  **Pricing (Mocked):** To ensure the application always receives valid quotes and demonstrates the routing logic without crashing, I simulated the *read* layer.
2.  **Settlement (Real On-Chain):** To fulfill the core requirement of "Real Execution" and "Network Latency," the engine executes a **Real Native SOL Transfer** on the Solana Devnet. This proves the system's ability to manage wallet keys, sign transactions, pay gas fees, and handle asynchronous blockchain confirmation latency (2-3s).

---

## 🏃‍♂️ How to Run Locally

### Prerequisites
* Node.js (v18+)
* Docker & Docker Compose
* A Solana Devnet Wallet with SOL (funded via `src/scripts/gen-wallet.ts`)

### Steps

1.  **Start Infrastructure** (Redis & Postgres):
    ```bash
    docker-compose up -d
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Initialize Database:**
    ```bash
    npx prisma migrate dev --name init
    ```

4.  **Run the Server:**
    ```bash
    npm run dev
    ```
    *Server will start at `http://localhost:3000`*

5.  **Run the Client:**
    Open `client/index.html` in your browser to visualize trades.

---

## 🧪 Testing

The project includes a comprehensive suite of **10 Unit and Integration tests** covering Router Logic, API Validation, and Queue Concurrency.

**Run Tests:**
```bash
# Ensure server is running in one terminal (npm run dev)
npm test