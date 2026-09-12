import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  GrantCreated,
  MilestoneVerified,
  TrancheReleased,
  TrancheAutoReleased,
  GrantCompleted,
  GrantReclaimed,
} from "../generated/FlintGrant/FlintGrant";
import { Grant, Milestone, Tranche } from "../generated/schema";
import { getOrCreateContributor } from "./utils";

function milestoneId(grantId: BigInt, milestoneIdx: BigInt): string {
  return grantId.toString() + "-" + milestoneIdx.toString();
}

function getOrCreateMilestone(
  grantId: BigInt,
  milestoneIdx: BigInt,
): Milestone {
  let id = milestoneId(grantId, milestoneIdx);
  let m = Milestone.load(id);
  if (m == null) {
    m = new Milestone(id);
    m.grant = grantId.toString();
    m.milestoneId = milestoneIdx;
    m.verified = false;
    m.verifiedAt = BigInt.zero();
    m.releasedAmount = BigInt.zero();
    m.autoReleased = false;
  }
  return m;
}

export function handleGrantCreated(event: GrantCreated): void {
  let grant = new Grant(event.params.grantId.toString());
  grant.grantor = event.params.grantor;
  let grantee = getOrCreateContributor(
    event.params.grantee,
    event.block.timestamp,
  );
  grantee.lastActiveAt = event.block.timestamp;
  grantee.save();
  grant.grantee = grantee.id;
  grant.token = event.params.token;
  grant.totalAmount = event.params.totalAmount;
  grant.milestoneCount = event.params.milestoneCount.toI32();
  grant.amountPaid = BigInt.zero();
  grant.reclaimed = BigInt.zero();
  grant.completed = false;
  grant.save();
}

export function handleMilestoneVerified(event: MilestoneVerified): void {
  let m = getOrCreateMilestone(event.params.grantId, event.params.milestoneId);
  m.verified = true;
  m.verifiedAt = event.params.verifiedAt;
  m.save();
}

function recordTranche(
  grantId: BigInt,
  milestoneIdx: BigInt,
  granteeHex: string,
  amount: BigInt,
  auto: boolean,
  txHash: string,
  logIdx: string,
  ts: BigInt,
): void {
  let grant = Grant.load(grantId.toString());
  if (grant == null) {
    return;
  }
  let tranche = new Tranche(txHash + "-" + logIdx);
  tranche.grant = grant.id;
  tranche.milestoneId = milestoneIdx;
  tranche.grantee = granteeHex;
  tranche.amount = amount;
  tranche.auto = auto;
  tranche.timestamp = ts;
  tranche.save();

  grant.amountPaid = grant.amountPaid.plus(amount);
  grant.save();

  let m = getOrCreateMilestone(grantId, milestoneIdx);
  m.releasedAmount = m.releasedAmount.plus(amount);
  if (auto) {
    m.autoReleased = true;
  }
  m.save();

  let grantee = getOrCreateContributor(
    Bytes.fromHexString(grant.grantee) as Bytes,
    ts,
  );
  grantee.lastActiveAt = ts;
  grantee.save();
}

export function handleTrancheReleased(event: TrancheReleased): void {
  recordTranche(
    event.params.grantId,
    event.params.milestoneId,
    event.params.grantee.toHexString(),
    event.params.amount,
    false,
    event.transaction.hash.toHexString(),
    event.logIndex.toString(),
    event.block.timestamp,
  );
}

export function handleTrancheAutoReleased(event: TrancheAutoReleased): void {
  // Auto-release carries no grantee param — it goes to the grant's grantee.
  let grant = Grant.load(event.params.grantId.toString());
  if (grant == null) {
    return;
  }
  recordTranche(
    event.params.grantId,
    event.params.milestoneId,
    grant.grantee,
    event.params.amount,
    true,
    event.transaction.hash.toHexString(),
    event.logIndex.toString(),
    event.block.timestamp,
  );
}

export function handleGrantCompleted(event: GrantCompleted): void {
  let grant = Grant.load(event.params.grantId.toString());
  if (grant == null) {
    return;
  }
  grant.completed = true;
  grant.save();

  let grantee = getOrCreateContributor(
    Bytes.fromHexString(grant.grantee) as Bytes,
    event.block.timestamp,
  );
  grantee.grantsCompleted += 1;
  grantee.lastActiveAt = event.block.timestamp;
  grantee.save();
}

export function handleGrantReclaimed(event: GrantReclaimed): void {
  let grant = Grant.load(event.params.grantId.toString());
  if (grant == null) {
    return;
  }
  grant.reclaimed = grant.reclaimed.plus(event.params.amount);
  grant.save();
}
