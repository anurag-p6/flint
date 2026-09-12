"use client";

import type { VisibleKinds } from "./UniverseCanvas";

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`px-2.5 py-1 text-[12px] rounded-md border transition-colors ${
        on ? "text-black border-gray-400 bg-gray-50" : "text-gray-400 border-gray-100 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

export function UniverseToolbar({
  query,
  onQuery,
  visible,
  onVisible,
  physicsOn,
  onPhysics,
  onReset,
  onRefresh,
  refreshing,
  counts,
}: {
  query: string;
  onQuery: (q: string) => void;
  visible: VisibleKinds;
  onVisible: (v: VisibleKinds) => void;
  physicsOn: boolean;
  onPhysics: (on: boolean) => void;
  onReset: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  counts: { people: number; repos: number; grants: number; certs: number };
}) {
  return (
    <div className="absolute top-3 left-3 right-3 sm:right-auto flex flex-wrap items-center gap-2 bg-white/90 backdrop-blur border border-gray-100 rounded-md px-3 py-2">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search login, address, repo…"
        className="w-44 sm:w-52 text-[13px] text-black placeholder:text-gray-400 bg-transparent outline-none border-b border-transparent focus:border-accent"
      />
      <span className="hidden sm:inline w-px h-4 bg-gray-100" />
      <Toggle label="People" on={visible.people} onClick={() => onVisible({ ...visible, people: !visible.people })} />
      <Toggle label="Repos" on={visible.repos} onClick={() => onVisible({ ...visible, repos: !visible.repos })} />
      <Toggle label="Grants" on={visible.grants} onClick={() => onVisible({ ...visible, grants: !visible.grants })} />
      <span className="hidden sm:inline w-px h-4 bg-gray-100" />
      <Toggle label={physicsOn ? "Freeze" : "Physics"} on={physicsOn} onClick={() => onPhysics(!physicsOn)} />
      <button onClick={onReset} className="px-2.5 py-1 text-[12px] text-gray-400 hover:text-gray-700 transition-colors">
        Reset view
      </button>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="px-2.5 py-1 text-[12px] font-medium text-black border border-gray-100 rounded-md hover:border-gray-400 transition-colors disabled:opacity-50"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
      <span className="text-[11px] text-gray-400 tnum ml-auto">
        {counts.people} people · {counts.repos} repos · {counts.grants} grants · {counts.certs} certs
      </span>
    </div>
  );
}
