/**
 * Server-side session for database mode: an HMAC-signed, httpOnly cookie
 * naming the signed-in user. The simulation has no passwords (you pick a
 * staff login), but once signed in every request is attributed and
 * authorised on the server, never on the client's word.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv, sessionSecret } from "./env";

export const SESSION_COOKIE = "hims_session";
/** Twelve hours — one shift and change. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function sign(body: string) {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()) {
  const body = `${userId}.${now}`;
  return `${body}.${sign(body)}`;
}

/** The user id in a valid, unexpired token; null otherwise. */
export function readSessionToken(
  token: string | undefined | null,
  now = Date.now()
): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const body = token.slice(0, cut);
  const given = Buffer.from(token.slice(cut + 1));
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  const dot = body.lastIndexOf(".");
  const userId = body.slice(0, dot);
  const issuedAt = Number(body.slice(dot + 1));
  if (!userId || !Number.isFinite(issuedAt)) return null;
  if (issuedAt > now + 60_000) return null;
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;
  return userId;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: serverEnv().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
