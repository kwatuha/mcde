import React, { useEffect, useMemo, useState } from 'react';
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
import { LocationOn, Map as MapIcon, PictureAsPdf as PictureAsPdfIcon, Print as PrintIcon } from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import projectService from '../api/projectService';
import { useAIPageContext } from '../context/AIPageContext.jsx';
import { getProjectWardKey } from '../utils/projectWardKey';
import { drawCountyOfficialHeader, getCountyLogoDataUrl, getCountyOfficialName } from '../utils/countyOfficialPdfHeader';
import { printElementInNewWindow } from '../utils/printWindow';
import countyLogoUrl from '../assets/gpris.png';

const currency = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const shortCurrency = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000000) return `KES ${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
  return `KES ${n.toLocaleString('en-KE')}`;
};

const fmtPercent = (v) => `${Number(v || 0).toFixed(1)}%`;

const RegionalBreakdownDashboardPage = () => {
  const navigate = useNavigate();
  const { setAIPageContext, clearAIPageContext } = useAIPageContext();
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
        // Use the same source as GIS dashboard so counts align.
        const data = await projectService.projects.getProjects();
        setRows(Array.isArray(data) ? data : []);
      } catch {
        setError('Failed to load regional dashboard data.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const normalized = useMemo(
    () =>
      rows.map((p) => ({
        subcounty:
          String(
            p?.subcountyNames ||
              p?.subcounty ||
              p?.subCounty ||
              p?.sub_county ||
              p?.SubCounty ||
              p?.Subcounty ||
              p?.division ||
              ''
          ).trim() || 'Unspecified',
        ward: getProjectWardKey(p) || 'Unspecified',
        budget: Number(p?.costOfProject ?? p?.cost_of_project ?? p?.budget ?? 0) || 0,
        paid: Number(p?.paidOut ?? p?.paid_out ?? p?.Disbursed ?? 0) || 0,
      })),
    [rows]
  );

  const subcountyRows = useMemo(() => {
    const m = new Map();
    for (const r of normalized) {
      const current = m.get(r.subcounty) || { subcounty: r.subcounty, projectCount: 0, totalBudget: 0, totalPaid: 0 };
      current.projectCount += 1;
      current.totalBudget += r.budget;
      current.totalPaid += r.paid;
      m.set(r.subcounty, current);
    }
    return [...m.values()].sort((a, b) => b.projectCount - a.projectCount);
  }, [normalized]);

  const wardRows = useMemo(() => {
    const m = new Map();
    for (const r of normalized) {
      const key = `${r.subcounty}__${r.ward}`;
      const current = m.get(key) || {
        subcounty: r.subcounty,
        ward: r.ward,
        projectCount: 0,
        totalBudget: 0,
        totalPaid: 0,
      };
      current.projectCount += 1;
      current.totalBudget += r.budget;
      current.totalPaid += r.paid;
      m.set(key, current);
    }
    return [...m.values()].sort((a, b) => b.projectCount - a.projectCount);
  }, [normalized]);

  const totals = useMemo(() => {
    const totalProjects = normalized.length;
    const totalBudget = normalized.reduce((sum, r) => sum + r.budget, 0);
    const totalPaid = normalized.reduce((sum, r) => sum + r.paid, 0);
    return {
      subcounties: subcountyRows.length,
      wards: wardRows.length,
      totalProjects,
      totalBudget,
      totalPaid,
    };
  }, [normalized, subcountyRows.length, wardRows.length]);

  useEffect(() => {
    setAIPageContext({
      pageType: 'regional-breakdown',
      screenSummary: {
        subcounties: totals.subcounties,
        wards: totals.wards,
        projects: totals.totalProjects,
        totalBudget: totals.totalBudget,
        totalPaid: totals.totalPaid,
        absorption: totals.totalBudget > 0
          ? `${((totals.totalPaid / totals.totalBudget) * 100).toFixed(1)}%`
          : '0%',
      },
      screenRows: (activeTab === 1 ? wardRows : subcountyRows).slice(0, 10).map((row) => ({
        area: activeTab === 1 ? row.ward : row.subcounty,
        subcounty: row.subcounty,
        projects: row.projectCount,
        budget: shortCurrency(row.totalBudget),
        paid: shortCurrency(row.totalPaid),
      })),
    });
    return () => clearAIPageContext();
  }, [activeTab, totals, subcountyRows, wardRows, setAIPageContext, clearAIPageContext]);

  const chartRows = useMemo(() => {
    const scopeRows = activeTab === 1 ? wardRows : subcountyRows;
    return scopeRows
      .map((r) => ({
        name: activeTab === 1 ? r.ward : r.subcounty,
        projectCount: r.projectCount,
        totalBudget: r.totalBudget,
        totalPaid: r.totalPaid,
        absorptionRate: r.totalBudget > 0 ? (r.totalPaid / r.totalBudget) * 100 : 0,
      }))
      .sort((a, b) => b.projectCount - a.projectCount)
      .slice(0, activeTab === 1 ? 12 : 10);
  }, [activeTab, subcountyRows, wardRows]);

  const distributionInsights = useMemo(() => {
    const useWardScope = activeTab === 1;
    const scopeRows = useWardScope ? wardRows : subcountyRows;
    const scopeCount = Math.max(scopeRows.length, 1);
    const idealProjectsPerScope = totals.totalProjects / scopeCount;
    const idealBudgetPerScope = totals.totalBudget / scopeCount;

    const rows = scopeRows.map((c) => {
      const projectGap = idealProjectsPerScope - c.projectCount;
      const budgetGap = idealBudgetPerScope - c.totalBudget;
      const deficitPressure =
        Math.max(projectGap, 0) * 0.6 +
        (idealBudgetPerScope > 0 ? (Math.max(budgetGap, 0) / idealBudgetPerScope) * 100 * 0.4 : 0);
      const equityScore = Math.max(0, 100 - Math.abs(projectGap) * 12);
      const scopeLabel = useWardScope ? c.ward : c.subcounty;
      return {
        ...c,
        scopeLabel,
        projectGap,
        budgetGap,
        deficitPressure,
        equityScore,
        recommendation:
          projectGap > 0.5 || budgetGap > 0
            ? 'Prioritize next allocation'
            : 'Maintain / monitor',
      };
    });

    const underServed = rows
      .filter((r) => r.projectGap > 0 || r.budgetGap > 0)
      .sort((a, b) => b.deficitPressure - a.deficitPressure)
      .slice(0, 5);

    return {
      scopeLabel: useWardScope ? 'ward' : 'sub-county',
      scopeLabelPlural: useWardScope ? 'wards' : 'sub-counties',
      idealProjectsPerScope,
      idealBudgetPerScope,
      averageEquityScore:
        rows.length > 0 ? rows.reduce((sum, r) => sum + r.equityScore, 0) / rows.length : 0,
      rows,
      underServed,
    };
  }, [activeTab, subcountyRows, wardRows, totals.totalProjects, totals.totalBudget]);

  const openRegistry = (row) => {
    if (!row) return;
    const params = new URLSearchParams();
    if (row.subcounty && row.subcounty !== 'Unspecified') {
      params.set('subcounty', row.subcounty);
    }
    if (row.ward && row.ward !== 'Unspecified') {
      params.set('ward', row.ward);
    }
    const q = params.toString();
    navigate(q ? `/projects?${q}` : '/projects');
  };

  const makePdfRows = (scope) => {
    const useWardScope = scope === 'ward';
    const sourceRows = useWardScope ? wardRows : subcountyRows;
    return sourceRows.map((row) => ({
      name: useWardScope ? row.ward : row.subcounty,
      subcounty: row.subcounty,
      projectCount: row.projectCount,
      totalBudget: row.totalBudget,
      totalPaid: row.totalPaid,
      absorptionRate: row.totalBudget > 0 ? (row.totalPaid / row.totalBudget) * 100 : 0,
    }));
  };

  const addRegionalPdfSection = (doc, title, scopeRows, startY, scope = 'subcounty') => {
    let y = startY;
    const isWardScope = scope === 'ward';
    doc.setFont('helvetica', 'bold').setFontSize(11).text(title, 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [isWardScope ? ['Ward', 'Sub-county', 'Projects', 'Budget', 'Paid', 'Absorption'] : ['Sub-county', 'Projects', 'Budget', 'Paid', 'Absorption']],
      body: scopeRows.map((row) => [
        row.name,
        ...(isWardScope ? [row.subcounty || '-'] : []),
        row.projectCount,
        currency(row.totalBudget),
        currency(row.totalPaid),
        fmtPercent(row.absorptionRate),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [25, 118, 210], textColor: 255 },
      columnStyles: isWardScope
        ? {
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
          }
        : {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
          },
      margin: { left: 14, right: 14 },
    });
    return doc.lastAutoTable.finalY + 8;
  };

  const exportPdf = async (scope = activeTab === 1 ? 'ward' : 'subcounty') => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const logoDataUrl = await getCountyLogoDataUrl();
    let y = drawCountyOfficialHeader(doc, {
      title: 'Regional Breakdown Report',
      subtitle: scope === 'all' ? 'Sub-county and ward performance' : `${scope === 'ward' ? 'Ward' : 'Sub-county'} performance`,
      logoDataUrl,
    });

    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(80);
    doc.text(
      `Generated: ${new Date().toLocaleString('en-KE')} | Projects: ${totals.totalProjects} | Sub-counties: ${totals.subcounties} | Wards: ${totals.wards}`,
      14,
      y
    );
    y += 7;
    autoTable(doc, {
      startY: y,
      head: [['Total Budget', 'Total Paid', 'Overall Absorption']],
      body: [[currency(totals.totalBudget), currency(totals.totalPaid), fmtPercent(totals.totalBudget > 0 ? (totals.totalPaid / totals.totalBudget) * 100 : 0)]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    const sections = scope === 'all'
      ? [
          ['Sub-county Breakdown', makePdfRows('subcounty'), 'subcounty'],
          ['Ward Breakdown', makePdfRows('ward'), 'ward'],
        ]
      : [[scope === 'ward' ? 'Ward Breakdown' : 'Sub-county Breakdown', makePdfRows(scope), scope]];

    sections.forEach(([title, sectionRows, sectionScope], index) => {
      if (index > 0) {
        doc.addPage();
        y = 18;
      }
      y = addRegionalPdfSection(doc, title, sectionRows, y, sectionScope);
    });

    if (distributionInsights.underServed.length > 0) {
      if (y > 150) {
        doc.addPage();
        y = 18;
      }
      doc.setFont('helvetica', 'bold').setFontSize(11).text('Priority Regions (Under-served)', 14, y);
      autoTable(doc, {
        startY: y + 5,
        head: [['Region', 'Project Gap', 'Budget Gap', 'Deficit Pressure', 'Recommendation']],
        body: distributionInsights.underServed.map((row) => [
          row.scopeLabel,
          row.projectGap.toFixed(1),
          currency(Math.max(row.budgetGap, 0)),
          row.deficitPressure.toFixed(1),
          row.recommendation,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [245, 124, 0], textColor: 255 },
        margin: { left: 14, right: 14 },
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 28, doc.internal.pageSize.getHeight() - 8);
    }

    const suffix = scope === 'all' ? 'all' : scope;
    doc.save(`regional-breakdown-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const printReport = () => {
    const printArea = document.getElementById('regional-reports-print-area');
    printElementInNewWindow({
      element: printArea,
      title: 'Regional Breakdown Report',
      removeSelectors: ['.regional-report-no-print'],
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
        #regional-reports-print-area {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        .regional-report-no-print { display: none !important; }
        .regional-report-screen-header { display: none !important; }
        .regional-report-print-header { display: block !important; }
        body *, #regional-reports-print-area, #regional-reports-print-area * {
          visibility: visible !important;
        }
        #regional-reports-print-area .MuiTabs-root {
          display: none !important;
        }
        #regional-reports-print-area .MuiTypography-root {
          line-height: 1.2 !important;
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
        .regional-report-print-header {
          margin-bottom: 6mm !important;
          padding-bottom: 4mm !important;
          border-bottom: 1px solid #cbd5e1 !important;
        }
        .regional-report-print-header img {
          width: 54px !important;
          height: 54px !important;
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

  const chartLabel = activeTab === 1 ? 'Ward' : 'Sub-county';
  const maxProjectCount = Math.max(1, ...chartRows.map((row) => row.projectCount || 0));
  const maxBudget = Math.max(1, ...chartRows.map((row) => row.totalBudget || 0));

  const renderCharts = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', lg: 'row' },
        gap: 2,
        mb: 2.5,
        width: '100%',
        alignItems: 'stretch',
      }}
    >
        <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Paper variant="outlined" sx={chartCardSx}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={850}>
                  Budget vs Paid by {chartLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Allocation and expenditure
                </Typography>
              </Box>
              <Chip size="small" color="primary" variant="outlined" label={`Top ${chartRows.length}`} />
            </Box>
            <Box sx={{ display: 'grid', gap: 1.15 }}>
              {chartRows.map((row) => {
                const budgetPercent = Math.max(2, ((row.totalBudget || 0) / maxBudget) * 100);
                const paidPercent = Math.max(2, ((row.totalPaid || 0) / maxBudget) * 100);
                return (
                  <Box key={`budget-${row.name}`}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.35 }}>
                      <Typography
                        variant="body2"
                        title={row.name}
                        sx={{ fontWeight: 650, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {row.name}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: '#1976d2', flexShrink: 0 }}>
                        {shortCurrency(row.totalBudget)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gap: 0.45 }}>
                      <Box sx={{ height: 9, borderRadius: 999, bgcolor: 'rgba(25, 118, 210, 0.10)', overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${budgetPercent}%`, borderRadius: 999, bgcolor: '#1976d2' }} />
                      </Box>
                      <Box sx={{ height: 9, borderRadius: 999, bgcolor: 'rgba(46, 125, 50, 0.12)', overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${paidPercent}%`, borderRadius: 999, bgcolor: '#2e7d32' }} />
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

        <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Paper variant="outlined" sx={chartCardSx}>
            <Typography variant="subtitle1" fontWeight={850}>
              Projects by {chartLabel}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Project volume distribution
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.35, mt: 2 }}>
              {chartRows.map((row) => {
                const value = row.projectCount || 0;
                const percent = Math.max(2, (value / maxProjectCount) * 100);
                return (
                  <Box key={`projects-${row.name}`}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.45 }}>
                      <Typography
                        variant="body2"
                        title={row.name}
                        sx={{ fontWeight: 650, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {row.name}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#1976d2', flexShrink: 0 }}>
                        {value}
                      </Typography>
                    </Box>
                    <Box sx={{ height: 14, borderRadius: 999, bgcolor: 'rgba(25, 118, 210, 0.10)', overflow: 'hidden' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${percent}%`,
                          borderRadius: 999,
                          bgcolor: '#1976d2',
                          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)',
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        </Box>

        <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Paper variant="outlined" sx={chartCardSx}>
            <Typography variant="subtitle1" fontWeight={850}>
              Absorption Rate by {chartLabel}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Budget utilization percentage
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.35, mt: 2 }}>
              {chartRows.map((row) => {
                const value = Math.max(0, Math.min(100, Number(row.absorptionRate || 0)));
                return (
                  <Box key={`absorption-${row.name}`}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.45 }}>
                      <Typography
                        variant="body2"
                        title={row.name}
                        sx={{ fontWeight: 650, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {row.name}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#f57c00', flexShrink: 0 }}>
                        {value.toFixed(1)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={value}
                      sx={{
                        height: 14,
                        borderRadius: 999,
                        bgcolor: 'rgba(245, 124, 0, 0.12)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 999,
                          bgcolor: '#f57c00',
                        },
                      }}
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
            'html, body, #root': {
              width: '100% !important',
              height: 'auto !important',
              margin: '0 !important',
              padding: '0 !important',
              overflow: 'visible !important',
            },
            '.mcmes-app-main': {
              width: '100% !important',
              marginLeft: '0 !important',
              marginTop: '0 !important',
              padding: '0 !important',
              minHeight: 'auto !important',
              display: 'block !important',
            },
            '.mcmes-app-main > .MuiBox-root': {
              padding: '0 !important',
              overflow: 'visible !important',
            },
            '.MuiAppBar-root, .MuiDrawer-root, .MuiModal-root, .MuiBackdrop-root': {
              display: 'none !important',
            },
            'body *': {
              visibility: 'hidden !important',
            },
            '#regional-reports-print-area, #regional-reports-print-area *': {
              visibility: 'visible !important',
            },
            '#regional-reports-print-area': {
              position: 'static !important',
              width: '100% !important',
              maxWidth: '100% !important',
              margin: '0 !important',
              padding: '0 !important',
              background: '#ffffff !important',
              color: '#111827 !important',
            },
            '#regional-reports-print-area .regional-report-no-print': {
              display: 'none !important',
            },
            '#regional-reports-print-area .regional-report-screen-header': {
              display: 'none !important',
            },
            '#regional-reports-print-area .regional-report-print-header': {
              display: 'block !important',
              marginBottom: '6mm !important',
              paddingBottom: '4mm !important',
            },
            '#regional-reports-print-area .MuiPaper-root': {
              boxShadow: 'none !important',
              breakInside: 'auto !important',
              pageBreakInside: 'auto !important',
              marginBottom: '6px !important',
            },
            '#regional-reports-print-area .MuiTableCell-root': {
              padding: '3px 6px !important',
              fontSize: '9px !important',
            },
            '#regional-reports-print-area .MuiTabs-root': {
              display: 'none !important',
            },
          },
          '@page': {
            size: 'landscape',
            margin: '10mm',
          },
        }}
      />
      <Box id="regional-reports-print-area" sx={{ p: { xs: 1, sm: 1.5 }, width: '100%' }}>
        <Box
          className="regional-report-print-header"
          sx={{
            display: 'none',
            textAlign: 'center',
            mb: 2,
            pb: 1.5,
            borderBottom: '1px solid #cbd5e1',
          }}
        >
          <Box
            component="img"
            src={countyLogoUrl}
            alt=""
            sx={{ width: 58, height: 58, objectFit: 'contain', mb: 0.5 }}
          />
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: 0.4 }}>
            REPUBLIC OF KENYA
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: 0.4 }}>
            {countyName}
          </Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', mt: 0.75 }}>
            REGIONAL BREAKDOWN REPORT
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#475569', mt: 0.35 }}>
            Sub-county and ward performance from project records · Generated {new Date().toLocaleString('en-KE')}
          </Typography>
        </Box>
      <Paper
        className="regional-report-screen-header"
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
              Regional Breakdown Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sub-county and ward performance from project records
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              <Chip size="small" label={`Sub-counties: ${totals.subcounties}`} color="primary" variant="outlined" />
              <Chip size="small" label={`Wards: ${totals.wards}`} color="primary" variant="outlined" />
              <Chip size="small" label={`Projects: ${totals.totalProjects}`} color="primary" variant="outlined" />
            </Box>
          </Box>
          <Box className="regional-report-no-print" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={printReport}
            >
              Print
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => exportPdf('all')}
              disabled={loading || rows.length === 0}
            >
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
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            background: 'linear-gradient(to right, rgba(25, 118, 210, 0.05), transparent)',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 44,
            },
          }}
        >
          <Tab icon={<LocationOn sx={{ fontSize: 18 }} />} iconPosition="start" label="Sub-county" />
          <Tab icon={<MapIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Ward" />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, md: 2 }, backgroundColor: 'background.default' }}>
          <Grid container spacing={1} sx={{ mb: 1.25 }}>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Total Budget</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{currency(totals.totalBudget)}</Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Total Paid</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{currency(totals.totalPaid)}</Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
          {loading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={26} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : activeTab === 0 ? (
            <>
              {renderCharts()}
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <TableRow>
                      <TableCell>Sub-county</TableCell>
                      <TableCell align="right">Projects</TableCell>
                      <TableCell align="right">Total Budget</TableCell>
                      <TableCell align="right">Total Paid</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {subcountyRows.map((r) => (
                      <TableRow
                        key={r.subcounty}
                        hover
                        onClick={() => openRegistry(r)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{r.subcounty}</TableCell>
                        <TableCell align="right">{r.projectCount}</TableCell>
                        <TableCell align="right">{currency(r.totalBudget)}</TableCell>
                        <TableCell align="right">{currency(r.totalPaid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <>
              {renderCharts()}
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <TableRow>
                      <TableCell>Ward</TableCell>
                      <TableCell>Sub-county</TableCell>
                      <TableCell align="right">Projects</TableCell>
                      <TableCell align="right">Total Budget</TableCell>
                      <TableCell align="right">Total Paid</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {wardRows.map((r) => (
                      <TableRow
                        key={`${r.subcounty}-${r.ward}`}
                        hover
                        onClick={() => openRegistry(r)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{r.ward}</TableCell>
                        <TableCell>{r.subcounty}</TableCell>
                        <TableCell align="right">{r.projectCount}</TableCell>
                        <TableCell align="right">{currency(r.totalBudget)}</TableCell>
                        <TableCell align="right">{currency(r.totalPaid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight={800}>
          Distribution Insights
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Supports equitable programme/project distribution decisions.
        </Typography>
        <Grid container spacing={1} sx={{ mt: 0.5, mb: 1.25 }}>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Ideal projects / {distributionInsights.scopeLabel}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {distributionInsights.idealProjectsPerScope.toFixed(1)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Ideal budget / {distributionInsights.scopeLabel}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {currency(distributionInsights.idealBudgetPerScope)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">Average equity score</Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {distributionInsights.averageEquityScore.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, distributionInsights.averageEquityScore))}
                sx={{ mt: 0.5, height: 6, borderRadius: 999 }}
              />
            </Paper>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 0.6, fontWeight: 700 }}>
          Priority {distributionInsights.scopeLabelPlural[0].toUpperCase()}
          {distributionInsights.scopeLabelPlural.slice(1)} (Under-served)
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
          <Table size="small">
            <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
              <TableRow>
                <TableCell>
                  {distributionInsights.scopeLabel[0].toUpperCase()}
                  {distributionInsights.scopeLabel.slice(1)}
                </TableCell>
                <TableCell align="right">Project Gap</TableCell>
                <TableCell align="right">Budget Gap</TableCell>
                <TableCell align="right">Deficit Pressure</TableCell>
                <TableCell>Recommendation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {distributionInsights.underServed.map((r) => (
                <TableRow
                  key={`priority-${r.scopeLabel}-${r.subcounty || 'na'}`}
                  hover
                  onClick={() => openRegistry(r)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{r.scopeLabel}</TableCell>
                  <TableCell align="right">{r.projectGap.toFixed(1)}</TableCell>
                  <TableCell align="right">{currency(Math.max(r.budgetGap, 0))}</TableCell>
                  <TableCell align="right">{r.deficitPressure.toFixed(1)}</TableCell>
                  <TableCell>{r.recommendation}</TableCell>
                </TableRow>
              ))}
              {distributionInsights.underServed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No current {distributionInsights.scopeLabel} deficits detected.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      </Box>
    </>
  );
};

export default RegionalBreakdownDashboardPage;
