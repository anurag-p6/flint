"use client";

import { useState } from "react";
import type { ResolvedIdentity } from "@/lib/identity-resolve";
import { shortAddress } from "@/lib/identity-resolve";
import type { UniverseHub } from "@/lib/universe";

function initials(loginOrAddr: string): string {
  const clean = loginOrAddr.replace(/^0x/, "");
  return clean.slice(0, 2).toUpperCase();
}

export function ContributorNode({
  id,
  r,
  identity,
  dimmed,
  selected,
  bloomDelay,
}: {
  id: string;
  r: number;
  identity: ResolvedIdentity | undefined;
  dimmed: boolean;
  selected: boolean;
  bloomDelay: number;
}) {
  const [imgOk, setImgOk] = useState(true);
  const login = identity?.login ?? null;
  const label = login ?? shortAddress(id);
  const clipId = `clip-${id.slice(2, 10)}`;
  const showImg = imgOk && identity?.avatarUrl;

  return (
    <g
      className="u-node"
      data-node-id={id}
      opacity={dimmed ? 0.15 : 1}
      style={{ cursor: "grab", animationDelay: `${bloomDelay}ms` }}
    >
      <defs>
        <clipPath id={clipId}>
          <circle r={r} />
        </clipPath>
      </defs>
      {/* selection ring */}
      {selected ? <circle r={r + 4} fill="none" strokeWidth={2} className="stroke-accent" /> : null}
      {/* fallback disc + initials (always underneath) */}
      <circle r={r} className="fill-gray-100" />
      <text
        textAnchor="middle"
        dy="0.35em"
        className="fill-gray-400 select-none"
        style={{ fontSize: Math.max(10, r * 0.55) }}
      >
        {initials(label)}
      </text>
      {showImg ? (
        <image
          href={identity!.avatarUrl!}
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
          onError={() => setImgOk(false)}
        />
      ) : null}
      <title>{login ?? id}</title>
    </g>
  );
}

export function HubNode({
  hub,
  r,
  dimmed,
  selected,
  bloomDelay,
}: {
  hub: UniverseHub;
  r: number;
  dimmed: boolean;
  selected: boolean;
  bloomDelay: number;
}) {
  const isGrant = hub.kind === "grant";
  return (
    <g
      className="u-node"
      data-node-id={hub.id}
      opacity={dimmed ? 0.15 : 1}
      style={{ cursor: "grab", animationDelay: `${bloomDelay}ms` }}
    >
      {selected ? <circle r={r + 4} fill="none" strokeWidth={2} className="stroke-accent" /> : null}
      <circle
        r={r}
        className={isGrant ? "fill-accent" : hub.kind === "repo" ? "fill-black" : "fill-gray-100"}
      />
      <text
        textAnchor="middle"
        dy="0.35em"
        className={`select-none font-medium ${isGrant || hub.kind === "repo" ? "fill-white" : "fill-gray-400"}`}
        style={{ fontSize: Math.max(9, Math.min(13, r * 0.42)) }}
      >
        {hub.kind === "unknown" ? shortHashLabel(hub.label) : hubLabelShort(hub.label)}
      </text>
      <title>{hub.label}</title>
    </g>
  );
}

function hubLabelShort(label: string): string {
  // "owner/repo" → "repo"; "Grant #N" / titles → first 10 chars
  if (label.includes("/")) return label.split("/").pop()!.slice(0, 12);
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

function shortHashLabel(label: string): string {
  return label.length > 8 ? `${label.slice(0, 6)}` : label;
}

export function CertEdge({
  id,
  x1,
  y1,
  x2,
  y2,
  width,
  dimmed,
  highlighted,
  lineRef,
}: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  dimmed: boolean;
  highlighted: boolean;
  lineRef?: (el: SVGLineElement | null) => void;
}) {
  return (
    <line
      ref={lineRef}
      data-edge-id={id}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      strokeWidth={highlighted ? width + 1.5 : width}
      opacity={dimmed ? 0.08 : 0.9}
      className={highlighted ? "stroke-accent" : "stroke-gray-100"}
      style={{ transition: "opacity 150ms ease-out" }}
    >
      <title>{`Receipt #${id}`}</title>
    </line>
  );
}
