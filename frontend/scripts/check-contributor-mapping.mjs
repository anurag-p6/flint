// Acceptance checks for lib/contributor-mapping.ts.
// Run: node scripts/check-contributor-mapping.mjs (Node 22+ strips types natively)
import { parseContributorsMd, diffMappings } from "../lib/contributor-mapping.ts";

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name}`); failures++; }
}

const md = [
  "| GitHub Username | Wallet Address |",
  "|-----------------|----------------|",
  "| @alice | 0x1111111111111111111111111111111111111111 |",
  "bob 0x2222222222222222222222222222222222222222",
  "carol: 0x3333333333333333333333333333333333333333",
  "| @github | 0x4444444444444444444444444444444444444444 |",
  "| @wallet | 0x5555555555555555555555555555555555555555 |",
  "no address on this line",
  "| @alice | 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA |",
].join("\n");

const m = parseContributorsMd(md);
check("table row", m.alice === "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
check("last write wins", m.alice !== "0x1111111111111111111111111111111111111111");
check("bare login", m.bob === "0x2222222222222222222222222222222222222222");
check("colon format", m.carol === "0x3333333333333333333333333333333333333333");
check("header words excluded", !("github" in m) && !("wallet" in m));
check("address-less line ignored", Object.keys(m).length === 3);

const d = diffMappings(
  { alice: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", dave: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD" },
  m,
);
check("diff added", JSON.stringify(d.added) === JSON.stringify(["bob", "carol"]));
check("diff removed", JSON.stringify(d.removed) === JSON.stringify(["dave"]));
check("diff changed empty", d.changed.length === 0);
const d2 = diffMappings({ bob: "0x0000000000000000000000000000000000000000" }, m);
check("diff changed wallet", JSON.stringify(d2.changed) === JSON.stringify(["bob"]));

process.exit(failures ? 1 : 0);
