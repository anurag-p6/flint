// Acceptance checks for lib/github-webhook.ts (Block 03).
// Run: node scripts/check-webhook.mjs
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../lib/github-webhook.ts";

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name}`); failures++; }
}

const secret = "test-secret";
const body = JSON.stringify({ action: "opened" });
const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
check("valid signature passes", verifyWebhookSignature(body, good, secret));
check("tampered body fails", verifyWebhookSignature(body + "x", good, secret) === false);
check("wrong secret fails", verifyWebhookSignature(body, good, "other") === false);
check("missing header fails", verifyWebhookSignature(body, null, secret) === false);
check("missing secret fails", verifyWebhookSignature(body, good, "") === false);

process.exit(failures ? 1 : 0);
