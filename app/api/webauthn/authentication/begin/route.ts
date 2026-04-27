import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { getDb, nowMs } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { getExpectedOriginFromRequest, getRpIdFromRequest } from "@/lib/webauthn-server";
import * as crypto from "crypto";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { userId } = await getOrCreateSession();
    const rpID = getRpIdFromRequest(request);
    const expectedOrigin = getExpectedOriginFromRequest(request);

    const creds = db
      .prepare("SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?")
      .all(userId) as Array<{ credential_id: string; transports: string | null }>;

    const allowCredentials =
      creds.length > 0
        ? creds.map((c) => ({
            id: c.credential_id,
            type: "public-key" as const,
            transports: (() => {
              try {
                const parsed = c.transports ? JSON.parse(c.transports) : null;
                return Array.isArray(parsed) ? parsed : undefined;
              } catch {
                return undefined;
              }
            })(),
          }))
        : undefined;

    // Discoverable login support: if this is a fresh session with no known creds,
    // omit allowCredentials and let the browser pick a resident credential.
    const options = (await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials,
      timeout: 60_000,
    })) as PublicKeyCredentialRequestOptionsJSON;

    if (!options?.challenge) {
      throw new Error("WebAuthn authentication options missing challenge");
    }

    const now = nowMs();
    const expiresAt = now + 5 * 60 * 1000;
    db.prepare(
      "INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, rp_id, origin, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      userId,
      "authentication",
      options.challenge,
      rpID,
      expectedOrigin,
      expiresAt,
      now
    );

    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication begin failed" },
      { status: 500 }
    );
  }
}

