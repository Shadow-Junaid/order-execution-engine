# 🚀 Solana Order Execution Engine

A high-throughput, low-latency order execution engine designed for Solana DEXs (Raydium/Meteora). Built with **Node.js**, **BullMQ**, and **Redis** to handle concurrent user orders with real-time WebSocket updates.

## 🌟 Features
* **Smart DEX Routing:** Automatically queries quotes from multiple DEXs (Mocked Raydium vs Meteora) and routes to the best price execution.
* **High Concurrency:** Implements a token-bucket rate-limited queue (100 orders/min) using BullMQ to handle burst traffic without network bans.
* **Real-Time Updates:** Decoupled WebSocket architecture streams status updates (`Pending` → `Routing` → `Confirmed`) to the client instantly using Redis Pub/Sub.
* **Resiliency:** Implements exponential back-off retry logic (≤3 attempts) to handle transient network failures gracefully before marking orders as failed.
* **Persistence:** Stores full order history and execution logs in PostgreSQL.

---

## 🛠 Tech Stack
* **Runtime:** Node.js + TypeScript
* **API Server:** Fastify (Chosen for low overhead vs Express)
* **Queue System:** BullMQ + Redis
* **Database:** PostgreSQL + Prisma ORM
* **Testing:** Vitest + Supertest

---

## 🧠 Design Decisions & Trade-offs

### 1. Why Market Orders?
I selected **Market Orders** as the primary order type because they demand the highest focus on **system latency** and **queue throughput**. Unlike Limit orders (which require a separate cron-based pricing engine) or Sniper orders (which require mempool scanning), Market orders allowed me to dedicate engineering time to perfecting the **Queue Concurrency**, **Retry Logic**, and **WebSocket Glue**—the critical infrastructure components required for an HFT-style engine.

### 2. Extensibility (How to add Limit Orders)
To extend this engine to support **Limit Orders**, I would:
1.  **Schema Change:** Add `targetPrice` and `expiry` fields to the `Order` model.
2.  **Price Listener:** Create a separate worker service that subscribes to a WebSocket price feed (e.g., Pyth or Chainlink).
3.  **Trigger Logic:** When `livePrice <= targetPrice`, the listener injects a job into the existing `order-execution` queue, reusing the exact same routing and execution logic built here.

### 3. Retry Strategy
I implemented an **Exponential Back-off** strategy (1s → 2s → 4s) using BullMQ's built-in settings. This prevents the system from spamming the DEX API during temporary outages. If the order fails after 3 attempts, the system catches the final error, marks the database status as `failed`, and persists the error reason for post-mortem analysis.

---

## 🏃‍♂️ How to Run Locally

### Prerequisites
* Node.js (v18+)
* Docker & Docker Compose

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