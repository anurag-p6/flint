import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { verifyWebhookSignature } from "@/lib/github-webhook";
import { parseLinkedPRs } from "@/lib/issue-spec";
import { emitLive, touchesContributorsMd } from "@/lib/live-bus";
import { parseContributorsMd, diffMappings } from "@/lib/contributor-mapping";

/// Regen CRE contributorMapping when CONTRIBUTORS.md changes. Only touches the
/// config whose repoOwner/repoName matches the push repo; never throws (webhook
/// must stay fast + 200). TEE pickup still needs `cre workflow deploy`.
async function refreshMappingForRepo(repo: string, ref?: string): Promise<void> {
  const pat = process.env.GITHUB_SERVER_PAT;
  if (!pat) {
    console.log("mapping refresh skipped (no GITHUB_SERVER_PAT)");
    return;
  }
  try {
    const url =
      `https://api.github.com/repos/${repo}/contents/CONTRIBUTORS.md` + (ref ? `?ref=${ref}` : "");
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Flint",
      },
    });
    if (res.status === 404) {
      console.log(`mapping refresh: CONTRIBUTORS.md missing in ${repo} (payable set unchanged)`);
      return;
    }
    if (!res.ok) {
      console.log(`mapping refresh: GitHub ${res.status}`);
      return;
    }
    const mapping = parseContributorsMd(
      Buffer.from((await res.json()).content, "base64").toString("utf-8"),
    );
    const dir = path.join(process.cwd(), "..", "chainlink-cre", "flint-scorer");
    for (const e of ["staging", "production"]) {
      const file = path.join(dir, `config.${e}.json`);
      let cfg: any;
      try {
        cfg = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        continue; // Absent on hosted deploys — local-dev flow only.
      }
      if (`${cfg.repoOwner}/${cfg.repoName}`.toLowerCase() !== repo.toLowerCase()) continue;
      const d = diffMappings(cfg.contributorMapping ?? {}, mapping);
      cfg.contributorMapping = mapping;
      fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
      console.log(
        `mapping refresh [${e}] +${d.added.length} -${d.removed.length} ~${d.changed.length} (redeploy workflow for TEE pickup)`,
      );
    }
  } catch (err) {
    console.log("mapping refresh failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/// Fire-and-forget trigger for the keeper verify pass (Block 05).
/// Never throws — webhook delivery must not depend on keeper availability.
function triggerScorer(repo: string) {
  const appUrl = process.env.APP_URL;
  const secret = process.env.KEEPER_CRON_SECRET;
  if (!appUrl || !secret) {
    console.log("scorer trigger skipped (APP_URL/KEEPER_CRON_SECRET unset)");
    return;
  }
  fetch(`${appUrl}/api/scorer/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "x-flint-scorer": "1",
    },
    body: JSON.stringify({ repo }),
  }).catch((err) => console.error("scorer trigger failed:", err));
}

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
      // Live beat 2: grant boards re-pull — opened/labeled/assigned flow in
      // with no reload. Closed still triggers the keeper below as well.
      if (hasFlint) {
        emitLive(repo, "grants");
      }
      if (
        action === "edited" ||
        action === "labeled" ||
        (action === "closed" && issue.state_reason !== "not_planned")
      ) {
        triggerKeeper({ reason: `issue-${action}`, repo, issue: issue.number });
      }
    }

    if (event === "push") {
      const ref = typeof body.ref === "string" ? body.ref : "";
      const touched = touchesContributorsMd(body);
      console.log(`Push ${ref} contributors_md=${touched} repo=${repo}`);
      if (touched) {
        // Live beat 1: clients re-resolve identity for this repo, no reload.
        emitLive(repo, "identity");
        // Eligibility sync: regen CRE mapping so the next TEE run scores
        // exactly the listed wallets. Fire-and-forget; never blocks the 200.
        void refreshMappingForRepo(
          repo,
          typeof body.after === "string" ? body.after : undefined,
        );
        // Score mapped wallets from PRs / commits / issues as soon as
        // CONTRIBUTORS.md lands — do not wait for the next merged PR.
        triggerScorer(repo);
      }
    }

    if (event === "pull_request" && body.pull_request) {
      const pr = body.pull_request;
      if (action === "closed" && pr.merged === true) {
        const targets = linkedIssuesFromPR(pr.body);
        console.log(`PR #${pr.number} merged, links issues ${targets.join(",")} repo=${repo}`);
        triggerScorer(repo);
        triggerKeeper({ reason: "pr-merged", repo, pr: pr.number, issues: targets });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("webhook handler error:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
