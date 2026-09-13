// Single source of truth: CONTRIBUTORS.md <-> contributorMapping.
// Dependency-free (no @/ imports) so node scripts can import it directly.
// Eligibility rule: a wallet is payable ONLY if listed here — the TEE scores
// exactly this set, and approveAndPayout settles exactly the submitted set.

const ETH_ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const GITHUB_LOGIN_RE = /@?([\w-]+)/;

/** Parse lines like `| @username | 0x1234… |` → { login(lower): wallet }. */
export function parseContributorsMd(content: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const address = ETH_ADDRESS_RE.exec(line)?.[0];
    if (!address) continue;
    const withoutAddress = line.replace(address, "");
    const loginMatch = GITHUB_LOGIN_RE.exec(withoutAddress);
    if (!loginMatch) continue;
    const login = loginMatch[1].toLowerCase();
    if (login && login !== "github" && login !== "wallet") {
      mapping[login] = address;
    }
  }
  return mapping;
}

/** Diff old vs new mappings for logging ({ added, removed, kept } logins). */
export function diffMappings(
  oldM: Record<string, string>,
  newM: Record<string, string>,
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [login, wallet] of Object.entries(newM)) {
    if (!(login in oldM)) added.push(login);
    else if (oldM[login].toLowerCase() !== wallet.toLowerCase()) changed.push(login);
  }
  for (const login of Object.keys(oldM)) {
    if (!(login in newM)) removed.push(login);
  }
  return { added, removed, changed };
}
