import { cookies } from "next/headers";
import { getDb, nowMs } from "@/lib/db";
import * as crypto from "crypto";

const SESSION_COOKIE_NAME = "sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type SessionInfo = {
  sessionId: string;
  userId: string;
};

function randomId() {
  return crypto.randomUUID();
}

export async function getOrCreateSession(): Promise<SessionInfo> {
  const db = getDb();
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE_NAME)?.value;
  const now = nowMs();

  if (existing) {
    const row = db
      .prepare("SELECT id, user_id, expires_at FROM sessions WHERE id = ?")
      .get(existing) as { id: string; user_id: string; expires_at: number } | undefined;

    if (row && row.expires_at > now) {
      db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(now + SESSION_TTL_MS, row.id);
      jar.set(SESSION_COOKIE_NAME, row.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      });
      return { sessionId: row.id, userId: row.user_id };
    }
  }

  const userId = randomId();
  const sessionId = randomId();
  db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(userId, now);
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sessionId,
    userId,
    now,
    now + SESSION_TTL_MS
  );

  jar.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return { sessionId, userId };
}

