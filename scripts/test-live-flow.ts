import WebSocket from 'ws';
import axios from 'axios';

// ✅ CONFIG: Pointing to your LIVE Railway Deployment
const BASE_URL = 'order-execution-engine-production-28ef.up.railway.app';
const API_URL = `https://${BASE_URL}`; 
const WS_URL = `wss://${BASE_URL}`;   

async function runTest() {
  console.log(`\n🚀 Starting Live Cloud Test against: ${BASE_URL}\n`);

  try {
    // 0. Health Check
    console.log("0️⃣  Checking Server Health...");
    try {
        const health = await axios.get(API_URL);
        console.log(`   ✅ Server Online: ${health.data.service || 'OK'}`);
    } catch (e) {
        throw new Error(`⚠️ Server Unreachable at ${API_URL}. Check URL.`);
    }

    // 1. Submit Order (Using HTTPS)
    console.log("\n1️⃣  Submitting Market Order (0.01 SOL)...");
    const res = await axios.post(`${API_URL}/orders/execute`, {
      type: "MARKET",
      side: "SELL",
      inputToken: "SOL",
      outputToken: "USDC",
      amount: 0.01 
    });

    if (!res.data.success) {
      throw new Error(`API Error: ${res.data.error}`);
    }

    const orderId = res.data.orderId;
    console.log(`   ✅ Order Created! ID: ${orderId}`);

    // 2. Connect WebSocket (Using WSS)
    console.log(`\n2️⃣  Connecting to Secure WebSocket...`);
    const ws = new WebSocket(`${WS_URL}/orders/ws?id=${orderId}`);

    ws.on('open', () => {
      console.log("   ✅ Secure WebSocket Connected. Waiting for updates...");
    });

    ws.on('message', (data: any) => {
      const msg = JSON.parse(data.toString());
      const timestamp = new Date().toLocaleTimeString();
      
      console.log(`   [${timestamp}] 📡 Cloud Update: [${msg.status.toUpperCase()}]`);
      if (msg.log && !msg.log.includes('<a')) console.log(`      > ${msg.log}`);

      // Check for success
      if (msg.status === 'confirmed') {
        console.log("\n3️⃣  ✅ SUCCESS: Order Settled on Solana Devnet!");
        
        let link = msg.link;
        if (!link && msg.log.includes('http')) {
             link = msg.log.match(/https?:\/\/[^\s"]+/)?.[0];
        }
        
        if (link) {
            console.log(`\n🔗 TRANSACTION PROOF:\n   ${link.replace('"', '')}\n`);
        }
        
        ws.close();
        process.exit(0);
      }

      if (msg.status === 'failed') {
        console.error("\n❌ FAILED: Order execution failed on cloud.");
        ws.close();
        process.exit(1);
      }
    });

    ws.on('error', (err) => {
      console.error("❌ WebSocket Error:", err.message);
      process.exit(1);
    });

  } catch (error: any) {
    console.error("❌ Test Failed:", error.message || error);
    process.exit(1);
  }
}

runTest();