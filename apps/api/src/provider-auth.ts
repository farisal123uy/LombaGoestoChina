import { timingSafeEqual } from "node:crypto";
export function requireProviderToken(expected: string, header?: string) {
  const received = header?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1] || "";
  const a = Buffer.from(expected), b = Buffer.from(received);
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("PROVIDER_AUTH_REQUIRED");
}
