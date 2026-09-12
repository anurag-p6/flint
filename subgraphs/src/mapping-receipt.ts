import { BigInt } from "@graphprotocol/graph-ts";
import { ReceiptMinted } from "../generated/FlintReceipt/FlintReceipt";
import { Repository, RepoMembership, Receipt } from "../generated/schema";
import { getOrCreateContributor } from "./utils";

/// Sole accumulator of Contributor totals (score / earned / counts).
/// PayoutExecuted is stored as history elsewhere and never summed.
export function handleReceiptMinted(event: ReceiptMinted): void {
  let contributor = getOrCreateContributor(
    event.params.contributor,
    event.block.timestamp,
  );
  contributor.totalScore = contributor.totalScore.plus(event.params.score);
  contributor.totalEarned = contributor.totalEarned.plus(event.params.amount);
  contributor.receiptCount += 1;
  contributor.lastActiveAt = event.block.timestamp;

  // Grant receipts carry keccak("grant", grantId) as repoId — no Repository
  // entity exists for those, so they (correctly) create no membership.
  let repoHex = event.params.repoId.toHexString();
  let repo = Repository.load(repoHex);
  if (repo != null) {
    repo.receiptCount += 1;
    let membershipId = repoHex + "-" + contributor.id;
    if (RepoMembership.load(membershipId) == null) {
      let m = new RepoMembership(membershipId);
      m.repository = repoHex;
      m.contributor = contributor.id;
      m.save();
      repo.contributorCount += 1;
      contributor.programsCompleted += 1;
    }
    repo.save();
  }
  contributor.save();

  let receipt = new Receipt(event.params.tokenId.toString());
  receipt.tokenId = event.params.tokenId;
  receipt.contributor = contributor.id;
  if (repo != null) {
    receipt.repository = repoHex;
  }
  receipt.repoId = event.params.repoId;
  receipt.cycle = event.params.cycle;
  receipt.score = event.params.score;
  receipt.amount = event.params.amount;
  receipt.mode = event.params.mode;
  receipt.timestamp = event.block.timestamp;
  receipt.txHash = event.transaction.hash;
  receipt.save();
}
