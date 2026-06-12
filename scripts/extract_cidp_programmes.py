#!/usr/bin/env python3
"""Extract Machakos CIDP programme tables and generate an import migration.

The CIDP PDF is a scanned/exported document whose tables do not map cleanly to
CSV. This script uses the stable section markers in Chapter 4:

  - 4.2.1.x sector headings
  - Programme ... headings
  - Objective / Outcome lines
  - SP ... subprogramme markers

It keeps raw source blocks in the generated SQL so imported rows can be audited
against the source PDF after loading.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


CIDP_CODE = "MACHAKOS-CIDP-2023-2027"
CIDP_NAME = "Machakos County Integrated Development Plan 2023-2027"
DEFAULT_PDF = Path("docs/Machakos-CIDP-2023-2027.pdf")
DEFAULT_JSON_OUT = Path("scripts/migration/data/machakos_cidp_programmes_extracted.json")
DEFAULT_SQL_OUT = Path("scripts/migration/2026-06-11-seed-cidp-programmes-subprogrammes-and-link-suggestions.sql")

# Chapter 4 sector programme tables begin on PDF page 157. The printed CIDP page
# number is consistently 18 lower in this section.
START_PDF_PAGE = 157
END_PDF_PAGE = 281
CIDP_PAGE_OFFSET = 18


STOPWORDS = {
    "and",
    "the",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "county",
    "machakos",
    "programme",
    "program",
    "programmes",
    "programs",
    "development",
    "services",
    "service",
    "support",
    "management",
    "administrative",
    "administration",
    "planning",
    "general",
    "enhance",
    "increased",
    "improved",
    "increase",
    "provide",
    "delivery",
    "sector",
    "sub",
    "subsector",
}


SECTOR_RE = re.compile(
    r"^4\.2\.1\.\d+[:.]?\s+(?P<name>.+?)(?:\s+Sector Programmes\.?|\s+sector programmes\.?|\s+sector\.?|\s*$)",
    re.IGNORECASE,
)
PROGRAMME_RE = re.compile(
    r"^Programme(?:d)?\s+P?\s*(?P<code>[0-9]+(?:[.:][0-9]+)?)\.?\s*[:\-]?\s*(?P<name>.+)$",
    re.IGNORECASE,
)
SUBPROGRAMME_RE = re.compile(
    r"^\s*SP\s*(?P<code>[0-9]+(?:[.:][0-9]+){1,2})\s*[:\-]?\s*(?P<rest>.*)$",
    re.IGNORECASE,
)

CANONICAL_SECTORS = {
    "agriculture and cooperative development": "Agriculture and Co-operative Development",
    "agriculture and co-operative development": "Agriculture and Co-operative Development",
    "commercial, tourism and labour affairs": "Commercial, Tourism and Labour Affairs",
    "education, youth and social welfare": "Education, Youth and Social Welfare",
    "energy, infrastructure and ict": "Energy, Infrastructure and ICT",
    "health": "Health",
    "lands, environment and natural resources": "Lands, Environment and Natural Resources",
    "public administration": "Public Administration",
    "water and irrigation": "Water and Irrigation",
}


@dataclass
class SourceLine:
    pdf_page: int
    cidp_page: int
    text: str


@dataclass
class Programme:
    sort_order: int
    sector_name: str
    programme_code: str
    programme_name: str
    objective: str
    outcome: str
    source_pdf_page: int
    source_cidp_page: int
    raw_heading: str


@dataclass
class SubProgramme:
    sort_order: int
    sector_name: str
    programme_code: str
    subprogramme_code: str
    subprogramme_name: str
    source_pdf_page: int
    source_cidp_page: int
    raw_text: str


def ascii_clean(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.replace("\u000c", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    return value.strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", ascii_clean(value)).strip()


def sql_quote(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def sql_array(values: Iterable[str]) -> str:
    cleaned = [v for v in values if v]
    if not cleaned:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(sql_quote(v) for v in cleaned) + "]::text[]"


def normalise_code(code: str) -> str:
    return compact(code).replace(":", ".").strip(".")


def normalise_sector_name(name: str) -> str:
    cleaned = compact(name)
    cleaned = re.sub(r"\s+Sector Programmes\.?$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+sector programmes\.?$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+sector\.?$", "", cleaned, flags=re.IGNORECASE)
    key = cleaned.lower()
    return CANONICAL_SECTORS.get(key, cleaned)


def is_noise_line(text: str) -> bool:
    s = compact(text)
    if not s:
        return True
    if re.fullmatch(r"\d{1,3}", s):
        return True
    lower = s.lower()
    return lower.startswith(
        (
            "sub programme",
            "sub progamme",
            "sub program",
            "progamme key output",
            "key output",
            "key performance",
            "linka planned targets",
            "linkag planned targets",
            "links to sdg",
            "planned targets",
            "target cost",
            "targe cost",
            "sdg targets",
            "total budget",
            "total budge",
        )
    )


def is_boundary(line: SourceLine) -> bool:
    s = compact(line.text)
    return bool(
        SECTOR_RE.match(s)
        or PROGRAMME_RE.match(s)
        or SUBPROGRAMME_RE.match(s)
        or s.lower().startswith("objective:")
        or s.lower().startswith("outcome:")
        or s.lower().startswith("output:")
    )


def extract_pdf_lines(pdf_path: Path, start_page: int, end_page: int) -> list[SourceLine]:
    lines: list[SourceLine] = []
    for pdf_page in range(start_page, end_page + 1):
        text = subprocess.check_output(
            ["pdftotext", "-f", str(pdf_page), "-l", str(pdf_page), "-layout", str(pdf_path), "-"],
            text=True,
            errors="replace",
        )
        cidp_page = pdf_page - CIDP_PAGE_OFFSET
        for raw_line in text.splitlines():
            lines.append(SourceLine(pdf_page=pdf_page, cidp_page=cidp_page, text=raw_line.rstrip()))
    return lines


def collect_prefixed_value(lines: list[SourceLine], index: int) -> tuple[str, int]:
    first = compact(lines[index].text)
    _, value = first.split(":", 1)
    parts = [value.strip()]
    j = index + 1
    while j < len(lines):
        candidate = compact(lines[j].text)
        if not candidate or is_boundary(lines[j]) or is_noise_line(candidate):
            break
        parts.append(candidate)
        j += 1
    return compact(" ".join(parts)), j


def extract_subprogramme_name(block_lines: list[SourceLine], fallback: str) -> str:
    fragments: list[str] = []
    for raw in block_lines[1:]:
        text = raw.text
        if not text.strip() or is_noise_line(text):
            continue
        # The first column is narrow; keep the left cell and remove adjacent
        # key-output text that pdftotext sometimes pulls into the same line.
        left_cell = text[:26].strip()
        if not left_cell:
            continue
        left_cell = re.split(r"\s{2,}", left_cell)[0].strip()
        left_cell = compact(left_cell)
        if not left_cell or left_cell.lower().startswith(("programme", "objective", "outcome")):
            continue
        if SUBPROGRAMME_RE.match(left_cell):
            continue
        fragments.append(left_cell)
        if len(fragments) >= 6:
            break

    name = compact(" ".join(fragments))
    if name:
        return name[:255]

    fallback = re.sub(r"\bNo\.?\b.*$", "", fallback, flags=re.IGNORECASE)
    fallback = re.sub(r"\bNumber\b.*$", "", fallback, flags=re.IGNORECASE)
    fallback = re.sub(r"\bAmount\b.*$", "", fallback, flags=re.IGNORECASE)
    return compact(fallback)[:255] or "Unlabelled CIDP subprogramme"


def parse_cidp(lines: list[SourceLine]) -> tuple[list[Programme], list[SubProgramme]]:
    programmes: list[Programme] = []
    subprogrammes: list[SubProgramme] = []
    current_sector = ""
    current_programme_code = ""
    current_programme_index: int | None = None
    programme_seen: set[tuple[str, str]] = set()
    sub_seen: set[tuple[str, str]] = set()

    i = 0
    while i < len(lines):
        line = lines[i]
        s = compact(line.text)

        if not s or is_noise_line(s):
            i += 1
            continue

        sector_match = SECTOR_RE.match(s)
        if sector_match:
            current_sector = normalise_sector_name(sector_match.group("name").strip(" .:"))
            i += 1
            continue

        programme_match = PROGRAMME_RE.match(s)
        if programme_match and "Programme/Project" not in s:
            code = normalise_code(programme_match.group("code"))
            name = compact(programme_match.group("name").strip(" .:"))
            key = (current_sector.lower(), code.lower())
            if key not in programme_seen:
                programmes.append(
                    Programme(
                        sort_order=len(programmes) + 1,
                        sector_name=current_sector or "Unclassified",
                        programme_code=code,
                        programme_name=name[:255],
                        objective="",
                        outcome="",
                        source_pdf_page=line.pdf_page,
                        source_cidp_page=line.cidp_page,
                        raw_heading=s,
                    )
                )
                programme_seen.add(key)
                current_programme_index = len(programmes) - 1
            else:
                current_programme_index = next(
                    idx
                    for idx, programme in enumerate(programmes)
                    if programme.sector_name.lower() == current_sector.lower()
                    and programme.programme_code.lower() == code.lower()
                )
            current_programme_code = code
            i += 1
            continue

        if current_programme_index is not None and s.lower().startswith("objective:"):
            programmes[current_programme_index].objective, i = collect_prefixed_value(lines, i)
            continue

        if current_programme_index is not None and (
            s.lower().startswith("outcome:") or s.lower().startswith("output:")
        ):
            programmes[current_programme_index].outcome, i = collect_prefixed_value(lines, i)
            continue

        subprogramme_match = SUBPROGRAMME_RE.match(s)
        if subprogramme_match and current_programme_code:
            code = normalise_code(subprogramme_match.group("code"))
            block = [line]
            j = i + 1
            while j < len(lines) and not is_boundary(lines[j]):
                block.append(lines[j])
                j += 1

            key = (current_programme_code.lower(), code.lower())
            if key not in sub_seen:
                raw_text = "\n".join(ascii_clean(entry.text) for entry in block if entry.text.strip())
                subprogrammes.append(
                    SubProgramme(
                        sort_order=len(subprogrammes) + 1,
                        sector_name=current_sector or "Unclassified",
                        programme_code=current_programme_code,
                        subprogramme_code=code,
                        subprogramme_name=extract_subprogramme_name(block, subprogramme_match.group("rest")),
                        source_pdf_page=line.pdf_page,
                        source_cidp_page=line.cidp_page,
                        raw_text=raw_text[:4000],
                    )
                )
                sub_seen.add(key)
            i = j
            continue

        i += 1

    return programmes, subprogrammes


def keywords_for(*parts: str) -> list[str]:
    tokens: list[str] = []
    for part in parts:
        for token in re.findall(r"[a-zA-Z]{4,}", compact(part).lower()):
            if token not in STOPWORDS and token not in tokens:
                tokens.append(token)
    return tokens[:14]


def values_block(rows: list[tuple[object, ...]], indent: str = "  ") -> str:
    return ",\n".join(indent + "(" + ", ".join(sql_quote(value) for value in row) + ")" for row in rows)


def build_sql(programmes: list[Programme], subprogrammes: list[SubProgramme]) -> str:
    programme_rows = [
        (
            p.sort_order,
            p.sector_name,
            p.programme_code,
            p.programme_name,
            p.objective,
            p.outcome,
            p.source_pdf_page,
            p.source_cidp_page,
            p.raw_heading,
        )
        for p in programmes
    ]
    subprogramme_rows = [
        (
            s.sort_order,
            s.sector_name,
            s.programme_code,
            s.subprogramme_code,
            s.subprogramme_name,
            s.source_pdf_page,
            s.source_cidp_page,
            s.raw_text,
        )
        for s in subprogrammes
    ]

    keyword_rows: list[tuple[object, ...]] = []
    programme_by_code = {p.programme_code: p for p in programmes}
    for p in programmes:
        kws = keywords_for(p.sector_name, p.programme_name, p.objective, p.outcome)
        if len(kws) >= 2:
            keyword_rows.append((p.programme_code, None, sql_array(kws)))
    for s in subprogrammes:
        p = programme_by_code.get(s.programme_code)
        kws = keywords_for(
            s.sector_name,
            p.programme_name if p else "",
            s.subprogramme_name,
            p.objective if p else "",
            p.outcome if p else "",
        )
        if len(kws) >= 2:
            keyword_rows.append((s.programme_code, s.subprogramme_code, sql_array(kws)))

    keyword_values = ",\n".join(
        "  (" + sql_quote(row[0]) + ", " + sql_quote(row[1]) + ", " + row[2] + ")" for row in keyword_rows
    )

    return f"""-- =============================================================================
-- Machakos CIDP 2023-2027: programmes, subprogrammes, and link suggestions
-- =============================================================================
--
-- Generated by:
--   python3 scripts/extract_cidp_programmes.py
--
-- Source:
--   docs/Machakos-CIDP-2023-2027.pdf
--   Chapter 4.2.1 Sector Programmes, PDF pages {START_PDF_PAGE}-{END_PDF_PAGE}
--
-- What this migration does:
--   1) Ensures strategic planning programme/subprogramme catalog tables exist.
--   2) Seeds extracted CIDP programmes and subprogrammes into those catalogues.
--   3) Creates CIDP source/audit tables that preserve PDF source pages and raw rows.
--   4) Creates reviewable project-to-CIDP link suggestions using keyword matches.
--
-- Safe to re-run:
--   - Existing programme/subprogramme catalogue rows are updated by CIDP code.
--   - CIDP source rows for this document are refreshed.
--   - Link suggestions are inserted once and left reviewable.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS strategicplans (
  id BIGSERIAL PRIMARY KEY,
  cidpid TEXT NULL,
  "cidpName" TEXT NULL,
  "startDate" TIMESTAMP NULL,
  "endDate" TIMESTAMP NULL,
  remarks TEXT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  "userId" BIGINT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedBy" BIGINT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  "programId" BIGSERIAL PRIMARY KEY,
  cidpid TEXT NULL,
  "programName" TEXT NULL,
  "programCode" TEXT NULL,
  programme TEXT NULL,
  description TEXT NULL,
  "needsPriorities" TEXT NULL,
  strategies TEXT NULL,
  objectives TEXT NULL,
  outcomes TEXT NULL,
  remarks TEXT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  "userId" BIGINT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedBy" BIGINT NULL
);

CREATE TABLE IF NOT EXISTS subprograms (
  "subProgramId" BIGSERIAL PRIMARY KEY,
  "programId" BIGINT NULL,
  "subProgramName" TEXT NULL,
  "subProgramCode" TEXT NULL,
  "subProgramme" TEXT NULL,
  "keyOutcome" TEXT NULL,
  kpi TEXT NULL,
  "unitOfMeasure" TEXT NULL,
  baseline TEXT NULL,
  "yr1Targets" TEXT NULL,
  "yr2Targets" TEXT NULL,
  "yr3Targets" TEXT NULL,
  "yr4Targets" TEXT NULL,
  "yr5Targets" TEXT NULL,
  "yr1Budget" NUMERIC(18,2) NULL,
  "yr2Budget" NUMERIC(18,2) NULL,
  "yr3Budget" NUMERIC(18,2) NULL,
  "yr4Budget" NUMERIC(18,2) NULL,
  "yr5Budget" NUMERIC(18,2) NULL,
  "totalBudget" NUMERIC(18,2) NULL,
  "planningIndicatorId" BIGINT NULL,
  remarks TEXT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  "userId" BIGINT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedBy" BIGINT NULL
);

ALTER TABLE programs ALTER COLUMN cidpid TYPE TEXT USING cidpid::text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS "programName" TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS "programCode" TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS programme TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS "needsPriorities" TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS strategies TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS objectives TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS outcomes TEXT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS "voidedBy" BIGINT NULL;

ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "programId" BIGINT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "subProgramName" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "subProgramCode" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "subProgramme" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "keyOutcome" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS kpi TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "unitOfMeasure" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS baseline TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr1Targets" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr2Targets" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr3Targets" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr4Targets" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr5Targets" TEXT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr1Budget" NUMERIC(18,2) NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr2Budget" NUMERIC(18,2) NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr3Budget" NUMERIC(18,2) NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr4Budget" NUMERIC(18,2) NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr5Budget" NUMERIC(18,2) NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "totalBudget" NUMERIC(18,2) NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "planningIndicatorId" BIGINT NULL;
ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "voidedBy" BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_programs_cidpid ON programs (cidpid);
CREATE INDEX IF NOT EXISTS idx_programs_program_code ON programs ("programCode");
CREATE INDEX IF NOT EXISTS idx_subprograms_program_id ON subprograms ("programId");
CREATE INDEX IF NOT EXISTS idx_subprograms_subprogram_code ON subprograms ("subProgramCode");

CREATE TABLE IF NOT EXISTS cidp_programme_sources (
  id BIGSERIAL PRIMARY KEY,
  cidp_code TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('programme', 'subprogramme')),
  sector_name TEXT NULL,
  programme_code TEXT NULL,
  subprogramme_code TEXT NULL,
  title TEXT NULL,
  objective TEXT NULL,
  outcome TEXT NULL,
  source_pdf_page INTEGER NULL,
  source_cidp_page INTEGER NULL,
  raw_heading TEXT NULL,
  raw_text TEXT NULL,
  extracted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cidp_programme_sources_cidp_code ON cidp_programme_sources (cidp_code);
CREATE INDEX IF NOT EXISTS idx_cidp_programme_sources_programme ON cidp_programme_sources (programme_code);
CREATE INDEX IF NOT EXISTS idx_cidp_programme_sources_subprogramme ON cidp_programme_sources (subprogramme_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cidp_programme_sources_unique
ON cidp_programme_sources (cidp_code, record_type, COALESCE(programme_code, ''), COALESCE(subprogramme_code, ''));

CREATE TABLE IF NOT EXISTS cidp_project_link_suggestions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  cidp_code TEXT NOT NULL,
  program_id BIGINT NULL REFERENCES programs ("programId") ON DELETE SET NULL,
  subprogram_id BIGINT NULL REFERENCES subprograms ("subProgramId") ON DELETE SET NULL,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  match_reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'review_pending',
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cidp_project_link_suggestions_project ON cidp_project_link_suggestions (project_id);
CREATE INDEX IF NOT EXISTS idx_cidp_project_link_suggestions_program ON cidp_project_link_suggestions (program_id);
CREATE INDEX IF NOT EXISTS idx_cidp_project_link_suggestions_subprogram ON cidp_project_link_suggestions (subprogram_id);
CREATE INDEX IF NOT EXISTS idx_cidp_project_link_suggestions_status ON cidp_project_link_suggestions (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cidp_project_link_suggestions_unique
ON cidp_project_link_suggestions (project_id, cidp_code, COALESCE(program_id, 0), COALESCE(subprogram_id, 0));

INSERT INTO strategicplans (cidpid, "cidpName", "startDate", "endDate", remarks, voided, "createdAt", "updatedAt")
SELECT {sql_quote(CIDP_CODE)}, {sql_quote(CIDP_NAME)}, '2023-01-01', '2027-12-31',
       'Imported from Machakos CIDP 2023-2027 PDF Chapter 4.2.1 sector programme tables.',
       false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM strategicplans
  WHERE lower(COALESCE(cidpid, '')) = lower({sql_quote(CIDP_CODE)})
    AND COALESCE(voided, false) = false
);

UPDATE strategicplans
SET "cidpName" = {sql_quote(CIDP_NAME)},
    "startDate" = '2023-01-01',
    "endDate" = '2027-12-31',
    remarks = 'Imported from Machakos CIDP 2023-2027 PDF Chapter 4.2.1 sector programme tables.',
    voided = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE lower(COALESCE(cidpid, '')) = lower({sql_quote(CIDP_CODE)});

CREATE TEMP TABLE _cidp_programmes (
  sort_order INTEGER PRIMARY KEY,
  sector_name TEXT NOT NULL,
  programme_code TEXT NOT NULL,
  programme_name TEXT NOT NULL,
  objective TEXT NULL,
  outcome TEXT NULL,
  source_pdf_page INTEGER NULL,
  source_cidp_page INTEGER NULL,
  raw_heading TEXT NULL
) ON COMMIT DROP;

INSERT INTO _cidp_programmes (
  sort_order, sector_name, programme_code, programme_name, objective, outcome,
  source_pdf_page, source_cidp_page, raw_heading
) VALUES
{values_block(programme_rows)};

CREATE TEMP TABLE _cidp_subprogrammes (
  sort_order INTEGER PRIMARY KEY,
  sector_name TEXT NOT NULL,
  programme_code TEXT NOT NULL,
  subprogramme_code TEXT NOT NULL,
  subprogramme_name TEXT NOT NULL,
  source_pdf_page INTEGER NULL,
  source_cidp_page INTEGER NULL,
  raw_text TEXT NULL
) ON COMMIT DROP;

INSERT INTO _cidp_subprogrammes (
  sort_order, sector_name, programme_code, subprogramme_code, subprogramme_name,
  source_pdf_page, source_cidp_page, raw_text
) VALUES
{values_block(subprogramme_rows)};

DO $$
DECLARE
  row_data RECORD;
  existing_program_id BIGINT;
BEGIN
  FOR row_data IN SELECT * FROM _cidp_programmes ORDER BY sort_order LOOP
    SELECT p."programId"
    INTO existing_program_id
    FROM programs p
    WHERE lower(COALESCE(p.cidpid, '')) = lower({sql_quote(CIDP_CODE)})
      AND lower(COALESCE(p."programCode", '')) = lower(row_data.programme_code)
    ORDER BY COALESCE(p.voided, false), p."programId"
    LIMIT 1;

    IF existing_program_id IS NULL THEN
      INSERT INTO programs (
        cidpid, "programName", "programCode", programme, description,
        objectives, outcomes, remarks, voided, "createdAt", "updatedAt"
      )
      VALUES (
        {sql_quote(CIDP_CODE)}, row_data.programme_name, row_data.programme_code,
        row_data.programme_name, row_data.sector_name, row_data.objective,
        row_data.outcome,
        concat('CIDP source: PDF page ', row_data.source_pdf_page, ', CIDP page ', row_data.source_cidp_page, '. ', row_data.raw_heading),
        false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE programs
      SET "programName" = row_data.programme_name,
          "programCode" = row_data.programme_code,
          programme = row_data.programme_name,
          description = row_data.sector_name,
          objectives = row_data.objective,
          outcomes = row_data.outcome,
          remarks = concat('CIDP source: PDF page ', row_data.source_pdf_page, ', CIDP page ', row_data.source_cidp_page, '. ', row_data.raw_heading),
          voided = false,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "programId" = existing_program_id;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  row_data RECORD;
  parent_program_id BIGINT;
  existing_subprogram_id BIGINT;
BEGIN
  FOR row_data IN SELECT * FROM _cidp_subprogrammes ORDER BY sort_order LOOP
    SELECT p."programId"
    INTO parent_program_id
    FROM programs p
    WHERE lower(COALESCE(p.cidpid, '')) = lower({sql_quote(CIDP_CODE)})
      AND lower(COALESCE(p."programCode", '')) = lower(row_data.programme_code)
      AND COALESCE(p.voided, false) = false
    ORDER BY p."programId"
    LIMIT 1;

    IF parent_program_id IS NULL THEN
      RAISE NOTICE 'Skipping CIDP subprogramme %, parent programme % was not found', row_data.subprogramme_code, row_data.programme_code;
      CONTINUE;
    END IF;

    SELECT sp."subProgramId"
    INTO existing_subprogram_id
    FROM subprograms sp
    WHERE sp."programId" = parent_program_id
      AND lower(COALESCE(sp."subProgramCode", '')) = lower(row_data.subprogramme_code)
    ORDER BY COALESCE(sp.voided, false), sp."subProgramId"
    LIMIT 1;

    IF existing_subprogram_id IS NULL THEN
      INSERT INTO subprograms (
        "programId", "subProgramName", "subProgramCode", "subProgramme",
        "keyOutcome", remarks, voided, "createdAt", "updatedAt"
      )
      VALUES (
        parent_program_id, row_data.subprogramme_name, row_data.subprogramme_code,
        row_data.subprogramme_name, row_data.sector_name,
        concat('CIDP source: PDF page ', row_data.source_pdf_page, ', CIDP page ', row_data.source_cidp_page, E'\\n', row_data.raw_text),
        false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE subprograms
      SET "programId" = parent_program_id,
          "subProgramName" = row_data.subprogramme_name,
          "subProgramCode" = row_data.subprogramme_code,
          "subProgramme" = row_data.subprogramme_name,
          "keyOutcome" = row_data.sector_name,
          remarks = concat('CIDP source: PDF page ', row_data.source_pdf_page, ', CIDP page ', row_data.source_cidp_page, E'\\n', row_data.raw_text),
          voided = false,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "subProgramId" = existing_subprogram_id;
    END IF;
  END LOOP;
END $$;

DELETE FROM cidp_programme_sources
WHERE cidp_code = {sql_quote(CIDP_CODE)};

INSERT INTO cidp_programme_sources (
  cidp_code, record_type, sector_name, programme_code, title, objective, outcome,
  source_pdf_page, source_cidp_page, raw_heading, raw_text
)
SELECT
  {sql_quote(CIDP_CODE)}, 'programme', sector_name, programme_code, programme_name,
  objective, outcome, source_pdf_page, source_cidp_page, raw_heading, raw_heading
FROM _cidp_programmes;

INSERT INTO cidp_programme_sources (
  cidp_code, record_type, sector_name, programme_code, subprogramme_code, title,
  source_pdf_page, source_cidp_page, raw_text
)
SELECT
  {sql_quote(CIDP_CODE)}, 'subprogramme', sector_name, programme_code,
  subprogramme_code, subprogramme_name, source_pdf_page, source_cidp_page, raw_text
FROM _cidp_subprogrammes;

CREATE TEMP TABLE _cidp_link_keywords (
  programme_code TEXT NOT NULL,
  subprogramme_code TEXT NULL,
  keywords TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _cidp_link_keywords (programme_code, subprogramme_code, keywords) VALUES
{keyword_values};

DO $$
DECLARE
  project_id_column TEXT;
  project_name_column TEXT;
  candidate_column TEXT;
  text_expression TEXT;
  where_expression TEXT := '';
BEGIN
  SELECT column_name
  INTO project_id_column
  FROM information_schema.columns
  WHERE table_name = 'projects'
    AND column_name IN ('project_id', 'id', 'projectid', 'projectId')
  ORDER BY CASE column_name
    WHEN 'project_id' THEN 1
    WHEN 'id' THEN 2
    WHEN 'projectid' THEN 3
    ELSE 4
  END
  LIMIT 1;

  SELECT column_name
  INTO project_name_column
  FROM information_schema.columns
  WHERE table_name = 'projects'
    AND column_name IN ('name', 'projectname', 'projectName')
  ORDER BY CASE column_name
    WHEN 'name' THEN 1
    WHEN 'projectname' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF project_id_column IS NULL OR project_name_column IS NULL THEN
    RAISE NOTICE 'Skipping CIDP project link suggestions because projects id/name columns were not found';
    RETURN;
  END IF;

  text_expression := 'COALESCE(p.' || quote_ident(project_name_column) || '::text, '''')';

  FOREACH candidate_column IN ARRAY ARRAY[
    'description', 'sector', 'implementing_agency', 'state_department', 'ministry', 'notes', 'data_sources'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'projects' AND column_name = candidate_column
    ) THEN
      text_expression := text_expression || ', COALESCE(p.' || quote_ident(candidate_column) || '::text, '''')';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'voided'
  ) THEN
    where_expression := 'WHERE COALESCE(p.voided, false) = false';
  END IF;

  EXECUTE format($SQL$
    WITH project_text AS (
      SELECT
        p.%1$I::bigint AS project_id,
        lower(concat_ws(' ', %2$s)) AS search_text
      FROM projects p
      %3$s
    ),
    matches AS (
      SELECT
        pt.project_id,
        pr."programId" AS program_id,
        sp."subProgramId" AS subprogram_id,
        COUNT(keyword) AS match_count,
        string_agg(keyword, ', ' ORDER BY keyword) AS matched_terms
      FROM project_text pt
      JOIN _cidp_link_keywords lk ON true
      JOIN programs pr
        ON lower(COALESCE(pr.cidpid, '')) = lower(%4$L)
       AND lower(COALESCE(pr."programCode", '')) = lower(lk.programme_code)
       AND COALESCE(pr.voided, false) = false
      LEFT JOIN subprograms sp
        ON sp."programId" = pr."programId"
       AND lower(COALESCE(sp."subProgramCode", '')) = lower(COALESCE(lk.subprogramme_code, ''))
       AND COALESCE(sp.voided, false) = false
      CROSS JOIN LATERAL unnest(lk.keywords) AS keyword
      WHERE pt.search_text LIKE '%%' || lower(keyword) || '%%'
      GROUP BY pt.project_id, pr."programId", sp."subProgramId"
      HAVING COUNT(keyword) >= 2
    )
    INSERT INTO cidp_project_link_suggestions (
      project_id, cidp_code, program_id, subprogram_id, confidence, match_reason, status,
      created_at, updated_at
    )
    SELECT
      project_id,
      %4$L,
      program_id,
      subprogram_id,
      LEAST(0.90, 0.45 + (match_count * 0.08))::numeric(5,2),
      concat('Matched CIDP keywords: ', matched_terms),
      'review_pending',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM matches
    ON CONFLICT DO NOTHING
  $SQL$, project_id_column, text_expression, where_expression, {sql_quote(CIDP_CODE)});
END $$;

SELECT
  (SELECT COUNT(*) FROM _cidp_programmes) AS extracted_programmes,
  (SELECT COUNT(*) FROM _cidp_subprogrammes) AS extracted_subprogrammes,
  (SELECT COUNT(*) FROM programs WHERE lower(COALESCE(cidpid, '')) = lower({sql_quote(CIDP_CODE)}) AND COALESCE(voided, false) = false) AS active_cidp_programmes,
  (
    SELECT COUNT(*)
    FROM subprograms sp
    JOIN programs p ON p."programId" = sp."programId"
    WHERE lower(COALESCE(p.cidpid, '')) = lower({sql_quote(CIDP_CODE)})
      AND COALESCE(sp.voided, false) = false
  ) AS active_cidp_subprogrammes,
  (SELECT COUNT(*) FROM cidp_project_link_suggestions WHERE cidp_code = {sql_quote(CIDP_CODE)}) AS cidp_link_suggestions;

COMMIT;
"""


def write_outputs(
    programmes: list[Programme],
    subprogrammes: list[SubProgramme],
    json_out: Path,
    sql_out: Path,
) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    sql_out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "cidp_code": CIDP_CODE,
        "cidp_name": CIDP_NAME,
        "source_pdf": str(DEFAULT_PDF),
        "source_pdf_pages": [START_PDF_PAGE, END_PDF_PAGE],
        "programme_count": len(programmes),
        "subprogramme_count": len(subprogrammes),
        "programmes": [asdict(p) for p in programmes],
        "subprogrammes": [asdict(s) for s in subprogrammes],
    }
    json_out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    sql_out.write_text(build_sql(programmes, subprogrammes), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Machakos CIDP programme data from PDF.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--sql-out", type=Path, default=DEFAULT_SQL_OUT)
    parser.add_argument("--start-page", type=int, default=START_PDF_PAGE)
    parser.add_argument("--end-page", type=int, default=END_PDF_PAGE)
    args = parser.parse_args()

    if not args.pdf.exists():
        raise SystemExit(f"PDF not found: {args.pdf}")

    lines = extract_pdf_lines(args.pdf, args.start_page, args.end_page)
    programmes, subprogrammes = parse_cidp(lines)
    write_outputs(programmes, subprogrammes, args.json_out, args.sql_out)

    print(f"Extracted {len(programmes)} programmes")
    print(f"Extracted {len(subprogrammes)} subprogrammes")
    print(f"Wrote {args.json_out}")
    print(f"Wrote {args.sql_out}")


if __name__ == "__main__":
    main()
