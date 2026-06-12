// Visitor token = HMAC-SHA256(SERVICE_ROLE_KEY, visitor_id), base64url.
// Stored in visitor's browser localStorage by widget.js. No DB column needed.
import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signVisitorToken(visitorId: string): string {
  return b64url(createHmac("sha256", getSecret()).update(visitorId).digest());
}

export function verifyVisitorToken(visitorId: string, token: string): boolean {
  if (!visitorId || !token) return false;
  const expected = signVisitorToken(visitorId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
