/**
 * End-to-end smoke test for the dummy on-ramp relayer flow.
 *
 * Requires:
 * - Next.js dev server running
 * - RELAYER_URL, RELAYER_API_KEY, DUMMY_ONRAMP_DEPOSITOR_SEED configured
 * - latch-relayer running and pool funded
 *
 * Usage: node scripts/test-dummy-on-ramp.mjs [baseUrl]
 */
const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const testCAddress =
  process.env.TEST_C_ADDRESS ??
  "CCOX4AG3XESDAZC7L27AMQZ6KKMUWEU2KCHFXJ2PXNAXMDUCL225MN2P";

const depositAmount = process.env.DEPOSIT_AMOUNT ?? "5";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 12;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Dummy on-ramp E2E ===");
  console.log("Base URL:", baseUrl);
  console.log("C-address:", testCAddress);
  console.log("Amount:", depositAmount);
  console.log();

  console.log("Step 1: Create deposit intent");
  const sessionRes = await fetch(`${baseUrl}/api/dummy-on-ramp/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      destinationCAddress: testCAddress,
      amount: depositAmount,
    }),
  });

  const session = await sessionRes.json().catch(() => ({}));
  console.log("status:", sessionRes.status);
  console.log(JSON.stringify(session, null, 2));

  if (!sessionRes.ok) {
    process.exit(1);
  }

  for (const key of [
    "intentId",
    "memoId",
    "poolAddress",
    "expiresAt",
    "amount",
  ]) {
    if (!session[key]) {
      console.error(`Missing field: ${key}`);
      process.exit(1);
    }
  }

  console.log();
  console.log("Step 2: Submit testnet payment to pool");
  const payRes = await fetch(`${baseUrl}/api/dummy-on-ramp/pay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      poolAddress: session.poolAddress,
      memoId: session.memoId,
      amount: session.amount,
    }),
  });

  const payment = await payRes.json().catch(() => ({}));
  console.log("status:", payRes.status);
  console.log(JSON.stringify(payment, null, 2));

  if (!payRes.ok) {
    process.exit(1);
  }

  if (!payment.txHash) {
    console.error("Missing txHash in payment response");
    process.exit(1);
  }

  console.log();
  console.log("Step 3: Poll relayer status until completed");
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch(
      `${baseUrl}/api/dummy-on-ramp/status/${encodeURIComponent(session.memoId)}`
    );
    const status = await statusRes.json().catch(() => ({}));
    console.log(`poll ${attempt}:`, statusRes.status, status.status ?? status.message);

    if (!statusRes.ok) {
      continue;
    }

    if (status.status === "completed") {
      const doneForward = (status.forwards ?? []).find(
        (f) => f.status === "done"
      );
      if (!doneForward) {
        console.error("Intent completed but no forward with status=done");
        process.exit(1);
      }
      console.log();
      console.log("✓ E2E passed");
      console.log("  forward tx:", doneForward.forwardTx ?? "(none)");
      return;
    }

    if (status.status === "failed" || status.status === "expired") {
      console.error(`Intent ended with status: ${status.status}`);
      process.exit(1);
    }
  }

  console.error("Timed out waiting for relayer to complete forwarding.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
