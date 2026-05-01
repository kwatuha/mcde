import * as XLSX from 'xlsx';

const numOrEmpty = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

const setAutofilter = (ws) => {
  if (!ws['!ref']) return;
  ws['!autofilter'] = { ref: ws['!ref'] };
};

/**
 * Builds a multi-sheet workbook for the current CIDP / strategic plan and triggers download.
 * @param {object} params
 * @param {object} params.strategicPlan
 * @param {object[]} params.programs
 * @param {object[]} params.subprograms
 */
export function downloadStrategicPlanExcel({ strategicPlan, programs = [], subprograms = [] }) {
  const planTitle =
    strategicPlan?.cidpName ||
    strategicPlan?.planName ||
    strategicPlan?.cidpid ||
    'strategic_plan';

  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ['CIDP / Strategic Plan — Excel export'],
    ['Generated (UTC)', new Date().toISOString().replace('T', ' ').slice(0, 19)],
    [],
    ['Field', 'Value'],
    ['Internal ID', strategicPlan?.id ?? strategicPlan?.planId ?? ''],
    ['CIDP ID', strategicPlan?.cidpid ?? ''],
    ['Plan / CIDP name', strategicPlan?.cidpName || strategicPlan?.planName || ''],
    ['Description', strategicPlan?.description ?? ''],
    ['Start date', strategicPlan?.startDate ?? ''],
    ['End date', strategicPlan?.endDate ?? ''],
    ['Start year', strategicPlan?.startYear ?? ''],
    ['End year', strategicPlan?.endYear ?? ''],
    ['Vision', strategicPlan?.vision ?? ''],
    ['Mission', strategicPlan?.mission ?? ''],
    ['Programs count', programs.length],
    ['Sub-programs count', subprograms.length],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 62 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Plan summary');

  const progHeaders = [
    'Program ID',
    'KRA code',
    'Key Result Area (program)',
    'Description',
    'Needs & priorities',
    'Strategies',
    'Objectives',
    'Outcomes',
    'Remarks',
    'Department ID',
    'Section ID',
  ];

  const progData = programs.map((p) => [
    p.programId ?? '',
    p.programCode ?? '',
    p.programme ?? '',
    p.description ?? '',
    p.needsPriorities ?? '',
    p.strategies ?? '',
    p.objectives ?? '',
    p.outcomes ?? '',
    p.remarks ?? '',
    p.departmentId ?? '',
    p.sectionId ?? '',
  ]);

  const wsPrograms = XLSX.utils.aoa_to_sheet([progHeaders, ...progData]);
  wsPrograms['!cols'] = progHeaders.map((_, i) => ({ wch: i === 3 || i === 4 || i === 5 || i === 6 || i === 7 ? 36 : 18 }));
  if (progData.length > 0) setAutofilter(wsPrograms);
  XLSX.utils.book_append_sheet(wb, wsPrograms, 'Programs (KRAs)');

  const programOrder = new Map(programs.map((p, i) => [p.programId, i]));
  const progById = new Map(programs.map((p) => [p.programId, p]));

  const subsSorted = [...subprograms].sort((a, b) => {
    const oa = programOrder.get(a.programId) ?? 9999;
    const ob = programOrder.get(b.programId) ?? 9999;
    if (oa !== ob) return oa - ob;
    return (Number(a.subProgramId) || 0) - (Number(b.subProgramId) || 0);
  });

  const subHeaders = [
    'CIDP ID',
    'Program (KRA)',
    'Program ID',
    'Sub-program ID',
    'Sub-program',
    'Key outcome',
    'KPI',
    'Unit of measure',
    'Baseline',
    'Year 1 target',
    'Year 2 target',
    'Year 3 target',
    'Year 4 target',
    'Year 5 target',
    'Year 1 budget (KES)',
    'Year 2 budget (KES)',
    'Year 3 budget (KES)',
    'Year 4 budget (KES)',
    'Year 5 budget (KES)',
    'Total budget (KES)',
    'Remarks',
  ];

  const cidpId = strategicPlan?.cidpid ?? '';

  const subRows = subsSorted.map((s) => {
    const prog = progById.get(s.programId);
    return [
      cidpId,
      prog?.programme ?? '',
      s.programId ?? '',
      s.subProgramId ?? '',
      s.subProgramme ?? '',
      s.keyOutcome ?? '',
      s.kpi ?? '',
      s.unitOfMeasure ?? '',
      s.baseline ?? '',
      s.yr1Targets ?? '',
      s.yr2Targets ?? '',
      s.yr3Targets ?? '',
      s.yr4Targets ?? '',
      s.yr5Targets ?? '',
      numOrEmpty(s.yr1Budget),
      numOrEmpty(s.yr2Budget),
      numOrEmpty(s.yr3Budget),
      numOrEmpty(s.yr4Budget),
      numOrEmpty(s.yr5Budget),
      numOrEmpty(s.totalBudget),
      s.remarks ?? '',
    ];
  });

  const wsSub = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
  wsSub['!cols'] = subHeaders.map((_, i) => {
    if (i === 1 || i === 5 || i === 6) return { wch: 32 };
    if (i >= 9 && i <= 13) return { wch: 14 };
    if (i >= 14 && i <= 19) return { wch: 16 };
    return { wch: 14 };
  });
  if (subRows.length > 0) setAutofilter(wsSub);
  XLSX.utils.book_append_sheet(wb, wsSub, 'Sub-programs');

  const slug = String(planTitle)
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 72);
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `CIDP_export_${slug || 'plan'}_${dateStr}.xlsx`);
}
