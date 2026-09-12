import { BigInt } from "@graphprotocol/graph-ts";
import {
  PoolCreated,
  PayoutApproved,
  PayoutExecuted,
  PoolReclaimed,
  TimeoutPayoutExecuted,
} from "../generated/FlintEscrow/FlintEscrow";
import { Pool, Repository, Payout } from "../generated/schema";
import { getOrCreateContributor } from "./utils";

function getOrCreateRepository(repoHex: string): Repository {
  let repo = Repository.load(repoHex);
  if (repo == null) {
    repo = new Repository(repoHex);
    repo.totalPaid = BigInt.zero();
    repo.contributorCount = 0;
    repo.receiptCount = 0;
  }
  return repo;
}

export function handlePoolCreated(event: PoolCreated): void {
  let repoHex = event.params.repoId.toHexString();

  let pool = new Pool(repoHex);
  pool.maintainer = event.params.maintainer;
  pool.token = event.params.token;
  pool.totalAmount = event.params.amount;
  pool.mode = event.params.mode;
  pool.cycle = event.params.cycle;
  pool.status = "Active";
  pool.save();

  let repo = getOrCreateRepository(repoHex);
  repo.maintainer = event.params.maintainer;
  repo.mode = event.params.mode;
  repo.cycle = event.params.cycle;
  repo.status = "Active";
  repo.save();
}

export function handlePayoutApproved(event: PayoutApproved): void {
  let repoHex = event.params.repoId.toHexString();
  let pool = Pool.load(repoHex);
  if (pool != null) {
    pool.status = "Approved";
    pool.save();
  }
  let repo = Repository.load(repoHex);
  if (repo != null) {
    repo.status = "Approved";
    repo.save();
  }
}

export function handlePayoutExecuted(event: PayoutExecuted): void {
  let repoHex = event.params.repoId.toHexString();

  // History only — contributor totals come from ReceiptMinted (no double count).
  let payout = new Payout(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  payout.repository = repoHex;
  payout.contributor = event.params.contributor.toHexString();
  payout.cycle = event.params.cycle;
  payout.amount = event.params.amount;
  payout.timestamp = event.block.timestamp;
  payout.save();

  let contributor = getOrCreateContributor(
    event.params.contributor,
    event.block.timestamp,
  );
  contributor.lastActiveAt = event.block.timestamp;
  contributor.save();

  let repo = getOrCreateRepository(repoHex);
  repo.totalPaid = repo.totalPaid.plus(event.params.amount);
  repo.status = "Paid";
  repo.save();

  let pool = Pool.load(repoHex);
  if (pool != null) {
    pool.status = "Paid";
    pool.save();
  }
}

export function handlePoolReclaimed(event: PoolReclaimed): void {
  let repoHex = event.params.repoId.toHexString();
  let pool = Pool.load(repoHex);
  if (pool != null) {
    pool.status = "Reclaimed";
    pool.save();
  }
  let repo = Repository.load(repoHex);
  if (repo != null) {
    repo.status = "Reclaimed";
    repo.save();
  }
}

export function handleTimeoutPayoutExecuted(
  event: TimeoutPayoutExecuted,
): void {
  let repoHex = event.params.repoId.toHexString();
  let pool = Pool.load(repoHex);
  if (pool != null) {
    pool.status = "Paid";
    pool.save();
  }
  let repo = Repository.load(repoHex);
  if (repo != null) {
    repo.status = "Paid";
    repo.save();
  }
}
