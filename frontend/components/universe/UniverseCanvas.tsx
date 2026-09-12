"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceCenter,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import { drag as d3drag } from "d3-drag";
import { ContributorNode, HubNode, CertEdge } from "./UniverseNodes";
import type { ResolvedIdentity } from "@/lib/identity-resolve";
import {
  contributorRadius,
  hubRadius,
  edgeWidth,
  type UniverseGraph,
} from "@/lib/universe";

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: "person" | "repo" | "grant" | "unknown";
  r: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  id: string;
  width: number;
}

export interface VisibleKinds {
  people: boolean;
  repos: boolean;
  grants: boolean;
}

function kindVisible(kind: SimNode["kind"], v: VisibleKinds): boolean {
  if (kind === "person") return v.people;
  if (kind === "repo") return v.repos;
  if (kind === "grant") return v.grants;
  // unknown hubs follow the repo toggle
  return v.repos;
}

export function UniverseCanvas({
  graph,
  identities,
  hoverId,
  selectedId,
  visible,
  physicsOn,
  resetSignal,
  onHover,
  onSelect,
}: {
  graph: UniverseGraph;
  identities: Record<string, ResolvedIdentity>;
  hoverId: string | null;
  selectedId: string | null;
  visible: VisibleKinds;
  physicsOn: boolean;
  resetSignal: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeByIdRef = useRef(new Map<string, SimNode>());
  const nodeElsRef = useRef(new Map<string, SVGGElement>());
  const edgeElsRef = useRef(new Map<string, SVGLineElement>());
  const lastPosRef = useRef(new Map<string, { x: number; y: number }>());
  const [size, setSize] = useState({ w: 800, h: 560 });

  // ── visible scene (memo on data + filters) ──
  const scene = useMemo(() => {
    const nodes: SimNode[] = [];
    for (const n of graph.nodes) {
      const kind: SimNode["kind"] = "person";
      if (!kindVisible(kind, visible)) continue;
      nodes.push({ id: n.id, kind, r: contributorRadius(n.totalScore, graph.maxScore) });
    }
    const hubById = new Map(graph.hubs.map((h) => [h.id, h]));
    for (const h of graph.hubs) {
      const kind = h.kind as SimNode["kind"];
      if (!kindVisible(kind, visible)) continue;
      nodes.push({ id: h.id, kind, r: hubRadius(h.totalDisbursed, graph.maxDisbursed) });
    }
    const ids = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = [];
    for (const e of graph.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue;
      links.push({ source: e.from, target: e.to, id: e.id, width: edgeWidth(e.amount, graph.maxAmount) });
    }
    return { nodes, links, hubById };
  }, [graph, visible]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    };
    for (const e of graph.edges) {
      add(e.from, e.to);
      add(e.to, e.from);
    }
    return m;
  }, [graph]);

  // ── resize ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(320, rect.width), h: Math.max(360, rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── simulation lifecycle (rebuild on scene/size change) ──
  useEffect(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (!svg || !viewport) return;

    simRef.current?.stop();
    const byId = new Map<string, SimNode>();
    for (const n of scene.nodes) {
      const prev = lastPosRef.current.get(n.id);
      n.x = prev?.x ?? (Math.random() - 0.5) * 60;
      n.y = prev?.y ?? (Math.random() - 0.5) * 60;
      byId.set(n.id, n);
    }
    nodeByIdRef.current = byId;

    const sim = forceSimulation<SimNode, SimLink>(scene.nodes)
      .force("charge", forceManyBody().strength(-220))
      .force("link", forceLink<SimNode, SimLink>(scene.links).id((d) => d.id).distance(90).strength(0.6))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + 8))
      .force("center", forceCenter(0, 0))
      .alphaDecay(0.03)
      .alpha(1)
      .on("tick", () => {
        for (const n of scene.nodes) {
          const el = nodeElsRef.current.get(n.id);
          if (el && n.x !== undefined && n.y !== undefined) {
            el.setAttribute("transform", `translate(${n.x},${n.y})`);
            lastPosRef.current.set(n.id, { x: n.x, y: n.y });
          }
        }
        for (const l of scene.links) {
          const el = edgeElsRef.current.get(l.id);
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          if (el && s.x !== undefined && t.x !== undefined) {
            el.setAttribute("x1", String(s.x));
            el.setAttribute("y1", String(s.y));
            el.setAttribute("x2", String(t.x));
            el.setAttribute("y2", String(t.y));
          }
        }
      });
    if (!physicsOn) sim.stop();
    simRef.current = sim;

    // zoom
    const zoom = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        viewport.setAttribute("transform", event.transform.toString());
      });
    select(svg).call(zoom);
    select(svg).call(zoom.transform, zoomIdentity.translate(size.w / 2, size.h / 2));
    zoomRef.current = zoom;

    // drag (subject resolved from DOM since nodes are React-rendered)
    const drag = d3drag<SVGGElement, unknown>()
      .subject((event) => {
        const target = event.sourceEvent.target as Element | null;
        const g = target?.closest?.("[data-node-id]");
        const n = g && byId.get(g.getAttribute("data-node-id") ?? "");
        return (n || { x: event.x, y: event.y }) as SimNode;
      })
      .on("start", (event) => {
        if (!physicsOn) return;
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
        sim.alpha(0.6).restart();
      })
      .on("drag", (event) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on("end", (event) => {
        event.subject.fx = null;
        event.subject.fy = null;
        if (physicsOn) sim.alphaTarget(0);
      });
    select(viewport).selectAll<SVGGElement, unknown>("g.u-node").call(drag);

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, size.w, size.h]);

  // ── physics toggle ──
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (physicsOn) sim.alpha(0.5).restart();
    else sim.stop();
  }, [physicsOn]);

  // ── reset view (same behavior instance, or the zoom event never fires) ──
  useEffect(() => {
    if (resetSignal === 0) return;
    const svg = svgRef.current;
    const zoom = zoomRef.current;
    if (!svg || !zoom) return;
    select(svg).call(zoom.transform, zoomIdentity.translate(size.w / 2, size.h / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const isDim = (id: string) =>
    hoverId !== null && id !== hoverId && !neighbors.get(hoverId)?.has(id);

  const activeEdge = (from: string, to: string) =>
    hoverId !== null && (from === hoverId || to === hoverId);

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-[420px]">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block touch-none select-none"
        onClick={() => onSelect(null)}
      >
        <g ref={viewportRef}>
          <g>
            {scene.links.map((l) => {
              const s = typeof l.source === "string" ? l.source : l.source.id;
              const t = typeof l.target === "string" ? l.target : l.target.id;
              const n1 = nodeByIdRef.current.get(s);
              const n2 = nodeByIdRef.current.get(t);
              return (
                <CertEdge
                  key={l.id}
                  id={l.id}
                  x1={n1?.x ?? 0}
                  y1={n1?.y ?? 0}
                  x2={n2?.x ?? 0}
                  y2={n2?.y ?? 0}
                  width={l.width}
                  dimmed={hoverId !== null && !activeEdge(s, t)}
                  highlighted={selectedId !== null && (s === selectedId || t === selectedId)}
                  lineRef={(el) => {
                    if (el) edgeElsRef.current.set(l.id, el);
                    else edgeElsRef.current.delete(l.id);
                  }}
                />
              );
            })}
          </g>
          <g>
            {scene.nodes.map((n, i) => (
              <g
                key={n.id}
                ref={(el) => {
                  if (el) nodeElsRef.current.set(n.id, el as SVGGElement);
                  else nodeElsRef.current.delete(n.id);
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  onHover(n.id);
                }}
                onMouseLeave={() => onHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(n.id === selectedId ? null : n.id);
                }}
              >
                {n.kind === "person" ? (
                  <ContributorNode
                    id={n.id}
                    r={n.r}
                    identity={identities[n.id]}
                    dimmed={isDim(n.id)}
                    selected={selectedId === n.id}
                    bloomDelay={Math.min(i * 12, 600)}
                  />
                ) : (
                  <HubNode
                    hub={scene.hubById.get(n.id)!}
                    r={n.r}
                    dimmed={isDim(n.id)}
                    selected={selectedId === n.id}
                    bloomDelay={Math.min(i * 12, 600)}
                  />
                )}
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
