import { timingSafeEqual } from "node:crypto";
import { createHmac } from "node:crypto";

/// Verifies the GitHub webhook HMAC-SHA256 signature.
/// GitHub sends `x-hub-signature-256: sha256=<hex>` computed over the raw body.
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
