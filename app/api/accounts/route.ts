import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

export async function GET() {
  try {
    const db = getDb();
    const { userId } = getOrCreateSession();

    const accounts = db
      .prepare(
        `SELECT smart_account_address, credential_id, deployed, created_at
         FROM smart_accounts
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .all(userId) as Array<{
      smart_account_address: string;
      credential_id: string;
      deployed: number;
      created_at: number;
    }>;

    return NextResponse.json({
      accounts: accounts.map((a) => ({
        smartAccountAddress: a.smart_account_address,
        credentialId: a.credential_id,
        deployed: !!a.deployed,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "List accounts failed" },
      { status: 500 }
    );
  }
}

