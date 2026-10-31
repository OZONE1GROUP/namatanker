import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { TransitTelemetry } from "@/lib/api"

/**
 * Live map of Oman — SIMULATION MODE. Plots the stations' real-world
 * locations (fixed demo coordinates) and the currently in-transit tankers'
 * simulated GPS positions (snapshot.transit), both already expressed in
 * real lat/lon so they place correctly on an actual map of Oman. Tiles are
 * public OpenStreetMap imagery; no real fleet-tracking hardware is
 * involved — tanker positions are interpolated by the simulation engine.
 */

// Fixed demo coordinates for the simulator's 5 seeded stations (their real
// host cities in Oman). Stations have no lat/lon column of their own — the
// seeded roster is small and fixed, so a lookup here is simpler than a
// schema change for a handful of marker pins.
const STATION_COORDS: Record<string, [number, number]> = {
  "Muscat Terminal": [23.588, 58.3822],
  "Sohar Distribution Hub": [24.3473, 56.7085],
  "Nizwa Inland Depot": [22.9333, 57.5333],
  "Sur Coastal Terminal": [22.5667, 59.5289],
  "Salalah Export Terminal": [17.0151, 54.0924],
}

const OMAN_CENTER: [number, number] = [20.8, 56.6]

function stationIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:#0f9d92;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function tankerIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:#3182ce;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:12px">🚛</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export function OmanMap({ transit }: { transit: TransitTelemetry[] }) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl">
      <MapContainer center={OMAN_CENTER} zoom={6} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {Object.entries(STATION_COORDS).map(([name, pos]) => (
          <Marker key={name} position={pos} icon={stationIcon()}>
            <Popup>
              <strong>{name}</strong>
              <br />
              Loading station
            </Popup>
          </Marker>
        ))}

        {transit.map((t) => (
          <Marker key={t.order_id} position={[t.lat, t.lon]} icon={tankerIcon()}>
            <Popup>
              <strong>{t.tanker_code}</strong> · {t.order_number}
              <br />
              From {t.station_name}
              <br />
              {t.progress_pct.toFixed(0)}% complete · ETA {t.eta_minutes.toFixed(0)} min
            </Popup>
          </Marker>
        ))}

        {transit.map((t) => (
          <CircleMarker
            key={`${t.order_id}-pulse`}
            center={[t.lat, t.lon]}
            radius={16}
            pathOptions={{ color: "#3182ce", weight: 1, fillOpacity: 0.08 }}
          />
        ))}
      </MapContainer>
    </div>
  )
}
