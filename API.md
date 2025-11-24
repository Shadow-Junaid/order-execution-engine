# 📡 API Documentation

**Base URL:** `https://solana-order-engine-production.up.railway.app`

## 1. Execute Order

Submit a new market order to be routed to the best DEX.

- **Endpoint:** `POST /orders/execute`
- **Content-Type:** `application/json`

### Request Body

| Field         | Type     | Required | Description                                   |
|--------------|----------|----------|-----------------------------------------------|
| `type`        | string   | Yes      | Must be `"MARKET"`.                           |
| `side`        | string   | Yes      | `"BUY"` or `"SELL"`.                          |
| `inputToken`  | string   | Yes      | Token to swap from (e.g., `"USDC"`).          |
| `outputToken` | string   | Yes      | Token to swap to (e.g., `"SOL"`).             |
| `amount`      | number   | Yes      | Amount of input token to swap.                |

### Example Request

```bash
curl -X POST https://your-app.up.railway.app/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MARKET",
    "side": "BUY",
    "inputToken": "USDC",
    "outputToken": "SOL",
    "amount": 100
  }'
```
### Success Response (200 OK)

```json
{
  "success": true,
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Order queued for execution"
}
```

### Error Response (400 Bad Request)
```json
{
  "error": "Invalid input: amount must be positive"
}
```
## 2. WebSocket Stream
Connect to receive real-time updates for a specific order.

Endpoint: wss://your-app.up.railway.app/orders/ws

Query Param: ?id={orderId}

### Connection Workflow
Client initiates WebSocket handshake with orderId.

Server accepts connection and subscribes the client to a Redis channel.

Worker processes order and publishes updates.

Server pushes updates to the WebSocket client.

### Message Format
Field	Type	Description
status	string	"pending", "routing", "submitted", "confirmed", "failed"
log	string	Human-readable status message
link	string	(Optional) Solana Explorer link

### Example Stream
```json
{ "status": "pending", "log": "Order received and queued" }
{ "status": "routing", "log": "Fetching quotes from DEXs..." }
{ "status": "routing", "log": "Selected METEORA at $150.20" }
{ "status": "submitted", "log": "Building & Signing Solana Transaction..." }
{
  "status": "confirmed",
  "log": "Confirmed! View on Solana: https://explorer.solana.com/tx/...",
  "link": "https://explorer.solana.com/tx/..."
}
```

## 3. Health Check
### Endpoint: GET /

### Example Response

```json
{
  "status": "ok",
  "service": "Solana Order Execution Engine",
  "uptime": 120.5
}
```