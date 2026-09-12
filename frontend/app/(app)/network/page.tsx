"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UniverseCanvas, type VisibleKinds } from "@/components/universe/UniverseCanvas";
import { UniverseToolbar } from "@/components/universe/UniverseToolbar";
import { NodePanel } from "@/components/universe/NodePanel";
import { invalidateIdentities, resolveLogins, type ResolvedIdentity } from "@/lib/identity-resolve";
import {
  buildUniverse,
  fetchUniverseFeed,
  grantRepoId,
  makeHubResolver,
  poolRepoId,
  type UniverseContributor,
  type UniverseReceipt,
} from "@/lib/universe";
import { useGitHubStore } from "@/lib/github-store";
import { RepoSwitcher } from "@/components/repo-switcher";
import type { FundedGrant } from "@/app/api/grants/pending/route";

export default function NetworkPage() {
  const { repo: connectedRepo } = useGitHubStore();
  const [receipts, setReceipts] = useState<UniverseReceipt[]>([]);
  const [contributors, setContributors] = useState<UniverseContributor[]>([]);
  const [grantTitles, setGrantTitles] = useState<Record<number, string>>({});
  const [knownLogins, setKnownLogins] = useState<Record<string, string>>({});
  const [fundedGrantIds, setFundedGrantIds] = useState<number[]>([]);
  const [identities, setIdentities] = useState<Record<string, ResolvedIdentity>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState<VisibleKinds>({ people: true, repos: true, grants: true });
  const [physicsOn, setPhysicsOn] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      // No repo selected → no universe. Same rule as dashboard + grants.
      if (!connectedRepo) {
        setReceipts([]);
        setContributors([]);
        setGrantTitles({});
        setKnownLogins({});
        setFundedGrantIds([]);
        setIdentities({});
        setLoading(false);
        setRefreshing(false);
        return;
      }
      try {
        const feed = await fetchUniverseFeed();

        // Funded grants of THIS repo: titles + grantee seeding + scope.
        const titles: Record<number, string> = {};
        const known: Record<string, string> = {};
        const grantIds: number[] = [];
        try {
          const res = await fetch(`/api/grants/pending?repo=${encodeURIComponent(connectedRepo)}`);
          if (res.ok) {
            const data = (await res.json()) as { funded?: FundedGrant[] };
            for (const g of data.funded ?? []) {
              titles[g.grantId] = g.title?.trim() ? g.title : `Grant #${g.grantId}`;
              grantIds.push(g.grantId);
              if (g.grantee && g.granteeWallet) known[g.granteeWallet.toLowerCase()] = g.grantee;
            }
          }
        } catch {
          // Titles stay fallback; grantees resolve via batch.
        }
        setGrantTitles(titles);
        setKnownLogins(known);
        setFundedGrantIds(grantIds);

        // Strict repo scope: this repo's pool hub + this repo's grant hubs only.
        const allowed = new Set<string>([poolRepoId(connectedRepo).toLowerCase()]);
        for (const n of grantIds) allowed.add(grantRepoId(n).toLowerCase());
        const scopedReceipts = feed.receipts.filter((r) => allowed.has(r.repoId));
        const members = new Set(scopedReceipts.map((r) => r.contributor));
        // Aggregates stay global (Flint Score is portable), but only members get nodes.
        const scopedContributors = feed.contributors.filter((c) => members.has(c.id.toLowerCase()));
        setReceipts(scopedReceipts);
        setContributors(scopedContributors);

        const ids = await resolveLogins([...members], { known, repos: [connectedRepo] });
        setIdentities(ids);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load universe");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [connectedRepo],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Live identity: push → SSE → re-resolve, no reload. 3-strike SSE fallback
  // to 30s polling (covers multi-instance hosts where the in-memory bus
  // can't reach every client).
  const liveState = useRef({ repo: "", wallets: [] as string[], known: {} as Record<string, string> });
  liveState.current = {
    repo: connectedRepo ?? "",
    wallets: [...new Set(receipts.map((r) => r.contributor))],
    known: knownLogins,
  };

  const refreshIdentities = useCallback(async () => {
    const { repo, wallets, known } = liveState.current;
    if (!repo || wallets.length === 0) return;
    invalidateIdentities();
    try {
      setIdentities(await resolveLogins(wallets, { known, repos: [repo] }));
    } catch {
      // Keep stale avatars rather than blanking the universe.
    }
  }, []);

  useEffect(() => {
    if (!connectedRepo) return;
    const repoLower = connectedRepo.toLowerCase();
    let es: EventSource | null = null;
    let fails = 0;
    let poll: ReturnType<typeof setInterval> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const startPoll = () => {
      if (poll) return;
      poll = setInterval(() => refreshIdentities(), 30000);
    };
    try {
      es = new EventSource(`/api/live/stream?repos=${encodeURIComponent(connectedRepo)}`);
      es.onmessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data) as { type?: string; repo?: string };
          if (msg.type === "identity" && (msg.repo ?? "").toLowerCase() === repoLower) {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => refreshIdentities(), 2000);
          }
        } catch {
          // Heartbeat or malformed — ignore.
        }
      };
      es.onerror = () => {
        fails += 1;
        if (fails >= 3) {
          es?.close();
          es = null;
          startPoll();
        }
      };
    } catch {
      startPoll();
    }
    const onVis = () => {
      if (document.visibilityState === "visible") refreshIdentities();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (debounce) clearTimeout(debounce);
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [connectedRepo, refreshIdentities]);

  const graph = useMemo(() => {
    const poolSlugs = connectedRepo ? [connectedRepo] : [];
    return buildUniverse(receipts, contributors, makeHubResolver({ grantIds: fundedGrantIds, grantTitles, poolSlugs }));
  }, [receipts, contributors, fundedGrantIds, grantTitles, connectedRepo]);

  const hubById = useMemo(() => new Map(graph.hubs.map((h) => [h.id, h])), [graph]);

  // Search: match + neighbors stay, rest drops out of the scene.
  const filteredGraph = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return graph;
    const matchNode = (id: string) =>
      id.includes(q) || (identities[id]?.login ?? "").toLowerCase().includes(q);
    const matchHub = (id: string) => (hubById.get(id)?.label ?? "").toLowerCase().includes(q);
    const keep = new Set<string>();
    for (const n of graph.nodes) if (matchNode(n.id)) keep.add(n.id);
    for (const h of graph.hubs) if (matchHub(h.id)) keep.add(h.id);
    for (const e of graph.edges) {
      if (keep.has(e.from)) keep.add(e.to);
      if (keep.has(e.to)) keep.add(e.from);
    }
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      hubs: graph.hubs.filter((h) => keep.has(h.id)),
      edges: graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    };
  }, [graph, query, identities, hubById]);

  const selectedNode = selectedId ? (graph.nodes.find((n) => n.id === selectedId) ?? null) : null;
  const selectedHub = !selectedNode && selectedId ? (hubById.get(selectedId) ?? null) : null;
  const panelEdges = useMemo(() => {
    if (!selectedId) return [];
    if (selectedNode) return graph.edges.filter((e) => e.from === selectedId);
    return graph.edges.filter((e) => e.to === selectedId);
  }, [graph, selectedId, selectedNode]);

  const counts = useMemo(
    () => ({
      people: graph.nodes.length,
      repos: graph.hubs.filter((h) => h.kind !== "grant").length,
      grants: graph.hubs.filter((h) => h.kind === "grant").length,
      certs: graph.edges.length,
    }),
    [graph],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <h1 className="text-[22px] font-semibold text-black">Contributor Universe</h1>
          <RepoSwitcher />
          <p className="text-[13px] text-gray-400 mt-1">
            {connectedRepo
              ? `Everyone ${connectedRepo} ever paid. Drag an avatar — every line is a soulbound certificate.`
              : "Select a repo to see its universe."}
          </p>
        </div>
      </div>

      <div className="relative border border-gray-100 rounded-md overflow-hidden bg-white h-[560px]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[13px] text-gray-400">Indexing the universe…</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[13px] text-black font-medium">Universe unavailable</p>
            <p className="text-[12px] text-gray-400 font-mono">{error}</p>
            {error === "subgraph-not-configured" ? (
              <p className="text-[12px] text-gray-400 max-w-md">
                Set <span className="font-mono">NEXT_PUBLIC_SUBGRAPH_URL</span> in{" "}
                <span className="font-mono">frontend/.env</span> to the Studio query URL, then refresh.
              </p>
            ) : null}
            <button
              onClick={() => load(true)}
              className="mt-2 px-3 py-1.5 text-[12px] font-medium text-black border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : !connectedRepo ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <p className="text-[13px] text-gray-400 max-w-sm">
              The universe follows the repo switcher — pick the repo where the Flint app is
              installed to see its members, pools, and grants.
            </p>
          </div>
        ) : filteredGraph.nodes.length === 0 && filteredGraph.hubs.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <p className="text-[13px] text-gray-400">
              {graph.edges.length === 0
                ? `No certificates for ${connectedRepo} yet — members appear here after the first payout.`
                : "No matches — clear the search."}
            </p>
          </div>
        ) : (
          <>
            <UniverseCanvas
              graph={filteredGraph}
              identities={identities}
              hoverId={hoverId}
              selectedId={selectedId}
              visible={visible}
              physicsOn={physicsOn}
              resetSignal={resetSignal}
              onHover={setHoverId}
              onSelect={setSelectedId}
            />
            <UniverseToolbar
              query={query}
              onQuery={setQuery}
              visible={visible}
              onVisible={setVisible}
              physicsOn={physicsOn}
              onPhysics={setPhysicsOn}
              onReset={() => setResetSignal((s) => s + 1)}
              onRefresh={() => load(true)}
              refreshing={refreshing}
              counts={counts}
            />
            <NodePanel
              node={selectedNode}
              hub={selectedHub}
              identity={selectedId ? identities[selectedId] : undefined}
              edges={panelEdges}
              hubById={hubById}
              onClose={() => setSelectedId(null)}
            />
          </>
        )}
      </div>
    </div>
  );
}
