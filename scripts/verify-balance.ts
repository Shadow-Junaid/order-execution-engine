import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const privateKey = process.env.WALLET_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    throw new Error("❌ Missing SOLANA_RPC_URL or WALLET_PRIVATE_KEY in .env");
  }

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

    console.log(`\n🔍 Checking Balance for: ${wallet.publicKey.toBase58()}`);
    console.log(`📡 Connected to: ${rpcUrl}`);

    const balance = await connection.getBalance(wallet.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;

    console.log(`💰 Balance: ${solBalance} SOL`);

    if (solBalance < 0.5) {
      console.log("⚠️  Warning: Balance is low! Go back to the faucet.");
    } else {
      console.log("✅ READY FOR REAL TRANSACTIONS!");
    }
  } catch (err: any) {
    console.error("❌ Connection Failed:", err.message);
  }
}

main();