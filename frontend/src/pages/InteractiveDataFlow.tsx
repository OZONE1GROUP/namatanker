import { useEffect, useMemo, useState } from "react"
import { Server, Router, Cpu, X } from "lucide-react"
import { getDataFlowGraph, type DataFlowGraph, type DataFlowNode, type FlowEvent } from "@/lib/api"
import { useLiveSnapshot } from "@/lib/useLiveSnapshot"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { prettyStatus } from "@/lib/orderStatus"
import { formatTime } from "@/lib/utils"

const ACTIVE_WINDOW_MS = 6000

const KIND_STYLES: Record<DataFlowNode["kind"], { icon: typeof Server; ring: string; bg: string }> = {
  central: { icon: Server, ring: "ring-teal-500", bg: "bg-status-green-bg text-status-green" },
  gateway: { icon: Router, ring: "ring-blue-500", bg: "bg-status-blue-bg text-status-blue" },
  plc: { icon: Cpu, ring: "ring-purple-500", bg: "bg-status-purple-bg text-status-purple" },
}

function NodeCard({
  node,
  selected,
  active,
  onClick,
}: {
  node: DataFlowNode
  selected: boolean
  active: boolean
  onClick: () => void
}) {
  const style = KIND_STYLES[node.kind]
  const Icon = style.icon
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? `ring-2 ${style.ring}` : ""
      }`}
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
    >
      {active && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
        </span>
      )}
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.bg}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-xs font-medium leading-tight text-(--app-text)">{node.label}</span>
    </button>
  )
}

export function InteractiveDataFlow() {
  const [graph, setGraph] = useState<DataFlowGraph | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { snapshot, connected } = useLiveSnapshot()

  useEffect(() => {
    getDataFlowGraph().then(setGraph)
  }, [])

  const flowEvents = snapshot?.flow_events ?? []

  const activeNodeIds = useMemo(() => {
    const now = Date.now()
    const set = new Set<string>()
    for (const e of flowEvents) {
      if (now - new Date(e.timestamp).getTime() < ACTIVE_WINDOW_MS) {
        set.add(e.from)
        set.add(e.to)
      }
    }
    return set
  }, [flowEvents])

  const nodesById = useMemo(() => {
    const m = new Map<string, DataFlowNode>()
    graph?.nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [graph])

  const centralNodes = graph?.nodes.filter((n) => n.kind === "central") ?? []
  const stationGroups = useMemo(() => {
    const groups = new Map<string, { stationName: string; plc?: DataFlowNode; gateway?: DataFlowNode }>()
    graph?.nodes.forEach((n) => {
      if (n.kind === "central" || !n.station_id) return
      const g = groups.get(n.station_id) ?? { stationName: n.station_name ?? "" }
      if (n.kind === "plc") g.plc = n
      if (n.kind === "gateway") g.gateway = n
      groups.set(n.station_id, g)
    })
    return Array.from(groups.values())
  }, [graph])

  const inspectorEvents: FlowEvent[] = selectedId
    ? flowEvents.filter((e) => e.from === selectedId || e.to === selectedId)
    : flowEvents

  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null

  if (!graph) {
    return <p className="py-10 text-center text-sm text-(--app-text-muted)">Loading architecture…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          Click a station, gateway, PLC/meter, or central service below to inspect the (simulated) events moving through it in real time. This diagrams the simulator's own service architecture — it is never connected to a real SCADA/PLC network.
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--app-border)" }}>
          {connected ? "Live" : "Polling"}
        </span>
      </div>

      <Card>
        <CardHeader><CardTitle>Central Services</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {centralNodes.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                selected={selectedId === n.id}
                active={activeNodeIds.has(n.id)}
                onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Field Layer — Stations</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stationGroups.map((g) => (
              <div key={g.stationName} className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--app-text-muted)">{g.stationName}</p>
                <div className="flex flex-col gap-2">
                  {g.plc && (
                    <NodeCard
                      node={g.plc}
                      selected={selectedId === g.plc.id}
                      active={activeNodeIds.has(g.plc.id)}
                      onClick={() => setSelectedId(selectedId === g.plc!.id ? null : g.plc!.id)}
                    />
                  )}
                  {g.gateway && (
                    <NodeCard
                      node={g.gateway}
                      selected={selectedId === g.gateway.id}
                      active={activeNodeIds.has(g.gateway.id)}
                      onClick={() => setSelectedId(selectedId === g.gateway!.id ? null : g.gateway!.id)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedNode ? `Events through ${selectedNode.label}` : "All Recent Events"}
          </CardTitle>
          {selectedNode && (
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-xs text-(--app-text-muted) hover:text-(--app-text)">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </CardHeader>
        <CardContent>
          {inspectorEvents.length === 0 ? (
            <p className="text-sm text-(--app-text-muted)">No events recorded yet — give the simulation engine a few seconds.</p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto">
              {[...inspectorEvents].reverse().slice(0, 50).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                  <span className="flex min-w-0 items-center gap-2 text-(--app-text)">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-(--app-text-muted)">
                      {prettyStatus(e.type)}
                    </span>
                    <span className="truncate">
                      {nodesById.get(e.from)?.label ?? e.from} → {nodesById.get(e.to)?.label ?? e.to}
                    </span>
                    <span className="truncate text-(--app-text-muted)">· {e.label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-(--app-text-muted)">{formatTime(e.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
