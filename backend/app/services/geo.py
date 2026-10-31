"""
On-land positioning helpers for Oman — SIMULATION MODE.

The GPS & Geofencing live map plots tanker positions in real-world
lat/lon. Earlier, those positions were generated as a pure random offset
in every direction from a single fixed point, with no awareness of the
coastline — which could (and did) place a simulated tanker out in the
Gulf of Oman or the Arabian Sea. This module gives the simulation engine
and the seed script a coarse, hand-traced polygon of mainland Oman (the
Musandam exclave is left out — no simulated station sits there) so every
generated or jittered position can be checked and nudged back onto land.

This is a demo-grade approximation, not a survey-grade boundary — good
enough to keep markers on Oman's landmass on the live map, nothing more.
"""
from __future__ import annotations

import random

# (lat, lon) vertices tracing Oman's coastline (Sohar -> Muscat -> Sur ->
# Ras al Hadd -> Duqm -> Salalah) and then the inland Yemen/Saudi/UAE
# border back up to Sohar, closing the polygon.
# Traced a comfortable margin seaward of the station coordinates below
# (not right on top of them), so every seeded station sits clearly
# inside this polygon rather than balanced on its edge.
OMAN_POLYGON: list[tuple[float, float]] = [
    (24.40, 56.78),  # off Sohar (coast)
    (23.65, 58.65),  # off Muscat (coast)
    (23.26, 58.91),  # Qurayyat (coast)
    (22.60, 59.60),  # off Sur (coast)
    (22.53, 59.84),  # Ras al Hadd — easternmost point of the peninsula
    (20.50, 58.80),  # coast heading south
    (19.65, 57.70),  # near Duqm (coast)
    (18.30, 56.60),  # coast heading toward Dhofar
    (16.90, 54.00),  # off Salalah (coast)
    (16.65, 53.11),  # near the Yemen border (coast)
    (17.50, 52.00),  # Yemen border, inland
    (19.00, 52.00),  # Rub' al Khali border area
    (21.00, 51.30),  # Saudi border (Empty Quarter)
    (23.00, 51.90),  # Saudi/UAE border area
    (24.20, 55.00),  # UAE border near Al Ain, back toward Sohar
]

# Real-world coordinates for the simulator's 5 seeded stations — mirrors
# frontend/src/components/gps/OmanMap.tsx's STATION_COORDS exactly, so the
# simulated routes start from the same point the map draws the station
# marker at. Stations have no lat/lon column of their own (a small, fixed
# roster), so a lookup here — same as on the frontend — is simpler than a
# schema change.
STATION_COORDS: dict[str, tuple[float, float]] = {
    "Muscat Terminal": (23.588, 58.3822),
    "Sohar Distribution Hub": (24.3473, 56.7085),
    "Nizwa Inland Depot": (22.9333, 57.5333),
    "Sur Coastal Terminal": (22.5667, 59.5289),
    "Salalah Export Terminal": (17.0151, 54.0924),
}


def is_on_land(lat: float, lon: float) -> bool:
    """Ray-casting point-in-polygon test against OMAN_POLYGON."""
    inside = False
    n = len(OMAN_POLYGON)
    j = n - 1
    for i in range(n):
        yi, xi = OMAN_POLYGON[i]
        yj, xj = OMAN_POLYGON[j]
        if (yi > lat) != (yj > lat):
            x_at_lat = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_at_lat:
                inside = not inside
        j = i
    return inside


def clamp_on_land(
    anchor_lat: float,
    anchor_lon: float,
    offset_lat: float,
    offset_lon: float,
    max_steps: int = 20,
    shrink: float = 0.8,
) -> tuple[float, float]:
    """Apply (offset_lat, offset_lon) to the anchor, shrinking it by a
    fixed factor (deterministically — no randomness consumed) until the
    resulting point lands on Oman's mainland. Used where the caller needs
    to keep an existing random-number-generator call count/position
    unchanged (so it doesn't reshuffle other seeded data derived from the
    same stream) while still guaranteeing an on-land result."""
    lat, lon = anchor_lat + offset_lat, anchor_lon + offset_lon
    for _ in range(max_steps):
        if is_on_land(lat, lon):
            return lat, lon
        offset_lat *= shrink
        offset_lon *= shrink
        lat, lon = anchor_lat + offset_lat, anchor_lon + offset_lon
    return anchor_lat, anchor_lon


def land_jitter(
    origin_lat: float,
    origin_lon: float,
    rnd: random.Random,
    max_offset: float = 0.6,
) -> tuple[float, float]:
    """A random point near (origin_lat, origin_lon) that stays on Oman's
    mainland. Shrinks the jitter radius on each retry instead of giving
    up, so it always lands close to the origin even when the origin
    itself sits right on the coast. Falls back to the origin unchanged
    if nothing on-land turns up (should only happen if the origin itself
    is off the map)."""
    for attempt in range(8):
        radius = max_offset * (0.6**attempt)
        cand_lat = origin_lat + rnd.uniform(-radius, radius)
        cand_lon = origin_lon + rnd.uniform(-radius, radius)
        if is_on_land(cand_lat, cand_lon):
            return cand_lat, cand_lon
    return origin_lat, origin_lon
