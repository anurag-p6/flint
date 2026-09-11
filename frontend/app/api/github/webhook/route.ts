import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/github-webhook";
import { parseLinkedPRs } from "@/lib/issue-spec";

/// Fire-and-forget trigger for the keeper verify pass (Block 05).
/// Never throws — webhook delivery must not depend on keeper availability.
function triggerKeeper(payload: Record<string, unknown>) {
  const appUrl = process.env.APP_URL;
  const secret = process.env.KEEPER_CRON_SECRET;
  if (!appUrl || !secret) {
    console.log("keeper trigger skipped (APP_URL/KEEPER_CRON_SECRET unset)", payload);
    return;
  }
  fetch(`${appUrl}/api/keeper`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch((err) => console.error("keeper trigger failed:", err));
}

function linkedIssuesFromPR(body: unknown): number[] {
  if (typeof body !== "string") return [];
  return parseLinkedPRs(body);
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody) as Record<string, any>;
    const repo = body.repository?.full_name ?? "unknown";
    const action = body.action ?? "";
    console.log(`Webhook: ${event}.${action} repo=${repo}`);

    if (event === "installation") {
      console.log(`App installation ${action}`, {
        installation: body.installation?.id,
        repos: (body.repositories ?? []).map((r: any) => r.full_name),
      });
    }

    if (event === "issues" && body.issue) {
      const issue = body.issue;
      const hasFlint = (issue.labels ?? []).some(
        (l: any) => (typeof l === "string" ? l : l.name) === "flint",
      );
      console.log(`Issue #${issue.number} ${action} flint=${hasFlint} repo=${repo}`);
      if (action === "closed" && issue.state_reason !== "not_planned") {
        triggerKeeper({ reason: "issue-closed", repo, issue: issue.number });
      }
    }

    if (event === "pull_request" && body.pull_request) {
      const pr = body.pull_request;
      if (action === "closed" && pr.merged === true) {
        const targets = linkedIssuesFromPR(pr.body);
        console.log(`PR #${pr.number} merged, links issues ${targets.join(",")} repo=${repo}`);
        if (targets.length > 0) {
          triggerKeeper({ reason: "pr-merged", repo, pr: pr.number, issues: targets });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("webhook handler error:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
