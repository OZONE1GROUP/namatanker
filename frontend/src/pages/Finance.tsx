import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, Receipt, Loader2, ChevronLeft, ChevronRight,
} from "lucide-react"
import {
  getFinanceSummary, getCommissionReport, getTransactions,
  type FinanceSummary, type CommissionReport, type TransactionOut,
} from "@/lib/api"
import { KpiCard } from "@/components/ui/KpiCard"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge, type StatusTone } from "@/components/ui/Badge"
import { prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatOMR, formatNumber } from "@/lib/utils"

const TYPE_TONE: Record<string, StatusTone> = { inbound: "green", outbound: "blue" }

export function Finance() {
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [report, setReport] = useState<CommissionReport | null>(null)
  const [txnData, setTxnData] = useState<{ items: TransactionOut[]; total: number } | null>(null)
  const [typeFilter, setTypeFilter] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 15

  useEffect(() => {
    getFinanceSummary(days).then(setSummary)
    getCommissionReport(days).then(setReport)
  }, [days])

  useEffect(() => {
    getTransactions({ type: (typeFilter || undefined) as "inbound" | "outbound" | undefined, page, page_size: pageSize }).then(setTxnData)
  }, [typeFilter, page])

  const totalPages = txnData ? Math.max(1, Math.ceil(txnData.total / pageSize)) : 1
  const ready = summary && report

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          Revenue-share ledger — every closed order posts an inbound customer payment and an outbound station
          payout, split by the platform&apos;s configured commission percentage. SIMULATION MODE: synthetic
          transactions only, no real money moves.
        </p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
          style={{ borderColor: "var(--app-border)" }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading finance data…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label="Inbound (customer payments)"
              value={formatOMR(summary.total_inbound)}
              icon={ArrowDownCircle}
              tone="green"
            />
            <KpiCard
              label="Outbound (station payouts)"
              value={formatOMR(summary.total_outbound)}
              icon={ArrowUpCircle}
              tone="blue"
            />
            <KpiCard
              label="Platform net revenue"
              value={formatOMR(summary.platform_net_revenue)}
              icon={Wallet}
              tone="teal"
              sublabel="Commission retained"
            />
            <KpiCard
              label="Transactions"
              value={formatNumber(summary.transaction_count)}
              icon={Receipt}
              tone="grey"
              sublabel={`${formatNumber(summary.orders_with_transactions)} orders`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Commission Allocation by Station</CardTitle>
              <span className="text-xs text-(--app-text-muted)">Last {days} days</span>
            </CardHeader>
            <CardContent>
              {report.rows.length === 0 ? (
                <p className="py-4 text-center text-sm text-(--app-text-muted)">No revenue-share transactions in this period yet — close an order to post one.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                      <th className="py-2 font-medium">Station</th>
                      <th className="py-2 font-medium">Orders</th>
                      <th className="py-2 font-medium">Gross Revenue</th>
                      <th className="py-2 font-medium">Platform Commission</th>
                      <th className="py-2 font-medium">Net Payout to Station</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr
                        key={r.station_id}
                        onClick={() => navigate(`/stations/${r.station_id}`)}
                        className="cursor-pointer border-b last:border-0 hover:bg-black/[0.02]"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <td className="py-2 font-medium text-(--app-text)">{r.station_name}</td>
                        <td className="py-2 tabular-nums text-(--app-text-muted)">{r.order_count}</td>
                        <td className="py-2 tabular-nums text-(--app-text)">{formatOMR(r.gross_revenue)}</td>
                        <td className="py-2 tabular-nums text-status-amber">{formatOMR(r.commission_amount)}</td>
                        <td className="py-2 tabular-nums font-medium text-status-green">{formatOMR(r.net_payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
              <h3 className="text-sm font-semibold text-(--app-text)">Transactions</h3>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
                className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
                style={{ borderColor: "var(--app-border)" }}
              >
                <option value="">All types</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
            <div className="mt-3 overflow-x-auto">
              {!txnData ? (
                <div className="flex items-center justify-center gap-2 py-12 text-(--app-text-muted)">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                      <th className="px-4 py-2.5 font-medium">Txn #</th>
                      <th className="px-4 py-2.5 font-medium">Order</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Counterparty</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Commission</th>
                      <th className="px-4 py-2.5 font-medium">Method</th>
                      <th className="px-4 py-2.5 font-medium">Posted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txnData.items.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => t.order_id && navigate(`/orders/${t.order_id}`)}
                        className={`border-b last:border-0 hover:bg-black/[0.02] ${t.order_id ? "cursor-pointer" : ""}`}
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-(--app-text)">{t.transaction_number}</td>
                        <td className="px-4 py-2.5 text-(--app-text-muted)">{t.order_number ?? "—"}</td>
                        <td className="px-4 py-2.5"><StatusBadge tone={TYPE_TONE[t.type]} label={prettyStatus(t.type)} /></td>
                        <td className="px-4 py-2.5 text-(--app-text-muted)">{t.counterparty_name}</td>
                        <td className="px-4 py-2.5 tabular-nums font-medium text-(--app-text)">{formatOMR(t.amount)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-(--app-text-muted)">
                          {t.commission_amount != null ? `${formatOMR(t.commission_amount)} (${t.commission_pct}%)` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-(--app-text-muted)">{prettyStatus(t.payment_method)}</td>
                        <td className="px-4 py-2.5 text-(--app-text-muted)">{formatDateTime(t.created_at)}</td>
                      </tr>
                    ))}
                    {txnData.items.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-(--app-text-muted)">No transactions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {txnData && txnData.total > pageSize && (
              <div className="flex items-center justify-between px-5 py-3 text-sm text-(--app-text-muted)">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-1.5">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border p-1.5 disabled:opacity-40"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border p-1.5 disabled:opacity-40"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
