#!/usr/bin/env python3
"""
Generate Machakos-in-county GPS for MCMES projects missing coordinates.

Qualifying projects: active, no valid lat/lng, ward label matches kenya_wards
(Machakos scope) case-insensitively.

Points are sampled inside the matched ward GeoJSON polygon (with name aliases).
If a ward has no polygon, fall back to its constituency polygon, then county.

Usage (on laptop with SSH access):
  python3 scripts/generate_machakos_ward_gps.py --dry-run
  python3 scripts/generate_machakos_ward_gps.py --apply
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WARDS_GEOJSON = ROOT / "data/gis/machakos/machakos-wards.geojson"
COUNTY_GEOJSON = ROOT / "data/gis/machakos/machakos-county.geojson"
CONST_GEOJSON = ROOT / "data/gis/machakos/machakos-constituencies.geojson"

SSH_IDENTITY = Path.home() / ".ssh/id_asusme"
REMOTE = "administrator@84.247.128.58"
REMOTE_PATH = "/home/administrator/dev/machakos"

# Project/catalog ward labels → GeoJSON ward_name (uppercase IEBC style)
WARD_ALIASES = {
    "kinanie mathatani": "kinanie",
    "kinanie": "kinanie",
    "mulolongo syokimau": "syokimau mulolongo",
    "syokimau mulolongo": "syokimau mulolongo",
    "muvuti kiima kimwe": "muvuti kiima kimwe",
    "mwala makutano": "makutano mwala",
    "makutano mwala": "makutano mwala",
    "masii vyulya": "masii",
    "masii": "masii",
    "mutituni ngelani": "mutituni",
    "mutituni": "mutituni",
    "muthetheni miu": "muthetheni",
    "muthetheni": "muthetheni",
    "mbiuni kathama": "mbiuni",
    "mbiuni": "mbiuni",
    "wamunyu yathui": "wamunyu",
    "wamunyu": "wamunyu",
    "upper kaewa": "upper kaewa iveti",
    "upper kaewa iveti": "upper kaewa iveti",
    "lower kaewa": "lower kaewa kaani",
    "lower kaewa kaani": "lower kaewa kaani",
    "mumbuni": "mumbuni north",
    "masinga": "masinga central",
    "masinga central": "masinga central",
    "kola": "kola",
    "kalama": "kalama",
}


def norm(value: str) -> str:
    s = (value or "").lower().replace("&", " and ")
    s = s.replace("/", " ").replace("-", " ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def ssh_psql_file(local_sql: Path, *, tuples_only: bool = False) -> str:
    remote_sql = f"/tmp/{local_sql.name}"
    subprocess.run(
        [
            "scp",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-i",
            str(SSH_IDENTITY),
            str(local_sql),
            f"{REMOTE}:{remote_sql}",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    psql_flags = "-v ON_ERROR_STOP=1"
    if tuples_only:
        psql_flags += " -At -F $'\\t'"
    remote_cmd = (
        f"cd {REMOTE_PATH} && set -a && "
        f"source <(grep -E '^(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)=' api/.env) && "
        f"set +a && export PGPASSWORD=\"$DB_PASSWORD\" && "
        f"psql -h \"$DB_HOST\" -p \"${{DB_PORT:-5432}}\" -U \"$DB_USER\" -d \"$DB_NAME\" "
        f"{psql_flags} -f {remote_sql}"
    )
    result = subprocess.run(
        [
            "ssh",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-i",
            str(SSH_IDENTITY),
            REMOTE,
            remote_cmd,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return (result.stdout or "") + (result.stderr or "")


def point_in_ring(lat: float, lng: float, ring: list[tuple[float, float]]) -> bool:
    # ring as (lng, lat)
    inside = False
    n = len(ring)
    if n < 3:
        return False
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        yi, yj = y1, y2
        xi, xj = x1, x2
        intersect = ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) + 1e-18) + xi
        )
        if intersect:
            inside = not inside
    return inside


def geometry_rings(geometry: dict) -> list[list[tuple[float, float]]]:
    if not geometry:
        return []
    gtype = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if gtype == "Polygon":
        return [[(float(x), float(y)) for x, y in ring] for ring in coords]
    if gtype == "MultiPolygon":
        rings = []
        for polygon in coords:
            for ring in polygon:
                rings.append([(float(x), float(y)) for x, y in ring])
        return rings
    return []


def geometry_bbox(rings: list[list[tuple[float, float]]]):
    xs, ys = [], []
    for ring in rings:
        for x, y in ring:
            xs.append(x)
            ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def point_in_geometry(lat: float, lng: float, rings: list[list[tuple[float, float]]]) -> bool:
    if not rings:
        return False
    # First ring of each polygon is exterior; for MultiPolygon we treat each exterior independently.
    # For simplicity: true if inside any ring with positive area orientation heuristic — use odd/even on all exteriors.
    # Our GeoJSON wards are typically single Polygon; check all rings as exteriors (holes rare for wards).
    return any(point_in_ring(lat, lng, ring) for ring in rings)


def random_point_in_rings(rings: list[list[tuple[float, float]]], rng: random.Random, attempts: int = 400):
    bbox = geometry_bbox(rings)
    if not bbox:
        return None
    min_lng, min_lat, max_lng, max_lat = bbox
    for _ in range(attempts):
        lat = rng.uniform(min_lat, max_lat)
        lng = rng.uniform(min_lng, max_lng)
        if point_in_geometry(lat, lng, rings):
            return round(lat, 6), round(lng, 6)
    # fallback: centroid-ish average of first ring
    ring = max(rings, key=len)
    lng = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    # slight jitter still inside bbox
    for _ in range(80):
        jlat = lat + rng.uniform(-0.002, 0.002)
        jlng = lng + rng.uniform(-0.002, 0.002)
        if point_in_geometry(jlat, jlng, rings):
            return round(jlat, 6), round(jlng, 6)
    return round(lat, 6), round(lng, 6)


def load_geo_index():
    wards = json.loads(WARDS_GEOJSON.read_text())
    consts = json.loads(CONST_GEOJSON.read_text())
    county = json.loads(COUNTY_GEOJSON.read_text())

    ward_by_norm = {}
    ward_to_const = {}
    for feature in wards.get("features") or []:
        props = feature.get("properties") or {}
        name = props.get("ward_name") or props.get("COUNTY_A_1") or ""
        const = props.get("constituency_name") or props.get("CONSTITUEN") or ""
        key = norm(name)
        if not key:
            continue
        rings = geometry_rings(feature.get("geometry") or {})
        if not rings:
            continue
        ward_by_norm[key] = {"label": name, "const": const, "rings": rings}
        ward_to_const[key] = norm(const)

    const_by_norm = {}
    for feature in consts.get("features") or []:
        props = feature.get("properties") or {}
        name = props.get("constituency_name") or props.get("CONSTITUEN") or ""
        key = norm(name)
        rings = geometry_rings(feature.get("geometry") or {})
        if key and rings:
            const_by_norm[key] = {"label": name, "rings": rings}

    county_rings = []
    for feature in county.get("features") or []:
        county_rings.extend(geometry_rings(feature.get("geometry") or {}))

    return ward_by_norm, const_by_norm, county_rings


def resolve_ward_key(ward_label: str) -> str | None:
    key = norm(ward_label)
    if not key:
        return None
    if "," in (ward_label or ""):
        key = norm(ward_label.split(",")[0])
    return WARD_ALIASES.get(key, key)


def fetch_qualifying_projects() -> list[dict]:
    sql_path = ROOT / "scripts/tmp_fetch_qualifying_gps_projects.sql"
    sql_path.write_text(
        """
SELECT p.project_id::text,
       COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), ''),
       COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), ''),
       COALESCE(NULLIF(TRIM(p.location->>'constituency'), ''), '')
FROM projects p
WHERE COALESCE(p.voided, false) = false
  AND (
    NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lat','')), '') IS NULL
    OR NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lng','')), '') IS NULL
    OR NOT (
      NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lat','')), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      AND NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lng','')), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    )
  )
  AND NULLIF(TRIM(COALESCE(p.location->>'ward','')), '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM kenya_wards kw
    WHERE COALESCE(kw.voided, false) = false
      AND (kw.county ILIKE '%machakos%' OR kw.district ILIKE '%machakos%')
      AND NULLIF(TRIM(kw.iebc_ward_name), '') IS NOT NULL
      AND lower(TRIM(kw.iebc_ward_name)) NOT IN ('all_wards')
      AND lower(TRIM(kw.iebc_ward_name)) = lower(TRIM(p.location->>'ward'))
  )
ORDER BY p.project_id;
"""
    )
    out = ssh_psql_file(sql_path, tuples_only=True)
    rows = []
    for line in out.splitlines():
        if not line.strip() or line.startswith("psql:"):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        try:
            project_id = int(parts[0])
        except ValueError:
            continue
        rows.append(
            {
                "project_id": project_id,
                "ward": parts[1],
                "subcounty": parts[2],
                "constituency": parts[3],
            }
        )
    return rows


def build_updates(projects, ward_by_norm, const_by_norm, county_rings, seed: int = 20260813):
    rng = random.Random(seed)
    updates = []
    stats = {
        "ward_polygon": 0,
        "constituency_fallback": 0,
        "county_fallback": 0,
        "failed": 0,
        "unmatched_ward_labels": {},
    }

    for project in projects:
        ward_key = resolve_ward_key(project["ward"])
        source = None
        rings = None
        matched_label = None

        ward_hit = ward_by_norm.get(ward_key) if ward_key else None
        if ward_hit:
            rings = ward_hit["rings"]
            matched_label = ward_hit["label"]
            source = "ward"
        else:
            # constituency / subcounty fallback for catalog wards with odd geo names
            for candidate in (project["constituency"], project["subcounty"]):
                ckey = norm(candidate)
                # Machakos town constituency naming
                if ckey == "machakos":
                    ckey = "machakos town"
                if ckey in const_by_norm:
                    rings = const_by_norm[ckey]["rings"]
                    matched_label = const_by_norm[ckey]["label"]
                    source = "constituency"
                    break
            if not rings and county_rings:
                rings = county_rings
                matched_label = "MACHAKOS"
                source = "county"

        if not rings:
            stats["failed"] += 1
            stats["unmatched_ward_labels"][project["ward"]] = (
                stats["unmatched_ward_labels"].get(project["ward"], 0) + 1
            )
            continue

        point = random_point_in_rings(rings, rng)
        if not point:
            stats["failed"] += 1
            continue
        lat, lng = point
        updates.append(
            {
                "project_id": project["project_id"],
                "lat": lat,
                "lng": lng,
                "ward": project["ward"],
                "source": source,
                "matched_label": matched_label,
            }
        )
        stats[f"{source}_polygon" if source == "ward" else f"{source}_fallback"] = (
            stats.get(f"{source}_polygon" if source == "ward" else f"{source}_fallback", 0) + 1
        )

    return updates, stats


def write_apply_sql(updates: list[dict], path: Path) -> None:
    lines = [
        "BEGIN;",
        "CREATE TEMP TABLE _gps_fill (",
        "  project_id integer PRIMARY KEY,",
        "  lat numeric NOT NULL,",
        "  lng numeric NOT NULL",
        ") ON COMMIT DROP;",
    ]
    batch_size = 200
    for i in range(0, len(updates), batch_size):
        chunk = updates[i : i + batch_size]
        values = ",\n".join(f"({u['project_id']}, {u['lat']}, {u['lng']})" for u in chunk)
        lines.append(f"INSERT INTO _gps_fill (project_id, lat, lng) VALUES\n{values};")
    lines.append(
        """
UPDATE projects p
SET
  location = jsonb_set(
    COALESCE(p.location, '{}'::jsonb),
    '{geocoordinates}',
    jsonb_build_object('lat', f.lat, 'lng', f.lng),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
FROM _gps_fill f
WHERE p.project_id = f.project_id
  AND COALESCE(p.voided, false) = false
  AND (
    NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lat','')), '') IS NULL
    OR NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lng','')), '') IS NULL
    OR NOT (
      NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lat','')), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      AND NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lng','')), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    )
  );
"""
    )
    lines.append(
        """
SELECT
  (SELECT COUNT(*) FROM _gps_fill) AS staged,
  (
    SELECT COUNT(*) FROM projects p
    WHERE COALESCE(p.voided,false)=false
      AND NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lat','')), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      AND NULLIF(TRIM(COALESCE(p.location->'geocoordinates'->>'lng','')), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      AND (p.location->'geocoordinates'->>'lat')::numeric BETWEEN -5 AND 5
      AND (p.location->'geocoordinates'->>'lng')::numeric BETWEEN 33 AND 42
  ) AS with_valid_coords_after;
"""
    )
    lines.append("COMMIT;")
    path.write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Analyze only; no DB writes")
    parser.add_argument("--apply", action="store_true", help="Write GPS to MCMES database")
    parser.add_argument("--seed", type=int, default=20260813)
    args = parser.parse_args()
    if not args.dry_run and not args.apply:
        args.dry_run = True

    print("Loading Machakos GIS polygons…")
    ward_by_norm, const_by_norm, county_rings = load_geo_index()
    print(f"  ward polygons: {len(ward_by_norm)}")
    print(f"  constituency polygons: {len(const_by_norm)}")

    print("Fetching qualifying projects from MCMES…")
    projects = fetch_qualifying_projects()
    print(f"  qualifying (missing GPS + valid Machakos ward): {len(projects)}")

    updates, stats = build_updates(projects, ward_by_norm, const_by_norm, county_rings, seed=args.seed)
    print("Placement sources:")
    for key in ("ward_polygon", "constituency_fallback", "county_fallback", "failed"):
        print(f"  {key}: {stats.get(key, 0)}")
    if stats.get("unmatched_ward_labels"):
        print("  unmatched ward labels:")
        for label, n in sorted(stats["unmatched_ward_labels"].items(), key=lambda x: -x[1])[:20]:
            print(f"    {n:4d}  {label}")

    print(f"Ready to write: {len(updates)} projects")
    if updates:
        sample = updates[:5]
        print("Sample points:")
        for u in sample:
            print(
                f"  project {u['project_id']}: ({u['lat']}, {u['lng']}) "
                f"ward={u['ward']!r} via {u['source']}→{u['matched_label']}"
            )

    out_json = ROOT / "scripts/tmp_machakos_gps_updates.json"
    out_json.write_text(json.dumps({"count": len(updates), "stats": stats, "updates": updates}, indent=2))
    print(f"Wrote {out_json}")

    if args.dry_run and not args.apply:
        print("Dry-run only. Re-run with --apply to update MCMES.")
        return

    sql_path = ROOT / "scripts/tmp_machakos_gps_apply.sql"
    write_apply_sql(updates, sql_path)
    print(f"Applying {len(updates)} updates on MCMES…")
    output = ssh_psql_file(sql_path)
    print(output)
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        print(exc.stdout or "", file=sys.stderr)
        print(exc.stderr or "", file=sys.stderr)
        raise
