import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

let _db: Database.Database | null = null;

export type Db = Database.Database;

export function getDb(): Db {
  if (_db) return _db;

  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "dev.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  initDb(db);
  _db = db;
  return db;
}

export function initDb(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      credential_id TEXT NOT NULL UNIQUE,
      credential_id_bytes BLOB NOT NULL,

      cose_public_key BLOB NOT NULL,
      p256_raw_public_key BLOB NOT NULL,

      sign_count INTEGER NOT NULL,
      transports TEXT NULL,
      device_type TEXT NULL,
      backed_up INTEGER NOT NULL DEFAULT 0,

      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);

    CREATE TABLE IF NOT EXISTS smart_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL REFERENCES webauthn_credentials(credential_id) ON DELETE CASCADE,

      key_data_hex TEXT NOT NULL UNIQUE,
      salt_hex TEXT NOT NULL,
      smart_account_address TEXT NOT NULL UNIQUE,

      deployed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,

      UNIQUE(credential_id)
    );
    CREATE INDEX IF NOT EXISTS smart_accounts_user_id_idx ON smart_accounts(user_id);

    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      challenge TEXT NOT NULL,
      rp_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_idx ON webauthn_challenges(expires_at);

    -- Recovery hook: allow multiple credentials / signer types per account later.
    CREATE TABLE IF NOT EXISTS account_signers (
      smart_account_address TEXT NOT NULL REFERENCES smart_accounts(smart_account_address) ON DELETE CASCADE,
      signer_type TEXT NOT NULL, -- 'webauthn_credential' | 'guardian' | 'delegated' | ...
      credential_id TEXT NULL REFERENCES webauthn_credentials(credential_id) ON DELETE SET NULL,
      label TEXT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (smart_account_address, signer_type, credential_id)
    );
  `);
}

export function nowMs() {
  return Date.now();
}

