#!/usr/bin/env python3
"""Generate E-CIMES User Training Script Word document."""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "E-CIMES-User-Training-Script.docx"


def set_doc_defaults(doc: Document) -> None:
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)


def add_title_page(doc: Document) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("E-CIMES User Training Script")
    run.bold = True
    run.font.size = Pt(26)
    run.font.color.rgb = RGBColor(0x0D, 0x47, 0xA1)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run(
        "Electronic County Integrated Monitoring and Evaluation System\n"
        "County Government of Machakos"
    )
    r.font.size = Pt(14)
    r.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    note = doc.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    nr = note.add_run(
        "Video tutorial voiceover script with on-screen cues\n"
        "Suggested length: 18–25 minutes (or two parts of ~12 minutes each)"
    )
    nr.italic = True
    nr.font.size = Pt(10)

    doc.add_page_break()


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    doc.add_heading(text, level=level)


def add_voiceover(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    label = p.add_run("Voiceover: ")
    label.bold = True
    label.font.color.rgb = RGBColor(0x15, 0x65, 0xC0)
    p.add_run(text)


def add_on_screen(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    label = p.add_run("ON SCREEN: ")
    label.bold = True
    label.font.color.rgb = RGBColor(0x2E, 0x7D, 0x32)
    p.add_run(text)


def add_tip(doc: Document, text: str) -> None:
    p = doc.add_paragraph(style="List Bullet")
    r = p.add_run("Tip: ")
    r.bold = True
    p.add_run(text)


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        doc.add_paragraph(item, style="List Bullet")


def add_table(doc: Document, headers: list[str], rows: list[list[str]]) -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = h
        for p in hdr[i].paragraphs:
            for run in p.runs:
                run.bold = True
    for ri, row in enumerate(rows):
        cells = table.rows[ri + 1].cells
        for ci, val in enumerate(row):
            cells[ci].text = val
    doc.add_paragraph()


def build_document() -> Document:
    doc = Document()
    set_doc_defaults(doc)
    add_title_page(doc)

    # Chapter 1
    add_heading(doc, "Chapter 1 — Introduction (~1 min)")
    add_voiceover(
        doc,
        "Hello and welcome to the Electronic County Integrated Monitoring and Evaluation System, "
        "known as E-CIMES, for the County Government of Machakos. E-CIMES supports the full project "
        "lifecycle: planning, registration, procurement, implementation, monitoring, finance, reporting, "
        "and public transparency — all in one platform. In this training you will learn how to log in, "
        "navigate the system, use dashboards, work with projects and finance, record monitoring data, "
        "generate reports, and get help when you need it.",
    )
    add_on_screen(doc, "County logo, login page, quick montage of dashboard → projects → map → reports.")
    add_tip(
        doc,
        "Features visible to each user depend on role, permissions, and organisation scope. "
        "If you cannot see a menu item described here, contact your ICT administrator.",
    )

    # Chapter 2
    add_heading(doc, "Chapter 2 — Logging In (~2 min)")
    add_voiceover(
        doc,
        "Open a supported browser — Chrome, Edge, or Firefox — and go to the E-CIMES staff URL "
        "provided by ICT. Enter your username or email and password. If your account has OTP enabled, "
        "enter the verification code sent to your registered phone or email. If this is your first login "
        "or your password has expired, the system will ask you to set a new password before you continue. "
        "Click Sign In.",
    )
    add_on_screen(doc, "Login page with county branding; OTP screen if applicable; forced password change.")
    add_bullets(
        doc,
        [
            "Do not share passwords or OTP codes.",
            "If login fails, confirm your account is active and approved.",
            "Missing menus after login usually means role or scope — not a system error.",
        ],
    )

    # Chapter 3
    add_heading(doc, "Chapter 3 — Home Page & Navigation (~2 min)")
    add_voiceover(
        doc,
        "After login, you arrive at your Personal Dashboard — the home page. At the top, the ribbon menu "
        "gives access to the main modules. Depending on your role, you may also see HR and other options. "
        "On the home page, review Notifications and Approvals — pending user approvals, projects awaiting "
        "approval, reviews, and PMC reports needing action. Check this area regularly. For self-service "
        "guidance, open the three-dot menu (top right) and select Help & Support.",
    )
    add_on_screen(doc, "Home page; open ribbon and hover each tab; open Notifications; open Help & Support.")
    add_bullets(
        doc,
        [
            "Dashboard — executive and analytical views",
            "Finance — payments, certificates, verification",
            "Projects — project registry and implementation",
            "Planning — CIDP, ADP, programmes, budget alignment",
            "Data — import tools and beneficiary registry",
            "Procurement — procurement stages and contractors",
            "Monitoring — visits, PMC, checklists, field data",
            "Reports — built-in county reports and report library",
            "Public — citizen-facing content and approvals",
            "Admin — users, metadata, audit (for authorised staff)",
        ],
    )

    # Chapter 4
    add_heading(doc, "Chapter 4 — Dashboards (~3 min)")
    add_voiceover(
        doc,
        "Select Dashboard from the ribbon to open analytical views. Each dashboard answers a different "
        "question — use the one that matches your task. Apply filters before interpreting numbers. "
        "Dashboard totals reflect your access scope and data completeness.",
    )
    add_on_screen(doc, "Dashboard submenu; open Project By Status; demonstrate filters.")
    add_table(
        doc,
        ["Dashboard", "Purpose"],
        [
            ["Personal Dashboard", "Your scoped summary and workflow inbox"],
            ["Summary Statistics", "County-wide summary cards and trends"],
            ["Project By Status", "Projects grouped by implementation status"],
            ["Project By Sector", "Distribution by sector/programme"],
            ["Finance Dashboard", "Budget, disbursement, absorption KPIs"],
            ["Operations Dashboard", "Operational delivery and attention items"],
            ["Jobs & Impact", "Employment and beneficiary impact"],
            ["Regional Breakdown", "Subcounty and ward distribution"],
            ["Departmental Reports", "Department-level summaries"],
            ["GIS Dashboard / Project GIS Map", "Location-based project views"],
        ],
    )
    add_tip(doc, "If figures look wrong, compare dashboard filters with Projects Registry filters.")

    # Chapter 5
    add_heading(doc, "Chapter 5 — AI Assistant & Help (~2 min)")
    add_voiceover(
        doc,
        "E-CIMES includes an AI Assistant on every authenticated page. Click the sparkle button at the "
        "bottom-right. You can ask how-to questions, request live summaries of projects you can access, "
        "or generate professional Word or PDF reports from the screen you are on. For formal documents, "
        "click Generate Professional Report, choose the report type and format, and download. AI output "
        "is advisory — review before official use. Open the relevant dashboard or project first so the "
        "AI uses the correct context. Help & Support contains the full user manual.",
    )
    add_on_screen(
        doc,
        "Click sparkle button; ask a navigation question; show Generate Professional Report dialog.",
    )

    # Chapter 6
    add_heading(doc, "Chapter 6 — Projects Module (~3 min)")
    add_voiceover(
        doc,
        "Open Projects from the ribbon. Use Projects Registry to search and filter by name, department, "
        "financial year, sector, status, subcounty, or ward. Always search before creating a new project "
        "to avoid duplicates. Open a project to review tabs: overview, milestones, status updates, documents, "
        "photos, teams, partners, funding, and certificates. Attach evidence that supports reported progress.",
    )
    add_on_screen(doc, "Projects Registry; open project details; scroll tabs; show document upload or status form.")
    add_bullets(
        doc,
        [
            "Implementation Plans — cross-project planning views",
            "Project Status / Updates — progress recording",
            "Evaluation Workbench — structured evaluation",
            "Schedule & Milestones, Teams, Partners",
        ],
    )

    # Chapter 7
    add_heading(doc, "Chapter 7 — Planning Module (~2 min)")
    add_voiceover(
        doc,
        "Select Planning to manage county planning structures: CIDP periods and pillars, ADP periods and "
        "ADP Implementation, RRI Programmes, Budget Traceability, ADP–Budget linkage, and indicator, "
        "activity, and risk catalogues. Planning catalogues feed monitoring and reports.",
    )
    add_on_screen(doc, "Planning menu; ADP Implementation with filters and gap summary.")

    # Chapter 8
    add_heading(doc, "Chapter 8 — Financial Tracking (~3 min)")
    add_voiceover(
        doc,
        "Open Finance from the ribbon. Review Finance Dashboard, Payment List, Payment Certificates, "
        "Funding Sources Report, and Verify Certificate. Authorised users create interim or final "
        "certificates on the project Certificates tab. Generated PDFs include a QR code labelled "
        "Scan to verify this certificate. To verify: open Finance → Verify Certificate, scan the QR "
        "code or type the certificate number. Verification works without logging in.",
    )
    add_on_screen(
        doc,
        "Finance submenu; Certificates tab → PDF with QR; Verify Certificate page with valid result.",
    )
    add_table(
        doc,
        ["Screen", "Purpose"],
        [
            ["Finance Dashboard", "High-level finance KPIs"],
            ["Payment List", "Payment records and filters"],
            ["Payment Certificates", "County-wide certificate list"],
            ["Funding Sources Report", "Funding analysis"],
            ["Verify Certificate", "Confirm certificate authenticity (QR or manual)"],
        ],
    )

    # Chapter 9
    add_heading(doc, "Chapter 9 — Monitoring & Field Data (~3 min)")
    add_voiceover(
        doc,
        "Select Monitoring for implementation follow-up. Use Monitoring Visits, PMC Ward Reports, "
        "Ward Accountability, Checklists & visits, Evaluation Workbench, and Stakeholder feedback. "
        "Field staff download the Mobile Field Collector from Dashboard → Mobile app (Android), sign in, "
        "sync checklists, select a project, complete the form, and submit — offline if needed.",
    )
    add_on_screen(
        doc,
        "Monitoring menu; Checklists & visits template; Mobile app download page; phone with collector app.",
    )

    # Chapter 10
    add_heading(doc, "Chapter 10 — Procurement & Data (~2 min)")
    add_voiceover(
        doc,
        "Procurement tracks cases from planning through award: Project Procurement, Budget Procurement "
        "Intake, Procured Projects, and Contractor Registry. Data supports Import Data with template "
        "preview and validation, Data Import Logs, and Beneficiary Registry. Always fix validation "
        "errors before confirming an import.",
    )
    add_on_screen(doc, "Project Procurement stages; Import Data template download and preview.")

    # Chapter 11
    add_heading(doc, "Chapter 11 — Reports (~2 min)")
    add_voiceover(
        doc,
        "Open Reports and start at Reports hub — a searchable index of standard county reports. Set "
        "filters, review totals, and export. Use Report Library for approved archives and Scheduled "
        "Reports for recurring email delivery. Built-in reports (Reports hub) use county templates; "
        "AI Professional Reports (sparkle button) produce Word/PDF drafts from the current screen.",
    )
    add_on_screen(doc, "Reports hub search; open one report with filters and export.")
    add_bullets(
        doc,
        [
            "County Operations, APR Reports, Status Report, Absorption Report",
            "Pending Bills, Project Finance Overview, Yearly Trends",
            "Budget Justification, Reporting Template (Word), PMC Ward Reports",
        ],
    )

    # Chapter 12
    add_heading(doc, "Chapter 12 — Public Portal (~1 min)")
    add_voiceover(
        doc,
        "Staff with permission use Public Approval to release projects for the citizen dashboard, "
        "moderate feedback, and manage announcements. Only approved content appears on public pages.",
    )
    add_on_screen(doc, "Public menu → Public Approval (brief).")

    # Chapter 13
    add_heading(doc, "Chapter 13 — Roles, Scope & Getting Help (~1 min)")
    add_voiceover(
        doc,
        "What you can see and do depends on your role and organisation scope. When something seems wrong, "
        "clear filters, confirm role and scope, open Help & Support or ask the AI Assistant, then contact "
        "ICT with the module name, error message, and a screenshot (no passwords).",
    )
    add_table(
        doc,
        ["Role", "Typical focus"],
        [
            ["County leadership", "Dashboards, Reports hub, AI summaries"],
            ["Department focal persons", "Projects, progress, evidence, department reports"],
            ["Planning", "CIDP/ADP, RRI, budget traceability"],
            ["M&E", "Monitoring, PMC, checklists, evaluation"],
            ["Finance", "Payments, certificates, verification, pending bills"],
            ["Procurement", "Stages, contractors, procured projects"],
            ["Field collectors", "Mobile app, offline visits"],
            ["ICT / Admin", "Users, metadata, audit trail, mobile releases"],
        ],
    )

    # Chapter 14
    add_heading(doc, "Chapter 14 — Conclusion (~1 min)")
    add_voiceover(
        doc,
        "You have now seen how to log in and navigate E-CIMES; use dashboards; manage projects, planning, "
        "and finance including certificate verification; record monitoring data and use the mobile field "
        "collector; generate built-in reports and AI professional reports; and find help through Help & "
        "Support and the AI Assistant. Continue exploring modules relevant to your role. Thank you for watching.",
    )
    add_on_screen(doc, "Help & Support link, ICT contact, county logo.")

    # Production notes
    add_heading(doc, "Production Notes (for video team)")
    add_table(
        doc,
        ["Item", "Suggestion"],
        [
            ["Length", "~20 min single video, or Part 1 (Ch 1–5, 11) + Part 2 (Ch 6–10)"],
            ["Demo account", "Role with broad read access; blur sensitive names if needed"],
            ["Must-demo", "QR certificate verify, AI sparkle button, Reports hub, mobile APK"],
            ["Captions", "On-screen labels for menu paths e.g. Finance → Verify Certificate"],
            ["B-roll", "GIS map, checklist form on phone, PDF with QR code"],
        ],
    )

    return doc


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = build_document()
    doc.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
