import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { getDb, nowMs } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import {
  coseEc2ToRawP256Uncompressed,
  fromBase64Url,
  getExpectedOriginFromRequest,
  getRpIdFromRequest,
  sha256Hex,
  toBase64Url,
} from "@/lib/webauthn-server";
import {
  buildWebauthnAccountInitParams,
  deployWebauthnSmartAccount,
  deriveWebauthnSalt,
  getFactoryConfigFromEnv,
  isSorobanContractDeployed,
  predictWebauthnSmartAccountAddress,
} from "@/lib/smart-account-factory-webauthn";
import { rpc } from "@stellar/stellar-sdk";
import * as crypto from "crypto";

type FinishBody = { response: RegistrationResponseJSON };

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { userId } = await getOrCreateSession();

    const body = (await request.json()) as FinishBody;
    if (!body?.response) {
      return NextResponse.json({ error: "Missing response" }, { status: 400 });
    }

    const rpID = getRpIdFromRequest(request);
    const expectedOrigin = getExpectedOriginFromRequest(request);
    const now = nowMs();

    const challengeRow = db
      .prepare(
        `SELECT id, challenge, rp_id, origin, expires_at
         FROM webauthn_challenges
         WHERE user_id = ? AND purpose = 'registration'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId) as
      | { id: string; challenge: string; rp_id: string; origin: string; expires_at: number }
      | undefined;

    if (!challengeRow || challengeRow.expires_at <= now) {
      return NextResponse.json({ error: "Registration challenge expired" }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Registration verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Newer @simplewebauthn/server exposes credential fields under `registrationInfo.credential`
    const credentialId = credential.id;
    const credentialIdBytes = fromBase64Url(credentialId);
    const cosePublicKey = Buffer.from(credential.publicKey);
    const rawPublicKey = coseEc2ToRawP256Uncompressed(cosePublicKey);

    const keyData = Buffer.concat([rawPublicKey, credentialIdBytes]);
    const keyDataHex = keyData.toString("hex");
    const salt = deriveWebauthnSalt(keyDataHex);
    const saltHex = salt.toString("hex");

    const config = getFactoryConfigFromEnv();
    if (!config.bundlerSecret) {
      return NextResponse.json({ error: "BUNDLER_SECRET not set." }, { status: 500 });
    }

    const server = new rpc.Server(config.rpcUrl);
    const params = buildWebauthnAccountInitParams(keyDataHex, salt);

    const predictedAddress = await predictWebauthnSmartAccountAddress({
      server,
      networkPassphrase: config.networkPassphrase,
      factoryAddress: config.factoryAddress,
      params,
    });

    const deployedBefore = await isSorobanContractDeployed(server, predictedAddress);
    const deployResult = await deployWebauthnSmartAccount({
      server,
      networkPassphrase: config.networkPassphrase,
      factoryAddress: config.factoryAddress,
      bundlerSecret: config.bundlerSecret,
      params,
      predictedAddress,
    });

    const deployedAfter = await isSorobanContractDeployed(server, predictedAddress);

    const credExists = db
      .prepare("SELECT credential_id, user_id FROM webauthn_credentials WHERE credential_id = ?")
      .get(credentialId) as { credential_id: string; user_id: string } | undefined;

    if (credExists && credExists.user_id !== userId) {
      return NextResponse.json(
        { error: "This passkey is already registered to a different user session." },
        { status: 409 }
      );
    }

    const credId = credExists?.credential_id
      ? (db
          .prepare("SELECT id FROM webauthn_credentials WHERE credential_id = ?")
          .get(credentialId) as { id: string }).id
      : crypto.randomUUID();

    db.prepare(
      `INSERT INTO webauthn_credentials
        (id, user_id, credential_id, credential_id_bytes, cose_public_key, p256_raw_public_key, sign_count, transports, device_type, backed_up, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(credential_id) DO UPDATE SET
         user_id=excluded.user_id,
         credential_id_bytes=excluded.credential_id_bytes,
         cose_public_key=excluded.cose_public_key,
         p256_raw_public_key=excluded.p256_raw_public_key,
         sign_count=excluded.sign_count,
         transports=excluded.transports,
         device_type=excluded.device_type,
         backed_up=excluded.backed_up`
    ).run(
      credId,
      userId,
      credentialId,
      credentialIdBytes,
      cosePublicKey,
      rawPublicKey,
      credential.counter,
      JSON.stringify(credential.transports ?? body.response.response.transports ?? null),
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      now
    );

    db.prepare(
      `INSERT INTO smart_accounts
        (id, user_id, credential_id, key_data_hex, salt_hex, smart_account_address, deployed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(credential_id) DO UPDATE SET
         user_id=excluded.user_id,
         key_data_hex=excluded.key_data_hex,
         salt_hex=excluded.salt_hex,
         smart_account_address=excluded.smart_account_address,
         deployed=excluded.deployed`
    ).run(
      crypto.randomUUID(),
      userId,
      credentialId,
      keyDataHex,
      saltHex,
      predictedAddress,
      deployedAfter ? 1 : 0,
      now
    );

    // cleanup used challenge
    db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(challengeRow.id);

    return NextResponse.json({
      credentialId,
      keyDataHex,
      saltHex,
      smartAccountAddress: predictedAddress,
      deployed: deployedAfter,
      alreadyDeployed: deployResult.alreadyDeployed || deployedBefore,
      determinismCheck: {
        keyDataHash: sha256Hex(keyDataHex),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration finish failed" },
      { status: 500 }
    );
  }
}

