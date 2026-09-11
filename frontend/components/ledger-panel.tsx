"use client"

import { useState } from "react"
import {
  useAccount,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
  useReadContract,
} from "wagmi"
import { recoverMessageAddress, type Hex } from "viem"
import { addresses, CHAIN_ID } from "@/lib/contracts"
import { formatUSDC } from "@/lib/format"
import { truncateAddress } from "@/lib/utils"
import { isWebHidSupported } from "@/lib/ledger/dmk"
import { signApprovalHash } from "@/lib/ledger/sign"
import { classifyDeviceError, isDeviceRejection } from "@/lib/ledger/errors"
import { useLedgerStore } from "@/lib/ledger/store"
import escrowAbi from "@/lib/abi/FlintEscrow.json"

// ─── Payout preview math (mirrors the on-chain policies exactly) ─────────────

function isqrt(x: bigint): bigint {
  if (x < 2n) return x
  let y = x
  let z = (x + 1n) / 2n
  while (z < y) {
    y = z
    z = (x / z + z) / 2n
  }
  return y
}

function calculatePayoutPreview(
  scores: bigint[],
  totalPool: bigint,
  useSqrt: boolean,
): bigint[] {
  const weights = useSqrt ? scores.map(isqrt) : [...scores]
  const total = weights.reduce((a, b) => a + b, 0n)
  const payouts = new Array<bigint>(scores.length).fill(0n)
  if (total === 0n) return payouts
  let distributed = 0n
  for (let i = 0; i < scores.length; i++) {
    if (i === scores.length - 1) {
      payouts[i] = totalPool - distributed // last gets remainder (no dust)
    } else {
      payouts[i] = (weights[i] * totalPool) / total
      distributed += payouts[i]
    }
  }
  return payouts
}

// ─── Connect row ─────────────────────────────────────────────────────────────

export function LedgerConnectRow() {
  const { transport, deviceAddress, status, error, errorKind, connectUsb, useCompanion, disconnect, clearError } =
    useLedgerStore()
  const { address: wagmiAddress } = useAccount()
  const [busy, setBusy] = useState(false)

  const onConnectUsb = async () => {
    setBusy(true)
    try {
      await connectUsb()
    } catch {
      // error already in store
    } finally {
      setBusy(false)
    }
  }

  if (status === "connected") {
    const label =
      transport === "usb" && deviceAddress
        ? `Ledger ${truncateAddress(deviceAddress)}`
        : wagmiAddress
          ? `Wallet ${truncateAddress(wagmiAddress)}`
          : "Connected"
    return (
      <div className="flex items-center gap-3 border border-gray-100 rounded-md px-4 py-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
        <span className="text-[12px] text-gray-700 font-mono">{label}</span>
        <span className="text-[11px] text-gray-400">
          {transport === "usb" ? "via USB" : "via wallet app"}
        </span>
        <button
          onClick={() => disconnect()}
          className="ml-auto text-[11px] text-gray-400 hover:text-red transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          onClick={onConnectUsb}
          disabled={busy || status === "connecting"}
          className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-60"
        >
          {status === "connecting" ? "Waiting for device…" : "Connect Ledger (USB)"}
        </button>
        <button
          onClick={useCompanion}
          className="px-4 py-2 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
        >
          Use wallet app
        </button>
        {!isWebHidSupported() && (
          <span className="text-[11px] text-gray-400">USB needs desktop Chrome/Edge</span>
        )}
      </div>
      {status === "error" && error && (
        <div className="flex items-center gap-2">
          <p className={`text-[12px] ${errorKind === "rejected" ? "text-amber" : "text-red"}`}>{error}</p>
          <button onClick={clearError} className="text-[11px] text-gray-400 hover:text-gray-700">
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Approve panel ───────────────────────────────────────────────────────────

export interface ApproveScore {
  contributor: string
  score: bigint
}

type ApprovePhase =
  | "idle"
  | "switching"
  | "signing"
  | "verifying"
  | "submitting"
  | "success"
  | "error"

export function LedgerApprovePanel({
  repoId,
  ledgerSigner,
  payoutPolicy,
  totalAmount,
  scores,
  usernameFor,
}: {
  repoId: Hex
  ledgerSigner: string
  payoutPolicy: string
  totalAmount: bigint
  scores: ApproveScore[]
  usernameFor: (wallet: string) => string | undefined
}) {
  const [phase, setPhase] = useState<ApprovePhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  const { address: wagmiAddress, isConnected, chainId } = useAccount()
  const { transport, sessionId } = useLedgerStore()
  const { signMessageAsync } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  const { data: approvalHash } = useReadContract({
    address: addresses.escrow as Hex,
    abi: escrowAbi,
    functionName: "computeApprovalHash",
    args: [repoId],
  })

  const useSqrt =
    payoutPolicy.toLowerCase() === addresses.sqrtPolicy.toLowerCase()
  const payouts = calculatePayoutPreview(
    scores.map((s) => s.score),
    totalAmount,
    useSqrt,
  )
  const rows = scores
    .map((s, i) => ({ ...s, payout: payouts[i] ?? 0n }))
    .filter((r) => r.payout > 0n)

  // The address that will produce the approval signature on each path.
  const signingAddress =
    transport === "usb"
      ? useLedgerStore.getState().deviceAddress
      : (wagmiAddress as string | undefined)
  const signerMatches =
    !!signingAddress &&
    signingAddress.toLowerCase() === ledgerSigner.toLowerCase()
  const hashReady = !!approvalHash

  const fail = (message: string, wasRejected = false) => {
    setError(message)
    setRejected(wasRejected)
    setPhase("error")
  }

  const onApprove = async () => {
    setError(null)
    setRejected(false)
    setTxHash(null)
    try {
      if (!hashReady) throw new Error("Approval hash not loaded yet")
      if (!isConnected) throw new Error("Connect a wallet to submit the payout transaction")

      // 1. Correct chain for submission + verification
      if (chainId !== CHAIN_ID) {
        setPhase("switching")
        await switchChainAsync({ chainId: CHAIN_ID })
      }

      // 2. Physical Ledger approval (the human gate)
      setPhase("signing")
      const hash = approvalHash as Hex
      const signature =
        transport === "usb"
          ? await signApprovalHash(sessionId!, hash)
          : await signMessageAsync({ message: { raw: hash } })

      // 3. Silent verification: signature must recover to the registered signer.
      //    Invisible unless something is wrong — no checkbox, no friction.
      setPhase("verifying")
      const recovered = await recoverMessageAddress({
        message: { raw: hash },
        signature,
      })
      if (recovered.toLowerCase() !== ledgerSigner.toLowerCase()) {
        throw new Error(
          `Signature is from ${truncateAddress(recovered)}, but the pool expects ${truncateAddress(ledgerSigner)}. Wrong Ledger device?`,
        )
      }

      // 4. Anyone can submit once the valid signature exists.
      setPhase("submitting")
      const tx = await writeContractAsync({
        address: addresses.escrow as Hex,
        abi: escrowAbi,
        functionName: "approveAndPayout",
        args: [repoId, signature],
      })
      setTxHash(tx)
      setPhase("success")
    } catch (err) {
      // Device rejection (✗ on the Ledger) is neutral, never red.
      if (isDeviceRejection(err)) {
        fail("Cancelled on the Ledger — nothing was signed.", true)
      } else {
        fail(classifyDeviceError(err))
      }
    }
  }

  const approveDisabled =
    phase === "switching" ||
    phase === "signing" ||
    phase === "verifying" ||
    phase === "submitting" ||
    !hashReady ||
    !signerMatches

  const phaseLabel =
    phase === "switching"
      ? "Switching network…"
      : phase === "signing"
        ? "Confirm on your Ledger device…"
        : phase === "verifying"
          ? "Verifying signature…"
          : phase === "submitting"
            ? "Submitting payout…"
            : "Approve with Ledger"

  return (
    <div className="border border-gray-100 rounded-md px-5 py-4 space-y-4">
      <div>
        <p className="text-[13px] text-black font-medium">
          Paying {rows.length} contributor{rows.length === 1 ? "" : "s"}
        </p>
        <div className="mt-2 space-y-1">
          {rows.map((r) => (
            <div key={r.contributor} className="flex items-center justify-between text-[13px]">
              <span className="font-mono text-gray-700">{formatUSDC(r.payout)} USDC</span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-700">
                {usernameFor(r.contributor) ?? truncateAddress(r.contributor)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 font-mono mt-2">
          Total {formatUSDC(totalAmount)} USDC · {useSqrt ? "Square root" : "Proportional"} policy
        </p>
      </div>

      {/* Signer match indicator */}
      {ledgerSigner === "0x0000000000000000000000000000000000000000" ? (
        <p className="text-[12px] text-red">No Ledger signer registered on this pool.</p>
      ) : !signingAddress ? (
        <p className="text-[12px] text-gray-400">
          {transport === "usb"
            ? "Connect your Ledger above to sign."
            : "Connect a wallet to sign and submit."}
        </p>
      ) : signerMatches ? (
        <p className="flex items-center gap-1.5 text-[12px] text-gray-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green" />
          Signing as registered Ledger {truncateAddress(ledgerSigner)}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[12px] text-amber">
          <span className="w-1.5 h-1.5 rounded-full bg-amber" />
          {truncateAddress(signingAddress)} is not the registered signer (
          {truncateAddress(ledgerSigner)}). Switch device.
        </p>
      )}

      <button
        onClick={onApprove}
        disabled={approveDisabled}
        className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {phaseLabel}
      </button>

      {phase === "error" && error && (
        <p className={`text-[12px] ${rejected ? "text-amber" : "text-red"}`}>{error}</p>
      )}
      {phase === "success" && txHash && (
        <p className="text-[12px] text-gray-700">
          Payout submitted.{" "}
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-mono"
          >
            {truncateAddress(txHash)}
          </a>
        </p>
      )}
    </div>
  )
}
