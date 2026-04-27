import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { getDb, nowMs } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { getExpectedOriginFromRequest, getRpIdFromRequest } from "@/lib/webauthn-server";
import * as crypto from "crypto";

type FinishBody = { response: AuthenticationResponseJSON };

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { userId: sessionUserId } = await getOrCreateSession();
    const body = (await request.json()) as FinishBody;
    if (!body?.response) {
      return NextResponse.json({ error: "Missing response" }, { status: 400 });
    }

    const rpID = getRpIdFromRequest(request);
    const expectedOrigin = getExpectedOriginFromRequest(request);
    const now = nowMs();

    const challengeRow = db
      .prepare(
        `SELECT id, challenge, rp_id, origin, expires_at, user_id
         FROM webauthn_challenges
         WHERE purpose = 'authentication'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as
      | {
          id: string;
          challenge: string;
          rp_id: string;
          origin: string;
          expires_at: number;
          user_id: string | null;
        }
      | undefined;

    if (!challengeRow || challengeRow.expires_at <= now) {
      return NextResponse.json({ error: "Authentication challenge expired" }, { status: 400 });
    }

    const credentialId = body.response.id;
    const cred = db
      .prepare(
        `SELECT user_id, credential_id, credential_id_bytes, cose_public_key, sign_count
         FROM webauthn_credentials
         WHERE credential_id = ?`
      )
      .get(credentialId) as
      | {
          user_id: string;
          credential_id: string;
          credential_id_bytes: Buffer;
          cose_public_key: Buffer;
          sign_count: number;
        }
      | undefined;

    if (!cred) {
      return NextResponse.json(
        { error: "No account found for this passkey (unknown credentialId)." },
        { status: 404 }
      );
    }

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(cred.cose_public_key),
        counter: cred.sign_count,
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json({ error: "Authentication verification failed" }, { status: 400 });
    }

    const newCounter = verification.authenticationInfo.newCounter;
    db.prepare("UPDATE webauthn_credentials SET sign_count = ? WHERE credential_id = ?").run(
      newCounter,
      credentialId
    );

    // Attach this credential to the current session user so "List accounts" works after discoverable login.
    if (cred.user_id !== sessionUserId) {
      db.prepare("UPDATE webauthn_credentials SET user_id = ? WHERE credential_id = ?").run(
        sessionUserId,
        credentialId
      );
      db.prepare("UPDATE smart_accounts SET user_id = ? WHERE credential_id = ?").run(
        sessionUserId,
        credentialId
      );
    }

    const acct = db
      .prepare(
        `SELECT smart_account_address, deployed, key_data_hex
         FROM smart_accounts
         WHERE credential_id = ?`
      )
      .get(credentialId) as
      | { smart_account_address: string; deployed: number; key_data_hex: string }
      | undefined;

    if (!acct) {
      return NextResponse.json(
        { error: "Credential verified, but no smart account mapping exists." },
        { status: 500 }
      );
    }

    const accounts = db
      .prepare(
        `SELECT smart_account_address, credential_id, deployed
         FROM smart_accounts
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .all(sessionUserId) as Array<{
      smart_account_address: string;
      credential_id: string;
      deployed: number;
    }>;

    db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(challengeRow.id);

    return NextResponse.json({
      smartAccountAddress: acct.smart_account_address,
      keyDataHex: acct.key_data_hex,
      deployed: !!acct.deployed,
      activeCredentialId: credentialId,
      accounts: accounts.map((a) => ({
        smartAccountAddress: a.smart_account_address,
        credentialId: a.credential_id,
        deployed: !!a.deployed,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication finish failed" },
      { status: 500 }
    );
  }
}

