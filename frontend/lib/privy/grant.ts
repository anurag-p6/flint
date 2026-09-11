import { encodeFunctionData, type Hex } from "viem";
import grantAbi from "@/lib/abi/FlintGrant.json";
import { addresses } from "@/lib/contracts";
import type { PrivyEip1193Provider } from "./tokens";

export { privyPersonalSign, privySendTransaction } from "./tokens";
export type { PrivyEip1193Provider } from "./tokens";

/// Encodes releaseTranche(grantId, milestoneId, signature) — the calldata the
/// maintainer's wallet sends after signing the milestone approval hash.
/// Mirrors encodeApproveAndPayout in ./tokens for the escrow path.
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

export const GRANT_ADDRESS = addresses.grant as Hex;
