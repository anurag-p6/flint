import { encodeFunctionData, type Hex } from "viem";
import escrowAbi from "@/lib/abi/FlintEscrow.json";
import grantAbi from "@/lib/abi/FlintGrant.json";
import { addresses } from "@/lib/contracts";

/// Encodes approveAndPayout(repoId, signature) for the escrow pool payout.
export function encodeApproveAndPayout(repoId: Hex, signature: Hex): Hex {
  return encodeFunctionData({
    abi: escrowAbi,
    functionName: "approveAndPayout",
    args: [repoId, signature],
  });
}

export function encodeCreatePool(
  repoId: Hex,
  token: Hex,
  amount: bigint,
  payoutPolicy: Hex,
  signer: Hex,
  mode: string,
): Hex {
  return encodeFunctionData({
    abi: escrowAbi,
    functionName: "createPool",
    args: [repoId, token, amount, payoutPolicy, signer, mode],
  });
}

/// Encodes releaseTranche(grantId, milestoneId, signature) for grant payouts.
export function encodeReleaseTranche(
  grantId: bigint,
  milestoneId: bigint,
  signature: Hex,
): Hex {
  return encodeFunctionData({
    abi: grantAbi,
    functionName: "releaseTranche",
    args: [grantId, milestoneId, signature],
  });
}

export const ESCROW_ADDRESS = addresses.escrow as Hex;
export const GRANT_ADDRESS = addresses.grant as Hex;
