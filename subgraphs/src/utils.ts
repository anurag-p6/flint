import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Contributor } from "../generated/schema";

/// Load-or-create a Contributor. Aggregates accumulate ONLY in the
/// ReceiptMinted handler — every other handler just ensures existence.
export function getOrCreateContributor(addr: Bytes, ts: BigInt): Contributor {
  let id = addr.toHexString();
  let c = Contributor.load(id);
  if (c == null) {
    c = new Contributor(id);
    c.totalScore = BigInt.zero();
    c.totalEarned = BigInt.zero();
    c.receiptCount = 0;
    c.programsCompleted = 0;
    c.grantsCompleted = 0;
    c.firstSeenAt = ts;
    c.lastActiveAt = ts;
  }
  return c;
}
