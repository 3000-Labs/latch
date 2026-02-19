#!/usr/bin/env node

import StellarSdk from "@stellar/stellar-sdk";

const { rpc } = StellarSdk;

const txHash = "b50283b8bf8aacf019c976c7040f5629fb6daa518a4beb8b2c4ce4241ae2beb9";
const server = new rpc.Server("https://soroban-testnet.stellar.org");

const result = await server.getTransaction(txHash);

console.log("Transaction Status:", result.status);
console.log("\nDiagnostic Events:");

if (result.diagnosticEventsXdr) {
  result.diagnosticEventsXdr.forEach((event, i) => {
    console.log(`\n--- Event ${i} ---`);
    console.log(JSON.stringify(event, null, 2));
  });
}

console.log("\nResult XDR:");
console.log(JSON.stringify(result.resultXdr, null, 2));
