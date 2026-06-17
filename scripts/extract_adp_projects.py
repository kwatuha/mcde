#!/usr/bin/env python3
"""ADP extraction/import helper for Machakos CADP 2025/2026.

The ADP PDF tables are heavily wrapped, so this script intentionally separates
the process into two auditable steps:

1. extract-raw: produce a CSV of source text blocks from the PDF for review.
2. build-sql: convert a cleaned/reviewed CSV into an idempotent SQL seed.

The reviewed CSV should use these headers:
adp_code,adp_name,financial_year,cidp_code,sector_name,programme_name,
subprogramme_name,project_name,location_text,subcounty,ward,sublocation,
village,activity_description,estimated_cost,funding_source,timeframe,
performance_indicator,target,plan_status,implementing_agency,
cross_cutting_issues,source_pdf_page,raw_text
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
import subprocess
import unicodedata
from pathlib import Path


DEFAULT_PDF = Path("docs/otherRpts/Machakos-County-Annual-Development-Plan-2025-2026.pdf")
DEFAULT_RAW_CSV = Path("scripts/migration/data/machakos_adp_2025_2026_raw_review.csv")
DEFAULT_SQL_OUT = Path("api/migrations/20260615_seed_adp_2025_2026_projects.sql")
DEFAULT_ADP_CODE = "MACHAKOS-CADP-2025-2026"
DEFAULT_ADP_NAME = "Machakos County Annual Development Plan 2025/2026"
DEFAULT_FINANCIAL_YEAR = "2025/2026"
DEFAULT_CIDP_CODE = "MACHAKOS-CIDP-2023-2027"


REVIEW_COLUMNS = [
    "adp_code",
    "adp_name",
    "financial_year",
    "cidp_code",
    "sector_name",
    "programme_name",
    "subprogramme_name",
    "project_name",
    "location_text",
    "subcounty",
    "ward",
    "sublocation",
    "village",
    "activity_description",
    "estimated_cost",
    "funding_source",
    "timeframe",
    "performance_indicator",
    "target",
    "plan_status",
    "implementing_agency",
    "cross_cutting_issues",
    "source_pdf_page",
    "raw_text",
]


def ascii_clean(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", text).strip()


def sql_quote(value: object) -> str:
    text = ascii_clean(value)
    if text == "":
        return "NULL"
    return "'" + text.replace("'", "''") + "'"


def sql_numeric(value: object) -> str:
    text = ascii_clean(value).replace(",", "")
    if not text:
        return "NULL"
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return "NULL"
    return match.group(0)


def sql_int(value: object) -> str:
    text = ascii_clean(value)
    if not text:
        return "NULL"
    match = re.search(r"\d+", text)
    return match.group(0) if match else "NULL"


def normalized_key(row: dict[str, str]) -> str:
    # Keep this key stable when reviewed rows improve programme labels later.
    # Programme/subprogramme names are metadata around the planned project, not
    # the identity of the planned project itself.
    source = "|".join(
        ascii_clean(row.get(key, "")).lower()
        for key in ["adp_code", "sector_name", "project_name", "location_text", "source_pdf_page"]
    )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def run_pdftotext(pdf_path: Path, page: int) -> str:
    return subprocess.check_output(
        ["pdftotext", "-f", str(page), "-l", str(page), "-layout", str(pdf_path), "-"],
        text=True,
        errors="replace",
    )


def extract_raw(args: argparse.Namespace) -> None:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["source_pdf_page", "line_no", "raw_text"])
        writer.writeheader()
        for page in range(args.start_page, args.end_page + 1):
            text = run_pdftotext(args.pdf, page)
            for index, line in enumerate(text.splitlines(), start=1):
                cleaned = ascii_clean(line)
                if not cleaned:
                    continue
                writer.writerow({
                    "source_pdf_page": page,
                    "line_no": index,
                    "raw_text": cleaned,
                })
    print(f"Wrote raw ADP review CSV: {args.output}")


def read_review_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        rows = []
        for row in reader:
            project_name = ascii_clean(row.get("project_name"))
            if not project_name:
                continue
            next_row = {column: ascii_clean(row.get(column)) for column in REVIEW_COLUMNS}
            next_row["adp_code"] = next_row["adp_code"] or DEFAULT_ADP_CODE
            next_row["adp_name"] = next_row["adp_name"] or DEFAULT_ADP_NAME
            next_row["financial_year"] = next_row["financial_year"] or DEFAULT_FINANCIAL_YEAR
            next_row["cidp_code"] = next_row["cidp_code"] or DEFAULT_CIDP_CODE
            next_row["normalized_key"] = normalized_key(next_row)
            rows.append(next_row)
        return rows


def build_sql(args: argparse.Namespace) -> None:
    rows = read_review_rows(args.csv)
    if not rows:
        raise SystemExit(f"No reviewed ADP project rows found in {args.csv}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    values = []
    for row in rows:
        values.append(
            "("
            + ", ".join(
                [
                    sql_quote(row["adp_code"]),
                    sql_quote(row["adp_name"]),
                    sql_quote(row["financial_year"]),
                    sql_quote(row["cidp_code"]),
                    sql_quote(row["sector_name"]),
                    sql_quote(row["programme_name"]),
                    sql_quote(row["subprogramme_name"]),
                    sql_quote(row["project_name"]),
                    sql_quote(row["location_text"]),
                    sql_quote(row["subcounty"]),
                    sql_quote(row["ward"]),
                    sql_quote(row["sublocation"]),
                    sql_quote(row["village"]),
                    sql_quote(row["activity_description"]),
                    sql_numeric(row["estimated_cost"]),
                    sql_quote(row["funding_source"]),
                    sql_quote(row["timeframe"]),
                    sql_quote(row["performance_indicator"]),
                    sql_quote(row["target"]),
                    sql_quote(row["plan_status"]),
                    sql_quote(row["implementing_agency"]),
                    sql_quote(row["cross_cutting_issues"]),
                    sql_int(row["source_pdf_page"]),
                    sql_quote(row["raw_text"]),
                    sql_quote(row["normalized_key"]),
                ]
            )
            + ")"
        )

    values_sql = ",\n".join(values) if values else "-- No reviewed rows found"
    sql = f"""BEGIN;

CREATE TEMP TABLE _adp_review_import (
  adp_code TEXT,
  adp_name TEXT,
  financial_year TEXT,
  cidp_code TEXT,
  sector_name TEXT,
  programme_name TEXT,
  subprogramme_name TEXT,
  project_name TEXT,
  location_text TEXT,
  subcounty TEXT,
  ward TEXT,
  sublocation TEXT,
  village TEXT,
  activity_description TEXT,
  estimated_cost NUMERIC(18,2),
  funding_source TEXT,
  timeframe TEXT,
  performance_indicator TEXT,
  target TEXT,
  plan_status TEXT,
  implementing_agency TEXT,
  cross_cutting_issues TEXT,
  source_pdf_page INTEGER,
  raw_text TEXT,
  normalized_key TEXT
) ON COMMIT DROP;

INSERT INTO _adp_review_import (
  adp_code, adp_name, financial_year, cidp_code, sector_name, programme_name,
  subprogramme_name, project_name, location_text, subcounty, ward, sublocation,
  village, activity_description, estimated_cost, funding_source, timeframe,
  performance_indicator, target, plan_status, implementing_agency,
  cross_cutting_issues, source_pdf_page, raw_text, normalized_key
)
VALUES
{values_sql};

INSERT INTO adp_plans (adp_code, adp_name, financial_year, cidp_code, active, voided, updated_at)
SELECT DISTINCT adp_code, adp_name, financial_year, cidp_code, true, false, CURRENT_TIMESTAMP
FROM _adp_review_import
ON CONFLICT (adp_code) DO UPDATE
SET adp_name = EXCLUDED.adp_name,
    financial_year = EXCLUDED.financial_year,
    cidp_code = EXCLUDED.cidp_code,
    active = true,
    voided = false,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO adp_programmes (
  adp_plan_id, sector_name, programme_name, subprogramme_name, voided, updated_at
)
SELECT DISTINCT ap.id, i.sector_name, i.programme_name, i.subprogramme_name, false, CURRENT_TIMESTAMP
FROM _adp_review_import i
JOIN adp_plans ap ON ap.adp_code = i.adp_code
WHERE NULLIF(TRIM(i.programme_name), '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO adp_projects (
  adp_plan_id, adp_programme_id, project_name, location_text, subcounty, ward,
  sublocation, village, activity_description, estimated_cost, funding_source,
  timeframe, performance_indicator, target, plan_status, implementing_agency,
  cross_cutting_issues, source_pdf_page, raw_text, normalized_key, voided, updated_at
)
SELECT
  ap.id,
  adpg.id,
  i.project_name,
  i.location_text,
  i.subcounty,
  i.ward,
  i.sublocation,
  i.village,
  i.activity_description,
  i.estimated_cost,
  i.funding_source,
  i.timeframe,
  i.performance_indicator,
  i.target,
  i.plan_status,
  i.implementing_agency,
  i.cross_cutting_issues,
  i.source_pdf_page,
  i.raw_text,
  i.normalized_key,
  false,
  CURRENT_TIMESTAMP
FROM _adp_review_import i
JOIN adp_plans ap ON ap.adp_code = i.adp_code
LEFT JOIN adp_programmes adpg
  ON adpg.adp_plan_id = ap.id
 AND COALESCE(adpg.sector_name, '') = COALESCE(i.sector_name, '')
 AND COALESCE(adpg.programme_name, '') = COALESCE(i.programme_name, '')
 AND COALESCE(adpg.subprogramme_name, '') = COALESCE(i.subprogramme_name, '')
ON CONFLICT (adp_plan_id, normalized_key) WHERE voided = false AND normalized_key IS NOT NULL
DO UPDATE SET
  adp_programme_id = EXCLUDED.adp_programme_id,
  project_name = EXCLUDED.project_name,
  location_text = EXCLUDED.location_text,
  subcounty = EXCLUDED.subcounty,
  ward = EXCLUDED.ward,
  sublocation = EXCLUDED.sublocation,
  village = EXCLUDED.village,
  activity_description = EXCLUDED.activity_description,
  estimated_cost = EXCLUDED.estimated_cost,
  funding_source = EXCLUDED.funding_source,
  timeframe = EXCLUDED.timeframe,
  performance_indicator = EXCLUDED.performance_indicator,
  target = EXCLUDED.target,
  plan_status = EXCLUDED.plan_status,
  implementing_agency = EXCLUDED.implementing_agency,
  cross_cutting_issues = EXCLUDED.cross_cutting_issues,
  source_pdf_page = EXCLUDED.source_pdf_page,
  raw_text = EXCLUDED.raw_text,
  voided = false,
  updated_at = CURRENT_TIMESTAMP;

SELECT
  (SELECT COUNT(*) FROM _adp_review_import) AS reviewed_rows,
  (SELECT COUNT(*) FROM adp_projects p JOIN adp_plans ap ON ap.id = p.adp_plan_id WHERE ap.adp_code = '{DEFAULT_ADP_CODE}' AND COALESCE(p.voided, false) = false) AS active_adp_projects;

COMMIT;
"""
    args.output.write_text(sql, encoding="utf-8")
    print(f"Wrote ADP seed SQL with {len(rows)} reviewed rows: {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract and build SQL for Machakos ADP projects.")
    sub = parser.add_subparsers(dest="command", required=True)

    raw = sub.add_parser("extract-raw", help="Extract raw PDF text blocks for review.")
    raw.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    raw.add_argument("--output", type=Path, default=DEFAULT_RAW_CSV)
    raw.add_argument("--start-page", type=int, default=204)
    raw.add_argument("--end-page", type=int, default=300)
    raw.set_defaults(func=extract_raw)

    build = sub.add_parser("build-sql", help="Build idempotent SQL from a reviewed ADP CSV.")
    build.add_argument("--csv", type=Path, required=True)
    build.add_argument("--output", type=Path, default=DEFAULT_SQL_OUT)
    build.set_defaults(func=build_sql)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
