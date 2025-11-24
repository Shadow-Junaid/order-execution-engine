import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Generate a new random keypair
const keypair = Keypair.generate();

console.log("\n=== 🟢 NEW SOLANA DEVNET WALLET ===");
console.log("Public Key (Address):", keypair.publicKey.toBase58());
console.log("Private Key (Base58):", bs58.encode(keypair.secretKey));
console.log("\n👉 ACTION REQUIRED:");
console.log("1. Copy the 'Private Key' string.");
console.log("2. Open your .env file and add: WALLET_PRIVATE_KEY=your_copied_key");
console.log("3. Go to https://faucet.solana.com/");
console.log("4. Paste the Public Key there, select 'Devnet', and click 'Airdrop 1 SOL'.");
console.log("   (Do this 2-3 times to get enough gas money)");
console.log("======================================\n");