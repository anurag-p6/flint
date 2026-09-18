"use client";

import { TxLink } from "@/components/tx-link";

export type PaymentStage =
  | "signing"
  | "sending"
  | "settling"
  | "success"
  | "error";

const STEPS: { id: Exclude<PaymentStage, "error">; label: string }[] = [
  { id: "signing", label: "Confirm in wallet" },
  { id: "sending", label: "Broadcasting" },
  { id: "settling", label: "Settling on Arc" },
  { id: "success", label: "Paid" },
];

const ORDER: PaymentStage[] = ["signing", "sending", "settling", "success"];

function stepState(
  id: PaymentStage,
  current: PaymentStage,
): "done" | "active" | "todo" {
  if (current === "error") {
    const ci = ORDER.indexOf(id);
    const last = ORDER.indexOf("sending");
    if (ci < last) return "done";
    if (id === "sending" || id === "settling") return "active";
    return "todo";
  }
  const ci = ORDER.indexOf(current);
  const si = ORDER.indexOf(id);
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "todo";
}

export function PaymentProgress({
  stage,
  amountLabel,
  payeeCount,
  txHash,
  error,
  onDismiss,
}: {
  stage: PaymentStage;
  amountLabel: string;
  payeeCount: number;
  txHash?: string | null;
  error?: string | null;
  onDismiss?: () => void;
}) {
  const done = stage === "success";
  const failed = stage === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
      <div className="w-full max-w-[340px] mx-4 border border-gray-100 rounded-md bg-white px-6 py-7 shadow-[0_8px_32px_rgba(10,10,10,0.06)]">
        <div className="flex flex-col items-center text-center">
          {done ? (
            <span className="relative flex h-11 w-11 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-green/15 animate-[ping_0.8s_ease-out_1]" />
              <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-green text-white text-[18px]">
                ✓
              </span>
            </span>
          ) : failed ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red/10 text-red text-[18px]">
              ×
            </span>
          ) : (
            <span className="relative flex h-11 w-11 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-gray-100" />
              <span className="h-11 w-11 rounded-full border-[1.5px] border-gray-100 border-t-accent animate-spin" />
            </span>
          )}

          <p className="mt-4 text-[15px] font-medium text-black">
            {done
              ? "Payment complete"
              : failed
                ? "Payment failed"
                : "Processing payment"}
          </p>
          <p className="mt-1 text-[13px] text-gray-400">
            {amountLabel} USDC · {payeeCount} contributor{payeeCount === 1 ? "" : "s"}
          </p>
        </div>

        <ol className="mt-6 space-y-2.5">
          {STEPS.map((s) => {
            const state = stepState(s.id, stage);
            return (
              <li key={s.id} className="flex items-center gap-2.5">
                <span
                  className={
                    state === "done"
                      ? "w-1.5 h-1.5 rounded-full bg-green shrink-0"
                      : state === "active"
                        ? "w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse"
                        : "w-1.5 h-1.5 rounded-full bg-gray-100 shrink-0"
                  }
                />
                <span
                  className={
                    state === "todo"
                      ? "text-[12px] text-gray-400"
                      : "text-[12px] text-gray-700"
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {txHash && (
          <TxLink
            hash={txHash}
            className="mt-5 block text-center text-[11px] font-mono text-accent hover:underline"
          />
        )}

        {failed && error && (
          <p className="mt-4 text-[12px] text-red text-center">{error}</p>
        )}

        {(done || failed) && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-5 w-full px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
          >
            {done ? "Done" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}
