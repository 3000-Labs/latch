import { NextResponse } from "next/server";
import { getDb, nowMs } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

/**
 * Recovery hook (DB + UX integration point):
 * - Today: this endpoint just records intent/metadata for adding a backup passkey.
 * - Future: wire this to an on-chain method that adds a second signer/guardian.
 */
export async function POST(request: Request) {
  try {
    const db = getDb();
    const { userId } = getOrCreateSession();
    const body = (await request.json().catch(() => ({}))) as {
      smartAccountAddress?: string;
      label?: string;
    };

    if (!body.smartAccountAddress || typeof body.smartAccountAddress !== "string") {
      return NextResponse.json({ error: "Missing smartAccountAddress" }, { status: 400 });
    }

    const owned = db
      .prepare(
        "SELECT smart_account_address FROM smart_accounts WHERE user_id = ? AND smart_account_address = ?"
      )
      .get(userId, body.smartAccountAddress) as { smart_account_address: string } | undefined;

    if (!owned) {
      return NextResponse.json({ error: "Unknown account for this session user" }, { status: 404 });
    }

    db.prepare(
      `INSERT OR REPLACE INTO account_signers
        (smart_account_address, signer_type, credential_id, label, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(body.smartAccountAddress, "backup_passkey_intent", null, body.label ?? "backup-passkey", nowMs());

    return NextResponse.json({
      ok: true,
      next: "Call /api/webauthn/registration/* to register a second passkey, then attach it on-chain in a future step.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recovery hook failed" },
      { status: 500 }
    );
  }
}

