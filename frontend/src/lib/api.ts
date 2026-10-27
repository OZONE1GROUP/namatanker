/**
 * Thin fetch wrapper for the simulator backend.
 * In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.ts).
 *
 * Phase 7: every request attaches the demo-auth bearer token (if logged
 * in), and a 401 triggers a logout so a stale/expired session bounces the
 * user back to the login page instead of spinning forever. The getters are
 * imported lazily-by-call (not at module init) from lib/auth, which itself
 * imports `api` from this file — safe because neither side touches the
 * other's binding until a request actually runs.
 */
import { getAuthToken, handleUnauthorized } from "./auth"

const BASE = "/api"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { headers, ...init })

  if (res.status === 401 && path !== "/auth/login") {
    handleUnauthorized()
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(text || `Request failed: ${res.status}`, res.status)
  }
  // Some endpoints may return 204
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
}

// ---- Domain types (mirrors backend Pydantic schemas) ----

export interface DashboardKpis {
  total_orders: number
  orders_awaiting_authorization: number
  authorized_orders: number
  active_loading_operations: number
  tankers_in_transit: number
  completed_deliveries: number
  total_volume_loaded_l: number
  volume_delivered_l: number
  reconciliation_exceptions: number
  connected_stations: number
  offline_stations: number
  critical_alerts: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface StationVolume {
  station_name: string
  volume_l: number
}

export interface DailyThroughputPoint {
  date: string
  orders: number
  volume_l: number
}

export interface TankerActivityCount {
  status: string
  count: number
}

export interface ExecutiveInsight {
  id: string
  severity: "info" | "warning" | "critical"
  message: string
  entity_type: string
  entity_id: string
  entity_label: string
}

export interface DashboardResponse {
  simulation_time: string
  kpis: DashboardKpis
  orders_by_status: StatusCount[]
  volume_by_station: StationVolume[]
  daily_throughput: DailyThroughputPoint[]
  tanker_activity: TankerActivityCount[]
  insights: ExecutiveInsight[]
}

export function getDashboard(params?: { station_id?: string; days?: number }) {
  const qs = new URLSearchParams()
  if (params?.station_id) qs.set("station_id", params.station_id)
  if (params?.days) qs.set("days", String(params.days))
  const suffix = qs.toString() ? `?${qs.toString()}` : ""
  return api.get<DashboardResponse>(`/dashboard${suffix}`)
}

export interface SimulationStatus {
  simulation_time: string
  speed_multiplier: number
  is_paused: boolean
  mode: string
}

export function getSimulationStatus() {
  return api.get<SimulationStatus>("/simulation/status")
}

export interface HealthStatus {
  status: string
  mode: string
}

export function getHealth() {
  return api.get<HealthStatus>("/health")
}

// ---- Stations ----

export interface StationListItem {
  id: string
  station_code: string
  name: string
  location: string
  loading_bay_count: number
  connectivity_status: "online" | "offline" | "degraded"
  last_heartbeat: string | null
  active_orders: number
  completed_orders: number
  unresolved_exceptions: number
}

export function getStations() {
  return api.get<StationListItem[]>("/stations")
}

export interface LoadingBay {
  id: string
  bay_code: string
  status: "idle" | "occupied" | "maintenance"
  current_order_id: string | null
  current_order_number: string | null
}

export interface StationOrderSummary {
  id: string
  order_number: string
  status: string
  product: string
  tanker_code: string | null
}

export interface StationDetail {
  id: string
  station_code: string
  name: string
  location: string
  loading_bay_count: number
  connectivity_status: "online" | "offline" | "degraded"
  last_heartbeat: string | null
  edge_gateway_id: string | null
  loading_bays: LoadingBay[]
  active_orders: StationOrderSummary[]
  completed_orders_count: number
  throughput_volume_l: number
}

export function getStation(id: string) {
  return api.get<StationDetail>(`/stations/${id}`)
}

export interface StationConnectivityActionResponse {
  station_id: string
  connectivity_status: string
  message: string
}

export function disconnectStation(id: string) {
  return api.post<StationConnectivityActionResponse>(`/stations/${id}/disconnect`)
}

export function reconnectStation(id: string) {
  return api.post<StationConnectivityActionResponse>(`/stations/${id}/reconnect`)
}

// ---- Fleet: tankers + drivers ----

export interface TankerListItem {
  id: string
  tanker_code: string
  registration_number: string
  capacity_l: number
  assigned_product: string
  status: string
  gps_signal_ok: boolean
  driver_name: string | null
  current_order_number: string | null
}

export function getTankers() {
  return api.get<TankerListItem[]>("/tankers")
}

export interface RecentOrderSummary {
  id: string
  order_number: string
  status: string
  station_name: string
  created_at: string
}

export interface TankerDetail {
  id: string
  tanker_code: string
  registration_number: string
  capacity_l: number
  assigned_product: string
  status: string
  gps_signal_ok: boolean
  last_lat: number | null
  last_lon: number | null
  last_comm_at: string | null
  driver_id: string | null
  driver_name: string | null
  recent_orders: RecentOrderSummary[]
}

export function getTanker(id: string) {
  return api.get<TankerDetail>(`/tankers/${id}`)
}

export interface DriverListItem {
  id: string
  driver_code: string
  display_name: string
  duty_status: string
  qualification_status: string
  assigned_tanker_code: string | null
}

export function getDrivers() {
  return api.get<DriverListItem[]>("/drivers")
}

// ---- Customers ----

export interface Customer {
  id: string
  name: string
  customer_code: string
}

export function getCustomers() {
  return api.get<Customer[]>("/customers")
}

// ---- Orders ----

export interface OrderListItem {
  id: string
  order_number: string
  customer_name: string
  station_name: string
  product: string
  status: string
  requested_quantity_l: number
  tanker_code: string | null
  created_at: string
}

export interface OrderListResponse {
  items: OrderListItem[]
  total: number
  page: number
  page_size: number
}

export function getOrders(params: {
  status?: string
  station_id?: string
  search?: string
  page?: number
  page_size?: number
}) {
  const qs = new URLSearchParams()
  if (params.status) qs.set("status", params.status)
  if (params.station_id) qs.set("station_id", params.station_id)
  if (params.search) qs.set("search", params.search)
  qs.set("page", String(params.page ?? 1))
  qs.set("page_size", String(params.page_size ?? 25))
  return api.get<OrderListResponse>(`/orders?${qs.toString()}`)
}

export interface AuthorizationOut {
  id: string
  status: string
  max_authorized_quantity_l: number
  issuing_service: string
  correlation_id: string
  issued_at: string
  expires_at: string
  revoked_at: string | null
  verification_result: string | null
}

export interface AuditEntryOut {
  id: string
  timestamp: string
  actor: string
  action: string
  previous_state: string | null
  new_state: string | null
  reason: string | null
}

export type OrderAction =
  | "assign"
  | "authorize"
  | "reject"
  | "expire_authorization"
  | "dispatch"
  | "arrive_at_station"
  | "start_loading"
  | "complete_loading"
  | "depart_station"
  | "complete_delivery"
  | "reconcile"
  | "close"
  | "cancel"

export interface OrderDetail {
  id: string
  order_number: string
  status: string
  product: string
  customer_id: string
  customer_name: string
  station_id: string
  station_name: string
  tanker_id: string | null
  tanker_code: string | null
  driver_id: string | null
  driver_name: string | null
  loading_bay_id: string | null
  loading_bay_code: string | null
  requested_quantity_l: number
  authorized_quantity_l: number | null
  actual_loaded_quantity_l: number | null
  delivery_quantity_l: number | null
  authorization_reference: string | null
  exception_details: string | null
  created_at: string
  authorized_at: string | null
  loaded_at: string | null
  delivered_at: string | null
  authorization: AuthorizationOut | null
  audit_history: AuditEntryOut[]
  available_actions: OrderAction[]
}

export function getOrder(id: string) {
  return api.get<OrderDetail>(`/orders/${id}`)
}

export function createOrder(payload: {
  customer_id: string
  station_id: string
  product: string
  requested_quantity_l: number
}) {
  return api.post<OrderDetail>("/orders", payload)
}

export interface ActionResponse {
  order: OrderDetail
  message: string
}

export const orderActions = {
  assign: (id: string, tanker_id: string, driver_id?: string | null) =>
    api.post<ActionResponse>(`/orders/${id}/assign`, { tanker_id, driver_id }),
  authorize: (id: string) => api.post<ActionResponse>(`/orders/${id}/authorize`),
  reject: (id: string, reason: string) => api.post<ActionResponse>(`/orders/${id}/reject`, { reason }),
  expireAuthorization: (id: string) => api.post<ActionResponse>(`/orders/${id}/expire-authorization`),
  dispatch: (id: string) => api.post<ActionResponse>(`/orders/${id}/dispatch`),
  arriveAtStation: (id: string) => api.post<ActionResponse>(`/orders/${id}/arrive-at-station`),
  startLoading: (id: string, loading_bay_id: string) =>
    api.post<ActionResponse>(`/orders/${id}/start-loading`, { loading_bay_id }),
  completeLoading: (id: string, actual_loaded_quantity_l: number) =>
    api.post<ActionResponse>(`/orders/${id}/complete-loading`, { actual_loaded_quantity_l }),
  departStation: (id: string) => api.post<ActionResponse>(`/orders/${id}/depart-station`),
  completeDelivery: (id: string, delivery_quantity_l: number) =>
    api.post<ActionResponse>(`/orders/${id}/complete-delivery`, { delivery_quantity_l }),
  reconcile: (id: string) => api.post<ActionResponse>(`/orders/${id}/reconcile`),
  close: (id: string) => api.post<ActionResponse>(`/orders/${id}/close`),
  cancel: (id: string, reason: string) => api.post<ActionResponse>(`/orders/${id}/cancel`, { reason }),
}

// ---- Audit ----

export interface AuditListItem {
  id: string
  timestamp: string
  actor: string
  action: string
  entity_type: string
  entity_id: string
  previous_state: string | null
  new_state: string | null
  reason: string | null
  correlation_id: string | null
}

export interface AuditListResponse {
  items: AuditListItem[]
  total: number
  page: number
  page_size: number
}

export function getAudit(params: { entity_type?: string; entity_id?: string; page?: number; page_size?: number }) {
  const qs = new URLSearchParams()
  if (params.entity_type) qs.set("entity_type", params.entity_type)
  if (params.entity_id) qs.set("entity_id", params.entity_id)
  qs.set("page", String(params.page ?? 1))
  qs.set("page_size", String(params.page_size ?? 50))
  return api.get<AuditListResponse>(`/audit?${qs.toString()}`)
}

// ---- Live simulation (Phase 3): SSE snapshot, telemetry, simulation clock ----

export interface LoadingTelemetry {
  order_id: string
  order_number: string
  station_id: string
  station_name: string
  bay_code: string | null
  tanker_code: string | null
  product: string
  target_volume_l: number
  live_volume_l: number
  progress_pct: number
  flow_rate_l_min: number
  ready_to_complete: boolean
  station_offline: boolean
}

export interface StationConnectivity {
  station_id: string
  station_name: string
  connectivity_status: "online" | "offline" | "degraded"
  queued_event_count: number
  last_heartbeat: string | null
}

export interface TransitTelemetry {
  order_id: string
  order_number: string
  tanker_code: string | null
  station_name: string
  progress_pct: number
  lat: number
  lon: number
  eta_minutes: number
}

export interface GeofenceEvent {
  id: string
  order_number: string
  tanker_code: string | null
  kind: "exit" | "arrival"
  zone_name: string
  timestamp: string
}

export interface FlowEvent {
  id: string
  from: string
  to: string
  type: string
  label: string
  timestamp: string
}

export interface LiveSnapshot {
  simulation_time: string | null
  is_paused: boolean
  speed_multiplier: number
  loading: LoadingTelemetry[]
  transit: TransitTelemetry[]
  geofence_events: GeofenceEvent[]
  flow_events: FlowEvent[]
  stations: StationConnectivity[]
  generated_at: string | null
}

export function getLiveSnapshot() {
  return api.get<LiveSnapshot>("/live/snapshot")
}

export function pauseSimulation() {
  return api.post<{ is_paused: boolean }>("/simulation/pause")
}

export function resumeSimulation() {
  return api.post<{ is_paused: boolean }>("/simulation/resume")
}

export function setSimulationSpeed(speed_multiplier: number) {
  return api.post<{ speed_multiplier: number }>("/simulation/speed", { speed_multiplier })
}

// ---- Alerts & Exceptions ----

export interface AlertListItem {
  id: string
  severity: "info" | "warning" | "critical"
  status: "open" | "acknowledged" | "resolved" | "escalated"
  title: string
  description: string
  source: string
  related_order_id: string | null
  related_order_number: string | null
  related_station_id: string | null
  related_station_name: string | null
  recommended_action: string | null
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
}

export interface AlertListResponse {
  items: AlertListItem[]
  total: number
  page: number
  page_size: number
}

export function getAlerts(params: { status?: string; severity?: string; page?: number; page_size?: number }) {
  const qs = new URLSearchParams()
  if (params.status) qs.set("status", params.status)
  if (params.severity) qs.set("severity", params.severity)
  qs.set("page", String(params.page ?? 1))
  qs.set("page_size", String(params.page_size ?? 50))
  return api.get<AlertListResponse>(`/alerts?${qs.toString()}`)
}

export interface AlertActionResponse {
  alert: AlertListItem
  message: string
}

export const alertActions = {
  acknowledge: (id: string) => api.post<AlertActionResponse>(`/alerts/${id}/acknowledge`),
  resolve: (id: string) => api.post<AlertActionResponse>(`/alerts/${id}/resolve`),
  escalate: (id: string) => api.post<AlertActionResponse>(`/alerts/${id}/escalate`),
}

// ---- Interactive Data Flow (Phase 4) ----

export interface DataFlowNode {
  id: string
  label: string
  kind: "central" | "gateway" | "plc"
  group: string | null
  station_id: string | null
  station_name: string | null
}

export interface DataFlowEdge {
  id: string
  from: string
  to: string
  type: string
}

export interface DataFlowGraph {
  nodes: DataFlowNode[]
  edges: DataFlowEdge[]
}

export function getDataFlowGraph() {
  return api.get<DataFlowGraph>("/dataflow/graph")
}
