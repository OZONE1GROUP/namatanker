import { Routes, Route } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { RequireAuth } from "@/components/layout/RequireAuth"
import { Login } from "@/pages/Login"
import { NotFound } from "@/pages/NotFound"
import { ExecutiveOverview } from "@/pages/ExecutiveOverview"
import { Orders } from "@/pages/Orders"
import { OrderDetailPage } from "@/pages/OrderDetail"
import { Fleet } from "@/pages/Fleet"
import { TankerDetailPage } from "@/pages/TankerDetailPage"
import { Drivers } from "@/pages/Drivers"
import { Stations } from "@/pages/Stations"
import { StationDetailPage } from "@/pages/StationDetailPage"
import { AuditTrail } from "@/pages/AuditTrail"
import { LiveOperations } from "@/pages/LiveOperations"
import { InteractiveDataFlow } from "@/pages/InteractiveDataFlow"
import { TfsSimulator } from "@/pages/TfsSimulator"
import { PlcMeterSimulator } from "@/pages/PlcMeterSimulator"
import { Gps } from "@/pages/Gps"
import { Ivms } from "@/pages/Ivms"
import { Alerts } from "@/pages/Alerts"
import { EdgeGateway } from "@/pages/EdgeGateway"
import { EventsReconciliation } from "@/pages/EventsReconciliation"
import { Reports } from "@/pages/Reports"
import { Finance } from "@/pages/Finance"
import { Admin } from "@/pages/Admin"
import { PlaceholderPage } from "@/pages/PlaceholderPage"
import { NAV_ITEMS } from "@/config/navigation"

const BUILT_PATHS = new Set([
  "/",
  "/orders",
  "/fleet",
  "/drivers",
  "/stations",
  "/audit",
  "/live-operations",
  "/data-flow",
  "/tfs-simulator",
  "/plc-meter",
  "/gps",
  "/ivms",
  "/alerts",
  "/edge-gateway",
  "/events",
  "/reports",
  "/finance",
  "/admin",
])

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<ExecutiveOverview />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/fleet" element={<Fleet />} />
          <Route path="/fleet/:id" element={<TankerDetailPage />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/stations" element={<Stations />} />
          <Route path="/stations/:id" element={<StationDetailPage />} />
          <Route path="/audit" element={<AuditTrail />} />
          <Route path="/live-operations" element={<LiveOperations />} />
          <Route path="/data-flow" element={<InteractiveDataFlow />} />
          <Route path="/tfs-simulator" element={<TfsSimulator />} />
          <Route path="/plc-meter" element={<PlcMeterSimulator />} />
          <Route path="/gps" element={<Gps />} />
          <Route path="/ivms" element={<Ivms />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/edge-gateway" element={<EdgeGateway />} />
          <Route path="/events" element={<EventsReconciliation />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/admin" element={<Admin />} />
          {NAV_ITEMS.filter((n) => !BUILT_PATHS.has(n.path)).map((item) => (
            <Route key={item.path} path={item.path} element={<PlaceholderPage />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
