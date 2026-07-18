export type OrgProject = {
  id: number;
  projectName: string;
  status: string;
  budget: number;
  disbursed: number;
  departmentName: string;
  subCounty: string;
  ward: string;
  sector: string;
  percentageComplete: number;
  financialYear?: string;
};

export type ExecutiveBrief = {
  totalProjects: number;
  deliveryHealth: number;
  completionRate: number;
  atRiskCount: number;
  pipelineCount: number;
  totalBudget: number;
  totalDisbursed: number;
  disbursementGap: number;
  absorptionPct: number;
  topSubCounty: string | null;
  topSector: string | null;
  statusCounts: Array<{ status: string; count: number }>;
  departmentRows: Array<{ name: string; projects: number; budget: number; disbursed: number }>;
  regionRows: Array<{ name: string; projects: number; budget: number; disbursed: number }>;
};

const RISK = new Set(['delayed', 'stalled', 'suspended']);
const PIPELINE = new Set(['not started', 'under procurement']);
const ON_TRACK = new Set(['in progress', 'ongoing', 'completed']);

function money(n: unknown): number {
  if (n == null || n === '') return 0;
  if (typeof n === 'number') return Number.isFinite(n) ? n : 0;
  if (typeof n === 'object') return 0;
  const cleaned = String(n).replace(/,/g, '').trim();
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

function firstMoney(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (c == null || c === '') continue;
    return money(c);
  }
  return 0;
}

export function normalizeOrgProject(p: any): OrgProject {
  const id = Number(p.id ?? p.projectId ?? p.project_id);
  const budgetObj = p.budget && typeof p.budget === 'object' ? p.budget : null;
  return {
    id: Number.isFinite(id) ? id : 0,
    projectName: p.projectName || p.project_name || p.name || `Project #${id}`,
    status: String(p.status || p.Status || 'Unknown').trim() || 'Unknown',
    budget: firstMoney(
      p.allocatedBudget,
      budgetObj?.allocated_amount_kes,
      typeof p.budget === 'number' || typeof p.budget === 'string' ? p.budget : null,
      p.costOfProject,
      p.allocated_amount_kes
    ),
    disbursed: firstMoney(
      p.disbursedBudget,
      p.Disbursed,
      p.paidOut,
      p.totalPaid,
      budgetObj?.disbursed_amount_kes,
      p.disbursed_amount_kes
    ),
    departmentName:
      String(p.departmentName ?? p.department ?? p.ministry ?? p.ministryName ?? '').trim() ||
      'Unspecified',
    subCounty:
      String(p.SubCounty ?? p.subCounty ?? p.subcounty ?? p.subcountyNames ?? '').trim() ||
      'Unspecified',
    ward: String(p.ward ?? p.wardNames ?? '').trim() || 'Unspecified',
    sector:
      String(p.sector ?? p.categoryName ?? p.department ?? p.ministry ?? '').trim() || 'Unspecified',
    percentageComplete: money(p.percentageComplete ?? p.overallProgress),
    financialYear: p.financialYear || p.financialYearName || undefined,
  };
}

function aggregate(
  projects: OrgProject[],
  keyFn: (p: OrgProject) => string
): Array<{ name: string; projects: number; budget: number; disbursed: number }> {
  const map = new Map<string, { name: string; projects: number; budget: number; disbursed: number }>();
  for (const p of projects) {
    const name = keyFn(p) || 'Unspecified';
    const row = map.get(name) || { name, projects: 0, budget: 0, disbursed: 0 };
    row.projects += 1;
    row.budget += p.budget;
    row.disbursed += p.disbursed;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.projects - a.projects || b.budget - a.budget);
}

export function buildExecutiveBrief(projects: OrgProject[]): ExecutiveBrief {
  const totalProjects = projects.length;
  const denom = Math.max(totalProjects, 1);
  const atRiskCount = projects.filter((p) => RISK.has(p.status.toLowerCase())).length;
  const pipelineCount = projects.filter((p) => PIPELINE.has(p.status.toLowerCase())).length;
  const onTrackCount = projects.filter((p) => ON_TRACK.has(p.status.toLowerCase())).length;
  const completedCount = projects.filter((p) => p.status.toLowerCase() === 'completed').length;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalDisbursed = projects.reduce((s, p) => s + p.disbursed, 0);
  const statusMap = new Map<string, number>();
  for (const p of projects) {
    statusMap.set(p.status, (statusMap.get(p.status) || 0) + 1);
  }
  const departmentRows = aggregate(projects, (p) => p.departmentName);
  const regionRows = aggregate(projects, (p) => p.subCounty);
  const sectorRows = aggregate(projects, (p) => p.sector);

  return {
    totalProjects,
    deliveryHealth: Math.round((onTrackCount / denom) * 100),
    completionRate: Math.round((completedCount / denom) * 100),
    atRiskCount,
    pipelineCount,
    totalBudget,
    totalDisbursed,
    disbursementGap: Math.max(0, totalBudget - totalDisbursed),
    absorptionPct: totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0,
    topSubCounty: regionRows[0]?.name && regionRows[0].name !== 'Unspecified' ? regionRows[0].name : null,
    topSector: sectorRows[0]?.name && sectorRows[0].name !== 'Unspecified' ? sectorRows[0].name : null,
    statusCounts: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    departmentRows: departmentRows.slice(0, 12),
    regionRows: regionRows.slice(0, 12),
  };
}

/** Overlay county-wide finance KPIs (from /api/reports/summary-kpis) onto a brief built from a sample. */
export function applySummaryKpis(
  brief: ExecutiveBrief,
  kpis: { totalProjects?: unknown; totalBudget?: unknown; totalPaid?: unknown; totalDisbursed?: unknown } | null
): ExecutiveBrief {
  if (!kpis) return brief;
  const totalProjects = money(kpis.totalProjects) || brief.totalProjects;
  const totalBudget = money(kpis.totalBudget);
  const totalDisbursed = money(kpis.totalPaid ?? kpis.totalDisbursed);
  const hasFinance = totalBudget > 0 || totalDisbursed > 0;
  if (!hasFinance && !(money(kpis.totalProjects) > 0)) return brief;
  return {
    ...brief,
    totalProjects: totalProjects || brief.totalProjects,
    totalBudget: hasFinance ? totalBudget : brief.totalBudget,
    totalDisbursed: hasFinance ? totalDisbursed : brief.totalDisbursed,
    disbursementGap: hasFinance
      ? Math.max(0, totalBudget - totalDisbursed)
      : brief.disbursementGap,
    absorptionPct:
      hasFinance && totalBudget > 0
        ? Math.round((totalDisbursed / totalBudget) * 100)
        : brief.absorptionPct,
  };
}

export function formatKes(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  if (Math.abs(amount) >= 1_000_000_000) {
    return `KES ${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `KES ${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `KES ${(amount / 1_000).toFixed(1)}K`;
  }
  return `KES ${Math.round(amount).toLocaleString()}`;
}
