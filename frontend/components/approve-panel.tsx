"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { recoverMessageAddress, type Hex } from "viem";
import { addresses, CHAIN_ID } from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";
import { truncateAddress } from "@/lib/utils";
import { TxLink } from "@/components/tx-link";
import { calculatePayoutPreview } from "@/lib/payout";
import { policyIdFromAddress, policyLabel } from "@/lib/policy";
import { encodeApproveAndPayout, ESCROW_ADDRESS } from "@/lib/tx";
import escrowAbi from "@/lib/abi/FlintEscrow.json";

export interface ApproveScore {
  contributor: string;
  score: bigint;
}

type ApprovePhase =
  | "idle"
  | "signing"
  | "verifying"
  | "submitting"
  | "success"
  | "error";

/// Maintainer approval via connected browser wallet: decoded payout summary,
/// one-click sign of the approval hash, local verification, then payout tx.
export function ApprovePanel({
  repoId,
  signer,
  payoutPolicy,
  totalAmount,
  scores,
  usernameFor,
}: {
  repoId: Hex;
  signer: string;
  payoutPolicy: string;
  totalAmount: bigint;
  scores: ApproveScore[];
  usernameFor: (wallet: string) => string | undefined;
}) {
  const [phase, setPhase] = useState<ApprovePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const { data: approvalHash } = useReadContract({
    address: addresses.escrow as Hex,
    abi: escrowAbi,
    functionName: "computeApprovalHash",
    args: [repoId],
  });

  const policy = policyIdFromAddress(payoutPolicy);
  const payouts = calculatePayoutPreview(
    scores.map((s) => s.score),
    totalAmount,
    policy,
  );
  const rows = scores
    .map((s, i) => ({ ...s, payout: payouts[i] ?? 0n }))
    .filter((r) => r.payout > 0n);

  const signerMatches =
    !!address && address.toLowerCase() === signer.toLowerCase();
  const hashReady = !!approvalHash;

  const fail = (message: string) => {
    setError(message);
    setPhase("error");
  };

  const onApprove = async () => {
    setError(null);
    setTxHash(null);
    try {
      if (!hashReady) throw new Error("Approval hash not loaded yet");
      if (!walletClient || !address) {
        throw new Error("Connect a wallet first (top right)");
      }
      const hash = approvalHash as Hex;
      if (walletClient.chain.id !== CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: CHAIN_ID });
        } catch {
          // User may have dismissed the switch prompt; the check below still guards us.
        }
      }
      const chainId = await walletClient.getChainId();
      if (chainId !== CHAIN_ID) {
        throw new Error("Switch your wallet to Arc Testnet and retry");
      }

      // 1. One-click approval signature (wallet confirms).
      setPhase("signing");
      const signature = await walletClient.signMessage({ message: { raw: hash } });

      // 2. Silent verification — invisible unless something is wrong.
      setPhase("verifying");
      const recovered = await recoverMessageAddress({
        message: { raw: hash },
        signature,
      });
      if (recovered.toLowerCase() !== signer.toLowerCase()) {
        throw new Error(
          `Signature is from ${truncateAddress(recovered)}, but the pool expects ${truncateAddress(signer)}. Wrong wallet?`,
        );
      }

      // 3. Submit the payout from the same wallet.
      setPhase("submitting");
      const tx = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "approveAndPayout",
        args: [repoId, signature],
      });
      setTxHash(tx);
      setPhase("success");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const busy =
    phase === "signing" || phase === "verifying" || phase === "submitting";

  const payAllLabel = `Pay all ${rows.length} contributor${rows.length === 1 ? "" : "s"} · ${formatUSDC(totalAmount)} USDC`;
  const phaseLabel =
    phase === "signing"
      ? "Confirm in your wallet…"
      : phase === "verifying"
        ? "Verifying signature…"
        : phase === "submitting"
          ? "Submitting payout…"
          : payAllLabel;

  return (
    <div className="border border-border rounded-md px-5 py-4 space-y-4">
      <div>
        <p className="text-[13px] text-text-primary font-medium">
          Paying {rows.length} contributor{rows.length === 1 ? "" : "s"}
        </p>
        <div className="mt-2 space-y-1">
          {rows.map((r) => (
            <div key={r.contributor} className="flex items-center justify-between text-[13px]">
              <span className="font-mono text-text-secondary">{formatUSDC(r.payout)} USDC</span>
              <span className="text-text-muted">→</span>
              <span className="text-text-secondary">
                {usernameFor(r.contributor) ?? truncateAddress(r.contributor)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-text-muted font-mono mt-2">
          Total {formatUSDC(totalAmount)} USDC · {policyLabel(policy)} policy
        </p>
        <p className="text-[11px] text-text-muted mt-1">
          Only CONTRIBUTORS.md wallets are scored and paid — the split stays between them.
        </p>
      </div>

      {!address ? (
        <p className="flex items-center gap-1.5 text-[12px] text-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
          Wallet not connected — connect to sign this payout. No funds move until you do.
        </p>
      ) : signerMatches ? (
        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-green" />
          Signing as registered approver {truncateAddress(signer)}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[12px] text-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-amber" />
          {truncateAddress(address ?? "")} is not the registered approver (
          {truncateAddress(signer)}). Connect the maintainer wallet.
        </p>
      )}

      <button
        onClick={onApprove}
        disabled={busy || !hashReady || !signerMatches}
        className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {phaseLabel}
      </button>

      {phase === "error" && error && <p className="text-[12px] text-red">{error}</p>}
      {phase === "success" && txHash && (
        <p className="text-[12px] text-text-secondary">
          Payout submitted.{" "}
          <TxLink hash={txHash} className="text-accent hover:underline font-mono" />
        </p>
      )}
    </div>
  );
}
