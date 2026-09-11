/// Canonical parser for the Flint grant-issue format. Imported by the
/// milestones API route, the GitHub webhook, and the keeper — do not
/// duplicate these regexes anywhere else.
///
/// Body format:
///
///   ## Milestone: Ship auth module
///   Build OAuth login. closes #12
///   release: 50%
///   deadline: 2026-10-15
///
///   ## Milestone: Security audit
///   External review.
///   release: 50%
///
///   <!-- flint
///   grantee: octocat
///   deadline: 2026-10-01
///   amount: 500
///   -->
///
/// Rules: each `## Milestone:` section is one sub-milestone; `release: X%`
/// inside the section sets its tranche (decimals allowed, must resolve to
/// integer bps). Section-level `deadline:` overrides the footer default.
/// No `## Milestone` sections → the whole issue is a single 100% milestone
/// (backward compatible with the old single-issue convention).

export interface SubMilestone {
  title: string;
  body: string;
  releaseBps: number | null;
  linkedPRs: number[];
  deadline: string | null;
}

export interface IssueSpec {
  grantee: string | null;
  deadline: string | null;
  amount: number | null;
  milestones: SubMilestone[];
  errors: string[];
}

export function parseLinkedPRs(body: string): number[] {
  // Matches "closes #123", "fixes #456", "resolves #789", or plain "#123"
  const matches = body.matchAll(/(?:closes?|fixes?|resolves?)?\s*#(\d+)/gi);
  const prs: number[] = [];
  for (const m of matches) {
    prs.push(parseInt(m[1], 10));
  }
  return [...new Set(prs)];
}

function parseReleaseBps(text: string): number | null {
  const match = text.match(/release\s*:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (!match) return null;
  const bps = parseFloat(match[1]) * 100;
  return Number.isInteger(bps) ? bps : NaN as unknown as null;
}

function parseFooter(body: string): { grantee: string | null; deadline: string | null; amount: number | null } {
  const out = { grantee: null as string | null, deadline: null as string | null, amount: null as number | null };
  const match = body.match(/<!--\s*flint([\s\S]*?)-->/i);
  if (!match) return out;
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.+?)\s*$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2];
    if (key === "grantee") out.grantee = value.replace(/^@/, "");
    else if (key === "deadline") out.deadline = value;
    else if (key === "amount") {
      const n = parseFloat(value);
      out.amount = Number.isFinite(n) ? n : null;
    }
  }
  return out;
}

function parseSectionDeadline(text: string): string | null {
  const match = text.match(/deadline\s*:\s*(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

/// YYYY-MM-DD → unix seconds, or null if not a real calendar date.
export function parseDeadline(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(dt.getTime() / 1000);
}

export function parseIssueSpec(body: string): IssueSpec {
  const errors: string[] = [];
  const footer = parseFooter(body);
  const bodyNoFooter = body.replace(/<!--\s*flint[\s\S]*?-->/i, "");

  const sectionRe = /^##\s+Milestone:\s*(.+)$/gim;
  const headers: { title: string; index: number }[] = [];
  let h: RegExpExecArray | null;
  while ((h = sectionRe.exec(bodyNoFooter)) !== null) {
    headers.push({ title: h[1].trim(), index: h.index });
  }

  const milestones: SubMilestone[] = [];
  if (headers.length === 0) {
    // Fallback: whole issue is a single milestone at 100%.
    milestones.push({
      title: "",
      body: bodyNoFooter.trim(),
      releaseBps: 10000,
      linkedPRs: parseLinkedPRs(bodyNoFooter),
      deadline: footer.deadline,
    });
  } else {
    for (let i = 0; i < headers.length; i++) {
      const start = bodyNoFooter.indexOf("\n", headers[i].index) + 1;
      const end = i + 1 < headers.length ? headers[i + 1].index : bodyNoFooter.length;
      const sectionBody = bodyNoFooter.slice(start < 0 ? headers[i].index : start, end).trim();
      const rawBps = parseReleaseBps(sectionBody);
      if (rawBps === null) {
        errors.push(`Milestone "${headers[i].title}" is missing release: X%`);
      } else if (Number.isNaN(rawBps)) {
        errors.push(`Milestone "${headers[i].title}" release % does not resolve to integer basis points`);
      }
      milestones.push({
        title: headers[i].title,
        body: sectionBody,
        releaseBps: rawBps === null || Number.isNaN(rawBps) ? null : rawBps,
        linkedPRs: parseLinkedPRs(sectionBody),
        deadline: parseSectionDeadline(sectionBody) ?? footer.deadline,
      });
    }
    const sum = milestones.reduce((a, m) => a + (m.releaseBps ?? 0), 0);
    if (milestones.every((m) => m.releaseBps !== null) && sum !== 10000) {
      errors.push(`Tranche total is ${sum / 100}% — must sum to 100%`);
    }
  }

  if (footer.deadline !== null && parseDeadline(footer.deadline) === null) {
    errors.push(`Invalid deadline "${footer.deadline}" (expected YYYY-MM-DD)`);
  }
  for (const m of milestones) {
    if (m.deadline !== null && parseDeadline(m.deadline) === null) {
      errors.push(`Milestone "${m.title}" has invalid deadline "${m.deadline}"`);
    }
  }
  if (footer.amount !== null && footer.amount <= 0) {
    errors.push(`Invalid amount "${footer.amount}"`);
  }

  return {
    grantee: footer.grantee,
    deadline: footer.deadline,
    amount: footer.amount,
    milestones,
    errors,
  };
}
