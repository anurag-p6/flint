"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { createPublicClient, http, recoverMessageAddress, type Hex } from "viem";
import { addresses, CHAIN_ID } from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";
import { truncateAddress } from "@/lib/utils";
import { calculatePayoutPreview } from "@/lib/payout";
import { policyIdFromAddress, policyLabel } from "@/lib/policy";
import { arcTestnet } from "@/lib/wagmi";
import { PaymentProgress, type PaymentStage } from "@/components/payment-progress";
import {
  encodeApproveAndPayout,
  privyPersonalSign,
  privySendTransaction,
  ESCROW_ADDRESS,
  type PrivyEip1193Provider,
} from "@/lib/privy/tokens";
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
  | "confirming"
  | "success"
  | "error";

function toPaymentStage(phase: ApprovePhase): PaymentStage | null {
  if (phase === "signing" || phase === "verifying") return "signing";
  if (phase === "submitting") return "sending";
  if (phase === "confirming") return "settling";
  if (phase === "success") return "success";
  if (phase === "error") return "error";
  return null;
}

/// Maintainer approval via Privy embedded wallet: decoded payout summary,
/// one-click sign of the approval hash, silent on-chain-shaped verification,
/// then the payout transaction — no checkbox, no friction.
export function PrivyApprovePanel({
  repoId,
  signer,
  payoutPolicy,
  totalAmount,
  scores,
  usernameFor,
  onPaid,
}: {
  repoId: Hex;
  signer: string;
  payoutPolicy: string;
  totalAmount: bigint;
  scores: ApproveScore[];
  usernameFor: (wallet: string) => string | undefined;
  onPaid?: (hash?: string) => void;
}) {
  const [phase, setPhase] = useState<ApprovePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const { wallets } = useWallets();
  // Embedded email wallet first, otherwise any connected external wallet
  // (e.g. MetaMask — funds stay where they are).
  const active =
    wallets.find((w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2") ??
    wallets[0];

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

  const signingAddress = active?.address;
  const signerMatches =
    !!signingAddress && signingAddress.toLowerCase() === signer.toLowerCase();
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
      if (!active) {
        throw new Error("Connect a wallet first (top right)");
      }
      const hash = approvalHash as Hex;
      const from = active.address as Hex;
      // External wallets (MetaMask) may sit on the wrong chain: nudge first,
      // then verify — the approval hash is chain-bound, so this check is load-bearing.
      try {
        await active.switchChain(CHAIN_ID);
      } catch {
        // User may have dismissed the switch prompt; the check below still guards us.
      }
      const provider = (await active.getEthereumProvider()) as unknown as PrivyEip1193Provider;
      const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
      if (Number(chainHex) !== CHAIN_ID) {
        throw new Error("Switch your wallet to Arc Testnet and retry");
      }

      // 1. One-click approval signature (embedded wallet confirms).
      setPhase("signing");
      const signature = await privyPersonalSign(provider, from, hash);

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

      // 3. Submit the payout from the same embedded wallet.
      setPhase("submitting");
      // One USDC transfer + on-chain SBT mint per payee. Wallet estimate
      // undershoots this loop and the tx reverts out of gas.
      const gas = 1_500_000n + BigInt(rows.length) * 800_000n
      const tx = await privySendTransaction(provider, {
        from,
        to: ESCROW_ADDRESS,
        data: encodeApproveAndPayout(repoId, signature),
        gas,
      });
      setTxHash(tx);
      setPhase("confirming");
      const client = createPublicClient({
        chain: arcTestnet,
        transport: http("https://rpc.testnet.arc.network"),
      });
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status === "reverted") {
        throw new Error("Payout reverted on-chain");
      }
      setPhase("success");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const busy =
    phase === "signing" ||
    phase === "verifying" ||
    phase === "submitting" ||
    phase === "confirming";
  const overlayStage = toPaymentStage(phase);

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

      {!active ? (
        <p className="text-[12px] text-text-muted">
          Connect your wallet (top right) to unlock approval.
        </p>
      ) : signerMatches ? (
        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-green" />
          Signing as registered approver {truncateAddress(signer)}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[12px] text-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-amber" />
          {truncateAddress(signingAddress ?? "")} is not the registered approver (
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

      {phase === "error" && !overlayStage && error && (
        <p className="text-[12px] text-red">{error}</p>
      )}

      {overlayStage && (
        <PaymentProgress
          stage={overlayStage}
          amountLabel={formatUSDC(totalAmount)}
          payeeCount={rows.length}
          txHash={txHash}
          error={error}
          onDismiss={() => {
            if (phase === "success") onPaid?.(txHash ?? undefined);
            else {
              setPhase("idle");
              setError(null);
            }
          }}
        />
      )}
    </div>
  );
}
