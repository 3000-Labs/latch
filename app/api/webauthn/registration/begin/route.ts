import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { getDb, nowMs } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import {
  getExpectedOriginFromRequest,
  getRpIdFromRequest,
  stableUserIdBytes,
} from "@/lib/webauthn-server";
import * as crypto from "crypto";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { userId } = await getOrCreateSession();
    const body = (await request.json().catch(() => ({}))) as { displayName?: string };
    const rpID = getRpIdFromRequest(request);
    const expectedOrigin = getExpectedOriginFromRequest(request);

    const options = (await generateRegistrationOptions({
      rpID,
      rpName: "Latch",
      userID: stableUserIdBytes(userId),
      userName: body.displayName || "local-user",
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      supportedAlgorithmIDs: [-7],
      timeout: 60_000,
    })) as PublicKeyCredentialCreationOptionsJSON;

    if (!options?.challenge) {
      throw new Error("WebAuthn registration options missing challenge");
    }

    const now = nowMs();
    const expiresAt = now + 5 * 60 * 1000;
    db.prepare(
      "INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, rp_id, origin, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      userId,
      "registration",
      options.challenge,
      rpID,
      expectedOrigin,
      expiresAt,
      now
    );

    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration begin failed" },
      { status: 500 }
    );
  }
}

