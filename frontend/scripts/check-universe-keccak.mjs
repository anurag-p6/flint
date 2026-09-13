// Verifies the repoId derivations lib/universe.ts depends on against LIVE Studio data.
//   pool:  keccak256(encodePacked(["string"], ["owner/repo"]))
//   grant: keccak256(encodePacked(["string", "uint256"], ["grant", grantId]))
// Usage: node scripts/check-universe-keccak.mjs [--repo owner/repo] [--grant-max 20]
// Fails non-zero on any mismatch. Every grant receipt must equal keccak("grant", N)
// for some N in 0..grant-max; --repo (if given) must appear among pool receipts.

import { keccak256, encodePacked } from "viem";

const SUBGRAPH =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1760164/flint/0.0.1";

const args = process.argv.slice(2);
const flagVal = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const repoFlag = flagVal("--repo");
const grantMaxFlag = Number(flagVal("--grant-max") ?? 20);

const poolRepoId = (slug) => keccak256(encodePacked(["string"], [slug])).toLowerCase();
const grantHash = (n) => keccak256(encodePacked(["string", "uint256"], ["grant", BigInt(n)])).toLowerCase();

const res = await fetch(SUBGRAPH, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "{ receipts(first: 500) { repoId mode } }" }),
});
if (!res.ok) throw new Error(`studio-http-${res.status}`);
const { data, errors } = await res.json();
if (errors?.length) throw new Error(errors[0].message);

const receipts = data.receipts ?? [];
const grantReceipts = receipts.filter((r) => r.mode === "grant");
const poolReceipts = receipts.filter((r) => r.mode !== "grant");
const failures = [];

// 1. Every grant receipt must match keccak("grant", N) for N in range.
const grantHashes = new Map();
for (let n = 0; n <= grantMaxFlag; n++) grantHashes.set(grantHash(n), n);
for (const r of grantReceipts) {
  if (!grantHashes.has(r.repoId.toLowerCase())) {
    failures.push(`grant receipt repoId ${r.repoId} matches no keccak("grant", N<=${grantMaxFlag})`);
  }
}

// 2. --repo slug must resolve into the pool set (when provided).
if (repoFlag) {
  const want = poolRepoId(repoFlag);
  const have = new Set(poolReceipts.map((r) => r.repoId.toLowerCase()));
  if (!have.has(want)) {
    failures.push(`repo ${repoFlag} -> ${want} not found among ${have.size} pool receipt repoIds`);
  } else {
    console.log(`ok: ${repoFlag} -> ${want}`);
  }
}

console.log(
  `receipts=${receipts.length} grant=${grantReceipts.length} pool=${poolReceipts.length} ` +
    `grant-hashes-checked=0..${grantMaxFlag}`,
);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log("keccak vectors OK");
