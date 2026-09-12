import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { parseContributorsMd } from "../../github/contributors-md/route";
import { avatarFor } from "@/lib/identity-resolve";

// GET /api/identity/batch?wallets=0x..,0x..&repos=owner/repo,owner2/repo2
// ONE call from the client, not N. Searches each repo's CONTRIBUTORS.md
// (server PAT, session fallback) and returns wallet(lower) → identity.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const pat = process.env.GITHUB_SERVER_PAT ?? (session as any)?.accessToken;
  if (!pat) {
    return NextResponse.json({ error: "No GitHub credential (GITHUB_SERVER_PAT or login)" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const wallets = (searchParams.get("wallets") ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^0x[a-f0-9]{40}$/.test(w));
  const repos = (searchParams.get("repos") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.includes("/"));

  if (wallets.length === 0) {
    return NextResponse.json({ identities: {} });
  }

  // login → wallet merged across repos, then inverted to wallet → login.
  const loginToWallet = new Map<string, string>();
  await Promise.all(
    repos.slice(0, 10).map(async (repo) => {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/CONTRIBUTORS.md`, {
          headers: {
            Authorization: `token ${pat}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Flint",
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        const mapping = parseContributorsMd(Buffer.from(data.content, "base64").toString("utf-8"));
        for (const [login, wallet] of Object.entries(mapping)) {
          if (!loginToWallet.has(login)) loginToWallet.set(login, (wallet as string).toLowerCase());
        }
      } catch {
        // Missing file or rate limit — that repo contributes nothing.
      }
    }),
  );

  const walletToLogin = new Map<string, string>();
  for (const [login, wallet] of loginToWallet) {
    if (!walletToLogin.has(wallet)) walletToLogin.set(wallet, login);
  }

  const identities: Record<string, { login: string | null; avatarUrl: string | null }> = {};
  for (const w of wallets) {
    const login = walletToLogin.get(w) ?? null;
    identities[w] = login ? { login, avatarUrl: avatarFor(login) } : { login: null, avatarUrl: null };
  }

  return NextResponse.json({ identities });
}
