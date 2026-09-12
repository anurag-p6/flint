"use client";

import { useEffect, useRef, useState } from "react";
import type { ResolvedIdentity } from "@/lib/identity-resolve";
import { shortAddress } from "@/lib/identity-resolve";
import type { UniverseEdge, UniverseHub, UniverseNode } from "@/lib/universe";

const ARCSCAN = "https://testnet.arcscan.app";

function formatUSDC(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString("en-US")}.${fracStr}` : whole.toLocaleString("en-US");
}

function formatScore(raw: bigint): string {
  return (Number(raw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** 900ms ease-out count-up; jumps to final under reduced motion. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const from = 0;
    const start = performance.now();
    const dur = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <span className="tnum">{format(shown)}</span>;
}

export function NodePanel({
  node,
  hub,
  identity,
  edges,
  hubById,
  onClose,
}: {
  node: UniverseNode | null;
  hub: UniverseHub | null;
  identity: ResolvedIdentity | undefined;
  edges: UniverseEdge[];
  hubById: Map<string, UniverseHub>;
  onClose: () => void;
}) {
  if (!node && !hub) return null;
  const isPerson = node !== null;
  const title = isPerson ? (identity?.login ?? shortAddress(node!.id)) : hub!.label;
  const subtitle = isPerson
    ? identity?.login
      ? node!.id
      : "unclaimed wallet"
    : hub!.kind === "grant"
      ? `Grant${hub!.grantId !== null ? ` #${hub!.grantId}` : ""} · milestone escrow`
      : hub!.kind === "repo"
        ? "Reward pool · open program"
        : "Unmatched pool hash";

  return (
    <aside className="absolute top-3 right-3 bottom-3 w-[300px] bg-white border border-gray-100 rounded-md shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {isPerson && identity?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.avatarUrl}
                alt=""
                width={36}
                height={36}
                className="rounded-full shrink-0"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            ) : (
              <span
                className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[13px] font-medium ${
                  hub && hub.kind === "grant" ? "bg-accent text-white" : hub ? "bg-black text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {title.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-black truncate">{title}</p>
              <p className="text-[11px] text-gray-400 truncate font-mono">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="text-gray-400 hover:text-gray-700 text-[16px] leading-none px-1"
          >
            ×
          </button>
        </div>
        {isPerson ? (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="border border-gray-100 rounded-md px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Flint Score</p>
              <p className="text-[17px] text-black font-medium mt-0.5">
                <CountUp value={Number(node!.totalScore)} format={(n) => formatScore(BigInt(Math.round(n)))} />
              </p>
            </div>
            <div className="border border-gray-100 rounded-md px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Earned</p>
              <p className="text-[17px] text-black font-medium mt-0.5 font-mono">
                <CountUp value={Number(node!.totalEarned)} format={(n) => formatUSDC(BigInt(Math.round(n)))} />
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-md px-3 py-2 mt-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total disbursed</p>
            <p className="text-[17px] text-black font-medium mt-0.5 font-mono">
              {formatUSDC(hub!.totalDisbursed)} <span className="text-[11px] text-gray-400">USDC</span>
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">
          Certificates · {edges.length}
        </p>
        {edges.map((e) => {
          const h = hubById.get(e.to);
          const other = isPerson ? (h?.label ?? e.to) : e.from;
          return (
            <a
              key={e.id}
              href={`${ARCSCAN}/tx/${e.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="block border border-gray-100 rounded-md px-3 py-2 hover:border-gray-400 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-black font-medium truncate">
                  {isPerson ? other : shortAddress(other)}
                </p>
                <p className="text-[12px] text-gray-700 font-mono shrink-0 tnum">
                  {formatUSDC(e.amount)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-[11px] text-gray-400">
                  Receipt #{e.id} · score {formatScore(e.score)} · {e.mode}
                </p>
                <p className="text-[11px] text-accent shrink-0">arcscan ↗</p>
              </div>
            </a>
          );
        })}
        {edges.length === 0 ? (
          <p className="text-[12px] text-gray-400">No certificates in this view.</p>
        ) : null}
      </div>
    </aside>
  );
}
