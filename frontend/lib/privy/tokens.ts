import { encodeFunctionData, type Hex } from "viem";
import escrowAbi from "@/lib/abi/FlintEscrow.json";
import { CHAIN_ID, addresses } from "@/lib/contracts";

/// Minimal EIP-1193 surface we need from a Privy embedded wallet provider.
/// Kept structural (no @privy-io/react-auth import) so this module never
/// couples to SDK type changes.
export interface PrivyEip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

/// EIP-191 personal_sign of the 32-byte approval hash — exactly what
/// FlintEscrow verifies via `toEthSignedMessageHash().recover() == signer`.
export async function privyPersonalSign(
  provider: PrivyEip1193Provider,
  address: Hex,
  approvalHash: Hex,
): Promise<Hex> {
  const sig = await provider.request({
    method: "personal_sign",
    params: [approvalHash, address],
  });
  return sig as Hex;
}

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

/// Submit a pre-encoded contract call from the embedded wallet.
/// Returns the transaction hash.
export async function privySendTransaction(
  provider: PrivyEip1193Provider,
  tx: { from: Hex; to: Hex; data: Hex },
): Promise<Hex> {
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        chainId: `0x${CHAIN_ID.toString(16)}`,
      },
    ],
  });
  return hash as Hex;
}

export const ESCROW_ADDRESS = addresses.escrow as Hex;
