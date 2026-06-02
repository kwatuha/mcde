import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  GlobalStyles,
  Grid,
  LinearProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import {
  AccountTree as AccountTreeIcon,
  Business as BusinessIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Print as PrintIcon,
  TrendingUp as TrendingUpIcon,
  WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import projectService from '../api/projectService';
import { drawCountyOfficialHeader, getCountyLogoDataUrl, getCountyOfficialName } from '../utils/countyOfficialPdfHeader';
import { printElementInNewWindow } from '../utils/printWindow';
import countyLogoUrl from '../assets/gpris.png';

const currency = (value) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const shortCurrency = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000_000) return `KES ${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString('en-KE')}`;
};

const percent = (value) => `${Number(value || 0).toFixed(1)}%`;

const clean = (value) => String(value ?? '').trim();

const departmentOf = (project) =>
  clean(
    project?.departmentAlias ||
      project?.departmentName ||
      project?.ministryName ||
      project?.ministry ||
      project?.department
  ) || 'Unspecified Department';

const unitOf = (project) =>
  clean(
    project?.stateDepartment ||
      project?.stateDepartmentName ||
      project?.sectionName ||
      project?.directorate ||
      project?.directorateName ||
      project?.implementingAgency ||
      project?.agencyName ||
      project?.agency
  ) || 'Unspecified Unit';

const statusOf = (project) => clean(project?.status || project?.Status || project?.projectStatus) || 'Unknown';

const isCompletedStatus = (status) => /complete|completed|closed/i.test(status);
const isAttentionStatus = (status) => /delay|stalled|suspend|terminated|cancel/i.test(status);

const DepartmentalReportsPage = () => {
  const navigate = useNavigate();
  const countyName = getCountyOfficialName();
  const [activeTab, setActiveTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await projectService.projects.getProjects({ limit: 5000 });
        setRows(Array.isArray(data) ? data : []);
      } catch {
        setRows([]);
        setError('Failed to load departmental report data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const normalized = useMemo(
    () =>
      rows.map((project) => {
        const budget = Number(project?.costOfProject ?? project?.cost_of_project ?? project?.budget ?? 0) || 0;
        const contracted = Number(project?.Contracted ?? project?.contracted ?? project?.contractSum ?? 0) || 0;
        const paid = Number(project?.paidOut ?? project?.paid_out ?? project?.Paid ?? project?.Disbursed ?? 0) || 0;
        const status = statusOf(project);
        const progress = Math.max(
          0,
          Math.min(100, Number(project?.overallProgress ?? project?.physicalProgress ?? project?.progress ?? 0) || 0)
        );
        return {
          id: project?.id || project?.projectId,
          name: clean(project?.projectName || project?.name || project?.project_name) || 'Untitled Project',
          department: departmentOf(project),
          unit: unitOf(project),
          status,
          financialYear: clean(project?.financialYearName || project?.financialYear || project?.financial_year) || 'Unspecified',
          budget,
          contracted,
          paid,
          progress,
          completed: isCompletedStatus(status),
          attention: isAttentionStatus(status),
        };
      }),
    [rows]
  );

  const buildSummaryRows = useCallback((scope) => {
    const useUnitScope = scope === 'unit';
    const map = new Map();
    for (const project of normalized) {
      const key = useUnitScope ? `${project.department}__${project.unit}` : project.department;
      const current =
        map.get(key) ||
        {
          department: project.department,
          unit: useUnitScope ? project.unit : '',
          label: useUnitScope ? project.unit : project.department,
          projectCount: 0,
          totalBudget: 0,
          contracted: 0,
          paid: 0,
          progressSum: 0,
          completedCount: 0,
          attentionCount: 0,
          financialYears: new Set(),
        };
      current.projectCount += 1;
      current.totalBudget += project.budget;
      current.contracted += project.contracted;
      current.paid += project.paid;
      current.progressSum += project.progress;
      current.completedCount += project.completed ? 1 : 0;
      current.attentionCount += project.attention ? 1 : 0;
      current.financialYears.add(project.financialYear);
      map.set(key, current);
    }

    return [...map.values()]
      .map((row) => ({
        ...row,
        absorptionRate: row.totalBudget > 0 ? (row.paid / row.totalBudget) * 100 : 0,
        contractRate: row.totalBudget > 0 ? (row.contracted / row.totalBudget) * 100 : 0,
        completionRate: row.projectCount > 0 ? (row.completedCount / row.projectCount) * 100 : 0,
        avgProgress: row.projectCount > 0 ? row.progressSum / row.projectCount : 0,
        financialYearCount: row.financialYears.size,
      }))
      .sort((a, b) => b.projectCount - a.projectCount);
  }, [normalized]);

  const departmentRows = useMemo(() => buildSummaryRows('department'), [buildSummaryRows]);
  const unitRows = useMemo(() => buildSummaryRows('unit'), [buildSummaryRows]);

  const totals = useMemo(() => {
    const totalBudget = normalized.reduce((sum, project) => sum + project.budget, 0);
    const totalContracted = normalized.reduce((sum, project) => sum + project.contracted, 0);
    const totalPaid = normalized.reduce((sum, project) => sum + project.paid, 0);
    return {
      departments: departmentRows.length,
      units: unitRows.length,
      projects: normalized.length,
      totalBudget,
      totalContracted,
      totalPaid,
      absorptionRate: totalBudget > 0 ? (totalPaid / totalBudget) * 100 : 0,
      contractRate: totalBudget > 0 ? (totalContracted / totalBudget) * 100 : 0,
      completionRate: normalized.length > 0 ? (normalized.filter((project) => project.completed).length / normalized.length) * 100 : 0,
      attentionProjects: normalized.filter((project) => project.attention).length,
    };
  }, [departmentRows.length, normalized, unitRows.length]);

  const scopeRows = activeTab === 1 ? unitRows : departmentRows;
  const scopeLabel = activeTab === 1 ? 'Unit' : 'Department';
  const chartRows = scopeRows.slice(0, activeTab === 1 ? 12 : 10);
  const maxProjects = Math.max(1, ...chartRows.map((row) => row.projectCount || 0));
  const maxBudget = Math.max(1, ...chartRows.map((row) => row.totalBudget || 0));

  const executiveInsights = useMemo(() => {
    const byBudget = [...departmentRows].sort((a, b) => b.totalBudget - a.totalBudget);
    const topBudget = byBudget[0] || null;
    const topThreeBudget = byBudget.slice(0, 3).reduce((sum, row) => sum + row.totalBudget, 0);
    const lowAbsorption = [...departmentRows]
      .filter((row) => row.totalBudget > 0 && row.absorptionRate < 30)
      .sort((a, b) => a.absorptionRate - b.absorptionRate)
      .slice(0, 5);
    const attention = [...departmentRows]
      .filter((row) => row.attentionCount > 0)
      .sort((a, b) => b.attentionCount - a.attentionCount || b.totalBudget - a.totalBudget)
      .slice(0, 5);
    const bestAbsorption = [...departmentRows]
      .filter((row) => row.totalBudget > 0)
      .sort((a, b) => b.absorptionRate - a.absorptionRate)[0] || null;

    return {
      topBudget,
      topThreeBudgetShare: totals.totalBudget > 0 ? (topThreeBudget / totals.totalBudget) * 100 : 0,
      lowAbsorption,
      attention,
      bestAbsorption,
    };
  }, [departmentRows, totals.totalBudget]);

  const openRegistry = (row) => {
    if (!row) return;
    const params = new URLSearchParams();
    if (row.department && row.department !== 'Unspecified Department') {
      params.set('departmentName', row.department);
    }
    const query = params.toString();
    navigate(query ? `/projects?${query}` : '/projects');
  };

  const addPdfTable = (doc, title, tableRows, startY, isUnitScope = false) => {
    let y = startY;
    doc.setFont('helvetica', 'bold').setFontSize(11).text(title, 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [
        isUnitScope
          ? ['Unit', 'Department', 'Projects', 'Budget', 'Contracted', 'Paid', 'Absorption', 'Attention']
          : ['Department', 'Projects', 'Budget', 'Contracted', 'Paid', 'Absorption', 'Attention'],
      ],
      body: tableRows.map((row) => [
        row.label,
        ...(isUnitScope ? [row.department] : []),
        row.projectCount,
        currency(row.totalBudget),
        currency(row.contracted),
        currency(row.paid),
        percent(row.absorptionRate),
        row.attentionCount,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [25, 118, 210], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    return doc.lastAutoTable.finalY + 8;
  };

  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const logoDataUrl = await getCountyLogoDataUrl();
    let y = drawCountyOfficialHeader(doc, {
      title: 'Departmental Performance Report',
      subtitle: 'Department and implementation unit overview',
      logoDataUrl,
    });

    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(80);
    doc.text(
      `Generated: ${new Date().toLocaleString('en-KE')} | Projects: ${totals.projects} | Departments: ${totals.departments} | Units: ${totals.units}`,
      14,
      y
    );
    y += 7;
    autoTable(doc, {
      startY: y,
      head: [['Total Budget', 'Contracted', 'Paid', 'Absorption', 'Completion', 'Attention Projects']],
      body: [[currency(totals.totalBudget), currency(totals.totalContracted), currency(totals.totalPaid), percent(totals.absorptionRate), percent(totals.completionRate), totals.attentionProjects]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
    y = addPdfTable(doc, 'Department Breakdown', departmentRows, y);
    doc.addPage();
    addPdfTable(doc, 'Implementation Unit Breakdown', unitRows, 18, true);

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 28, doc.internal.pageSize.getHeight() - 8);
    }
    doc.save(`departmental-performance-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const printReport = () => {
    const printArea = document.getElementById('departmental-reports-print-area');
    printElementInNewWindow({
      element: printArea,
      title: 'Departmental Performance Report',
      removeSelectors: ['.departmental-report-no-print'],
      fallback: () => window.print(),
      extraStyles: `
        @page { size: landscape; margin: 10mm; }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          background: #ffffff !important;
          color: #111827 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        #departmental-reports-print-area {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        .departmental-report-no-print,
        .departmental-report-screen-header,
        .MuiTabs-root {
          display: none !important;
        }
        .departmental-report-print-header {
          display: block !important;
          margin-bottom: 6mm !important;
          padding-bottom: 4mm !important;
          border-bottom: 1px solid #cbd5e1 !important;
        }
        .departmental-report-print-header img {
          width: 54px !important;
          height: 54px !important;
        }
        .MuiPaper-root {
          box-shadow: none !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
          margin-bottom: 6px !important;
          border-radius: 4px !important;
        }
        .MuiTableCell-root {
          padding: 3px 6px !important;
          font-size: 9px !important;
        }
        .MuiTypography-root {
          line-height: 1.2 !important;
        }
      `,
    });
  };

  const chartCardSx = {
    p: { xs: 1.5, md: 2.25 },
    borderRadius: 2.5,
    height: '100%',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
    background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
  };

  const renderCharts = () => (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2, mb: 2.5 }}>
      <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
        <Paper variant="outlined" sx={chartCardSx}>
          <Typography variant="subtitle1" fontWeight={850}>Budget vs Paid by {scopeLabel}</Typography>
          <Typography variant="body2" color="text.secondary">Allocation and absorption visibility</Typography>
          <Box sx={{ display: 'grid', gap: 1.15, mt: 1.5 }}>
            {chartRows.map((row) => {
              const budgetWidth = Math.max(2, (row.totalBudget / maxBudget) * 100);
              const paidWidth = Math.max(2, (row.paid / maxBudget) * 100);
              return (
                <Box key={`budget-${row.department}-${row.label}`}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.35 }}>
                    <Typography variant="body2" title={row.label} sx={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.label}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: '#1976d2', flexShrink: 0 }}>
                      {shortCurrency(row.totalBudget)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 0.45 }}>
                    <Box sx={{ height: 9, borderRadius: 999, bgcolor: 'rgba(25, 118, 210, 0.10)', overflow: 'hidden' }}>
                      <Box sx={{ width: `${budgetWidth}%`, height: '100%', bgcolor: '#1976d2', borderRadius: 999 }} />
                    </Box>
                    <Box sx={{ height: 9, borderRadius: 999, bgcolor: 'rgba(46, 125, 50, 0.12)', overflow: 'hidden' }}>
                      <Box sx={{ width: `${paidWidth}%`, height: '100%', bgcolor: '#2e7d32', borderRadius: 999 }} />
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5 }}>
            <Chip size="small" label="Budget" sx={{ bgcolor: 'rgba(25, 118, 210, 0.10)', color: '#1976d2', fontWeight: 700 }} />
            <Chip size="small" label="Paid" sx={{ bgcolor: 'rgba(46, 125, 50, 0.12)', color: '#2e7d32', fontWeight: 700 }} />
          </Box>
        </Paper>
      </Box>
      <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
        <Paper variant="outlined" sx={chartCardSx}>
          <Typography variant="subtitle1" fontWeight={850}>Projects by {scopeLabel}</Typography>
          <Typography variant="body2" color="text.secondary">Workload distribution</Typography>
          <Box sx={{ display: 'grid', gap: 1.35, mt: 2 }}>
            {chartRows.map((row) => {
              const width = Math.max(2, (row.projectCount / maxProjects) * 100);
              return (
                <Box key={`projects-${row.department}-${row.label}`}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.45 }}>
                    <Typography variant="body2" title={row.label} sx={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#1976d2', flexShrink: 0 }}>{row.projectCount}</Typography>
                  </Box>
                  <Box sx={{ height: 14, borderRadius: 999, bgcolor: 'rgba(25, 118, 210, 0.10)', overflow: 'hidden' }}>
                    <Box sx={{ width: `${width}%`, height: '100%', bgcolor: '#1976d2', borderRadius: 999 }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      </Box>
      <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
        <Paper variant="outlined" sx={chartCardSx}>
          <Typography variant="subtitle1" fontWeight={850}>Absorption by {scopeLabel}</Typography>
          <Typography variant="body2" color="text.secondary">Paid amount as a percentage of budget</Typography>
          <Box sx={{ display: 'grid', gap: 1.35, mt: 2 }}>
            {chartRows.map((row) => {
              const value = Math.max(0, Math.min(100, row.absorptionRate));
              return (
                <Box key={`absorption-${row.department}-${row.label}`}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.45 }}>
                    <Typography variant="body2" title={row.label} sx={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#f57c00', flexShrink: 0 }}>{percent(value)}</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={value}
                    sx={{ height: 14, borderRadius: 999, bgcolor: 'rgba(245, 124, 0, 0.12)', '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: '#f57c00' } }}
                  />
                </Box>
              );
            })}
          </Box>
        </Paper>
      </Box>
    </Box>
  );

  return (
    <>
      <GlobalStyles
        styles={{
          '@media print': {
            'html, body, #root': { width: '100% !important', height: 'auto !important', margin: '0 !important', padding: '0 !important', overflow: 'visible !important' },
            '.mcmes-app-main': { width: '100% !important', marginLeft: '0 !important', marginTop: '0 !important', padding: '0 !important', minHeight: 'auto !important', display: 'block !important' },
            '.mcmes-app-main > .MuiBox-root': { padding: '0 !important', overflow: 'visible !important' },
            '.MuiAppBar-root, .MuiDrawer-root, .MuiModal-root, .MuiBackdrop-root': { display: 'none !important' },
            'body *': { visibility: 'hidden !important' },
            '#departmental-reports-print-area, #departmental-reports-print-area *': { visibility: 'visible !important' },
            '#departmental-reports-print-area': { position: 'static !important', width: '100% !important', maxWidth: '100% !important', margin: '0 !important', padding: '0 !important', background: '#ffffff !important', color: '#111827 !important' },
            '#departmental-reports-print-area .departmental-report-no-print, #departmental-reports-print-area .departmental-report-screen-header': { display: 'none !important' },
            '#departmental-reports-print-area .departmental-report-print-header': { display: 'block !important', marginBottom: '6mm !important', paddingBottom: '4mm !important' },
            '#departmental-reports-print-area .MuiTabs-root': { display: 'none !important' },
            '#departmental-reports-print-area .MuiPaper-root': { boxShadow: 'none !important', breakInside: 'auto !important', pageBreakInside: 'auto !important', marginBottom: '6px !important' },
            '#departmental-reports-print-area .MuiTableCell-root': { padding: '3px 6px !important', fontSize: '9px !important' },
          },
          '@page': { size: 'landscape', margin: '10mm' },
        }}
      />
      <Box id="departmental-reports-print-area" sx={{ p: { xs: 1, sm: 1.5 }, width: '100%' }}>
        <Box
          className="departmental-report-print-header"
          sx={{ display: 'none', textAlign: 'center', mb: 2, pb: 1.5, borderBottom: '1px solid #cbd5e1' }}
        >
          <Box component="img" src={countyLogoUrl} alt="" sx={{ width: 58, height: 58, objectFit: 'contain', mb: 0.5 }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: 0.4 }}>REPUBLIC OF KENYA</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: 0.4 }}>{countyName}</Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', mt: 0.75 }}>DEPARTMENTAL PERFORMANCE REPORT</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#475569', mt: 0.35 }}>
            Department and implementation unit overview · Generated {new Date().toLocaleString('en-KE')}
          </Typography>
        </Box>

        <Paper
          className="departmental-report-screen-header"
          elevation={0}
          sx={{
            p: 2,
            mb: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)'
                : 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%)',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 1.5 }}>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ fontSize: { xs: '1rem', sm: '1.15rem' } }}>
                Departmental Performance Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Executive view of project delivery across departments and implementation units
              </Typography>
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                <Chip size="small" label={`Departments: ${totals.departments}`} color="primary" variant="outlined" />
                <Chip size="small" label={`Units: ${totals.units}`} color="primary" variant="outlined" />
                <Chip size="small" label={`Projects: ${totals.projects}`} color="primary" variant="outlined" />
              </Box>
            </Box>
            <Box className="departmental-report-no-print" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={printReport}>
                Print
              </Button>
              <Button size="small" variant="contained" startIcon={<PictureAsPdfIcon />} onClick={exportPdf} disabled={loading || rows.length === 0}>
                Export All
              </Button>
            </Box>
          </Box>
        </Paper>

        <Paper sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }} elevation={0}>
          <Tabs
            value={activeTab}
            onChange={(_, next) => setActiveTab(next)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider', background: 'linear-gradient(to right, rgba(25, 118, 210, 0.05), transparent)', '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 44 } }}
          >
            <Tab icon={<BusinessIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Departments" />
            <Tab icon={<AccountTreeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Implementation units" />
          </Tabs>

          <Box sx={{ p: { xs: 1.5, md: 2 }, backgroundColor: 'background.default' }}>
            <Grid container spacing={1} sx={{ mb: 1.25 }}>
              {[
                ['Total Budget', currency(totals.totalBudget)],
                ['Contracted', currency(totals.totalContracted)],
                ['Paid', currency(totals.totalPaid)],
                ['Absorption', percent(totals.absorptionRate)],
              ].map(([label, value]) => (
                <Grid item xs={12} sm={6} md={3} key={label}>
                  <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="subtitle2" fontWeight={800}>{value}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {loading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={26} />
              </Box>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : (
              <>
                {renderCharts()}
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                  <Table size="small">
                    <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                      <TableRow>
                        <TableCell>{scopeLabel}</TableCell>
                        {activeTab === 1 && <TableCell>Department</TableCell>}
                        <TableCell align="right">Projects</TableCell>
                        <TableCell align="right">Budget</TableCell>
                        <TableCell align="right">Contracted</TableCell>
                        <TableCell align="right">Paid</TableCell>
                        <TableCell align="right">Absorption</TableCell>
                        <TableCell align="right">Completion</TableCell>
                        <TableCell align="right">Attention</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {scopeRows.map((row) => (
                        <TableRow key={`${row.department}-${row.label}`} hover onClick={() => openRegistry(row)} sx={{ cursor: 'pointer' }}>
                          <TableCell>{row.label}</TableCell>
                          {activeTab === 1 && <TableCell>{row.department}</TableCell>}
                          <TableCell align="right">{row.projectCount}</TableCell>
                          <TableCell align="right">{currency(row.totalBudget)}</TableCell>
                          <TableCell align="right">{currency(row.contracted)}</TableCell>
                          <TableCell align="right">{currency(row.paid)}</TableCell>
                          <TableCell align="right">{percent(row.absorptionRate)}</TableCell>
                          <TableCell align="right">{percent(row.completionRate)}</TableCell>
                          <TableCell align="right">{row.attentionCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={800}>Executive Insights</Typography>
          <Typography variant="caption" color="text.secondary">Signals to support executive review and follow-up.</Typography>
          <Grid container spacing={1} sx={{ mt: 0.5, mb: 1.25 }}>
            <Grid item xs={12} md={3}>
              <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, height: '100%' }}>
                <TrendingUpIcon sx={{ color: '#1976d2', fontSize: 20 }} />
                <Typography variant="caption" color="text.secondary" display="block">Highest budget department</Typography>
                <Typography variant="subtitle2" fontWeight={800}>{executiveInsights.topBudget?.label || 'N/A'}</Typography>
                <Typography variant="caption">{shortCurrency(executiveInsights.topBudget?.totalBudget || 0)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, height: '100%' }}>
                <Typography variant="caption" color="text.secondary">Top 3 budget concentration</Typography>
                <Typography variant="subtitle2" fontWeight={800}>{percent(executiveInsights.topThreeBudgetShare)}</Typography>
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, executiveInsights.topThreeBudgetShare))} sx={{ mt: 0.75, height: 7, borderRadius: 999 }} />
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, height: '100%' }}>
                <WarningAmberIcon sx={{ color: '#f57c00', fontSize: 20 }} />
                <Typography variant="caption" color="text.secondary" display="block">Attention projects</Typography>
                <Typography variant="subtitle2" fontWeight={800}>{totals.attentionProjects}</Typography>
                <Typography variant="caption">Delayed, stalled, suspended, or cancelled</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, height: '100%' }}>
                <Typography variant="caption" color="text.secondary">Best absorption</Typography>
                <Typography variant="subtitle2" fontWeight={800}>{executiveInsights.bestAbsorption?.label || 'N/A'}</Typography>
                <Typography variant="caption">{percent(executiveInsights.bestAbsorption?.absorptionRate || 0)}</Typography>
              </Paper>
            </Grid>
          </Grid>

          <Grid container spacing={1.5}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.75 }}>Low Absorption Departments</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <TableRow>
                      <TableCell>Department</TableCell>
                      <TableCell align="right">Budget</TableCell>
                      <TableCell align="right">Absorption</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {executiveInsights.lowAbsorption.map((row) => (
                      <TableRow key={`low-${row.label}`}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell align="right">{currency(row.totalBudget)}</TableCell>
                        <TableCell align="right">{percent(row.absorptionRate)}</TableCell>
                      </TableRow>
                    ))}
                    {executiveInsights.lowAbsorption.length === 0 && (
                      <TableRow><TableCell colSpan={3} align="center">No low absorption departments detected.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.75 }}>Departments Needing Follow-up</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <TableRow>
                      <TableCell>Department</TableCell>
                      <TableCell align="right">Attention Projects</TableCell>
                      <TableCell align="right">Budget</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {executiveInsights.attention.map((row) => (
                      <TableRow key={`attention-${row.label}`}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell align="right">{row.attentionCount}</TableCell>
                        <TableCell align="right">{currency(row.totalBudget)}</TableCell>
                      </TableRow>
                    ))}
                    {executiveInsights.attention.length === 0 && (
                      <TableRow><TableCell colSpan={3} align="center">No delayed/stalled department signals detected.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </>
  );
};

export default DepartmentalReportsPage;
