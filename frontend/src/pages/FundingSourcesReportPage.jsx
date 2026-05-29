import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import reportsService from '../api/reportsService';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

const fmtCurrency = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtNumber = (v) => Number(v || 0).toLocaleString('en-KE');
const fmtPercent = (v) => `${Number(v || 0).toFixed(1)}%`;

function departmentOption(d) {
  if (d == null) return { value: '', label: '—' };
  if (typeof d === 'string') {
    const value = d.trim();
    return { value, label: value || '—' };
  }
  const name = d.name != null ? String(d.name).trim() : '';
  const alias = d.alias != null ? String(d.alias).trim() : '';
  const value = name || alias;
  const label = name && alias && name !== alias ? `${name} (${alias})` : value || '—';
  return { value, label };
}

export default function FundingSourcesReportPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ projectName: '', department: '', limit: 5000 });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [groups, setGroups] = useState([]);
  const [selectedSourceNames, setSelectedSourceNames] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const q = filtersRef.current;
    setLoading(true);
    setError('');
    try {
      const [report, options] = await Promise.all([
        reportsService.getProjectsByFundingSource(q),
        reportsService.getFilterOptions(),
      ]);
      setGroups(Array.isArray(report?.groups) ? report.groups : []);
      setDepartments(Array.isArray(options?.departments) ? options.departments : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load funding sources report.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sourceOptions = useMemo(() => (
    [...new Set(
      groups
        .map((group) => String(group.fundingSourceName || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  ), [groups]);

  useEffect(() => {
    const available = new Set(sourceOptions);
    setSelectedSourceNames((previous) => previous.filter((sourceName) => available.has(sourceName)));
  }, [sourceOptions]);

  const displayGroups = useMemo(() => {
    if (!selectedSourceNames.length) return groups;
    const selected = new Set(selectedSourceNames);
    return groups.filter((group) => selected.has(String(group.fundingSourceName || '').trim()));
  }, [groups, selectedSourceNames]);

  const displaySummary = useMemo(() => {
    const projectIds = new Set();
    displayGroups.forEach((group) => {
      (group.projects || []).forEach((project) => projectIds.add(project.projectId));
    });
    return {
      groupCount: displayGroups.length,
      projectCount: projectIds.size,
      entryCount: displayGroups.reduce((sum, group) => sum + Number(group.entryCount || 0), 0),
      totalFunding: displayGroups.reduce((sum, group) => sum + Number(group.totalAmount || 0), 0),
    };
  }, [displayGroups]);

  const topGroups = useMemo(() => displayGroups.slice(0, 6), [displayGroups]);

  const flattenedRows = useMemo(() => (
    displayGroups.flatMap((group) => (
      (group.projects || []).map((project) => {
        const budgetAmount = Number(project.budgetAmount || 0);
        const fundingAmount = Number(project.fundingAmount || 0);
        return {
          fundingSourceName: group.fundingSourceName || 'Unknown Source',
          projectId: project.projectId,
          projectName: project.projectName,
          department: project.department || 'Unassigned',
          status: project.status || 'Unknown',
          stages: project.stages || '',
          fundingAmount,
          budgetAmount,
          paidAmount: Number(project.paidAmount || 0),
          entryCount: Number(project.entryCount || 0),
          sourceCoveragePercentage: budgetAmount > 0 ? (fundingAmount / budgetAmount) * 100 : 0,
        };
      })
    ))
  ), [displayGroups]);

  const reportMetrics = useMemo(() => {
    const byProject = new Map();
    for (const row of flattenedRows) {
      if (!byProject.has(row.projectId)) {
        byProject.set(row.projectId, { budgetAmount: row.budgetAmount, paidAmount: row.paidAmount, fundingAmount: 0 });
      }
      const project = byProject.get(row.projectId);
      project.budgetAmount = Math.max(project.budgetAmount, row.budgetAmount);
      project.paidAmount = Math.max(project.paidAmount, row.paidAmount);
      project.fundingAmount += row.fundingAmount;
    }

    const projects = [...byProject.values()];
    const totalBudget = projects.reduce((sum, p) => sum + Number(p.budgetAmount || 0), 0);
    const totalPaid = projects.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
    const totalFunding = Number(displaySummary.totalFunding ?? flattenedRows.reduce((sum, r) => sum + r.fundingAmount, 0));
    const fullyFundedProjects = projects.filter((p) => p.budgetAmount > 0 && p.fundingAmount >= p.budgetAmount).length;

    return {
      totalBudget,
      totalPaid,
      totalFunding,
      fundingCoveragePercentage: totalBudget > 0 ? (totalFunding / totalBudget) * 100 : 0,
      financingGap: Math.max(0, totalBudget - totalFunding),
      fullyFundedProjects,
      topSourceShare: totalFunding > 0 && displayGroups[0] ? (Number(displayGroups[0].totalAmount || 0) / totalFunding) * 100 : 0,
    };
  }, [displayGroups, displaySummary, flattenedRows]);

  const filterDescription = useMemo(() => {
    const parts = [];
    if (filters.department) parts.push(`Department: ${filters.department}`);
    if (filters.projectName) parts.push(`Project: ${filters.projectName}`);
    if (selectedSourceNames.length) parts.push(`Funding sources: ${selectedSourceNames.join(', ')}`);
    return parts.length ? parts.join(' | ') : 'All project funding entries';
  }, [filters, selectedSourceNames]);

  const summaryMetrics = useMemo(() => ([
    { label: 'Funding Sources', value: fmtNumber(displaySummary.groupCount || 0), sub: `${fmtNumber(displaySummary.entryCount || 0)} entries` },
    { label: 'Projects Funded', value: fmtNumber(displaySummary.projectCount || 0), sub: `${fmtNumber(reportMetrics.fullyFundedProjects)} fully funded` },
    { label: 'Total Funding', value: fmtCurrency(reportMetrics.totalFunding), sub: `${fmtPercent(reportMetrics.fundingCoveragePercentage)} coverage` },
    { label: 'Financing Gap', value: fmtCurrency(reportMetrics.financingGap), sub: `Budget: ${fmtCurrency(reportMetrics.totalBudget)}` },
    { label: 'Total Paid', value: fmtCurrency(reportMetrics.totalPaid), sub: 'Funded projects' },
    { label: 'Top Source Share', value: fmtPercent(reportMetrics.topSourceShare), sub: displayGroups[0]?.fundingSourceName || 'No source' },
  ]), [displayGroups, displaySummary, reportMetrics]);

  const handleExportExcel = () => {
    setExportingExcel(true);
    setError('');
    setNotice('');
    try {
      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: 'Funding Sources Report',
        Subject: filterDescription,
        Author: 'Machakos Project Management System',
        CreatedDate: new Date(),
      };

      const summaryRows = [
        ['FUNDING SOURCES REPORT'],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Filters: ${filterDescription}`],
        [],
        ['Metric', 'Value', 'Notes'],
        ['Funding Sources', displaySummary.groupCount || 0, 'Funding source or partner groups in the current report'],
        ['Projects Funded', displaySummary.projectCount || 0, 'Unique projects represented in funding entries'],
        ['Funding Entries', displaySummary.entryCount || 0, 'Individual funding entries recorded against projects'],
        ['Total Funding', fmtCurrency(reportMetrics.totalFunding), 'Sum of funding entries shown'],
        ['Unique Project Budget', fmtCurrency(reportMetrics.totalBudget), 'Budget total counted once per project'],
        ['Funding Coverage', fmtPercent(reportMetrics.fundingCoveragePercentage), 'Total funding divided by unique project budget'],
        ['Financing Gap', fmtCurrency(reportMetrics.financingGap), 'Project budget less funding recorded'],
        ['Total Paid', fmtCurrency(reportMetrics.totalPaid), 'Paid amount across funded projects'],
        ['Fully Funded Projects', reportMetrics.fullyFundedProjects, 'Projects where funding equals or exceeds budget'],
        [],
        ['Top Funding Sources', 'Total Funding', 'Share of Total', 'Projects'],
        ...topGroups.map((group) => {
          const totalAmount = Number(group.totalAmount || 0);
          return [
            group.fundingSourceName,
            fmtCurrency(totalAmount),
            fmtPercent(reportMetrics.totalFunding > 0 ? (totalAmount / reportMetrics.totalFunding) * 100 : 0),
            Number(group.projectCount || 0),
          ];
        }),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet['!cols'] = [{ wch: 30 }, { wch: 24 }, { wch: 58 }, { wch: 14 }];
      summarySheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      const groupRows = [
        ['FUNDING SOURCE BREAKDOWN'],
        [`Filters: ${filterDescription}`],
        [],
        ['Funding Source', 'Projects', 'Entries', 'Total Funding', 'Share of Total', 'Avg Funding / Project'],
        ...displayGroups.map((group) => {
          const totalAmount = Number(group.totalAmount || 0);
          const projectCount = Number(group.projectCount || 0);
          return [
            group.fundingSourceName,
            projectCount,
            Number(group.entryCount || 0),
            fmtCurrency(totalAmount),
            fmtPercent(reportMetrics.totalFunding > 0 ? (totalAmount / reportMetrics.totalFunding) * 100 : 0),
            fmtCurrency(projectCount > 0 ? totalAmount / projectCount : 0),
          ];
        }),
        [
          'TOTAL',
          displaySummary.projectCount || 0,
          displaySummary.entryCount || 0,
          fmtCurrency(reportMetrics.totalFunding),
          fmtPercent(displayGroups.length ? 100 : 0),
          fmtCurrency(displaySummary.projectCount > 0 ? reportMetrics.totalFunding / displaySummary.projectCount : 0),
        ],
      ];
      const groupSheet = XLSX.utils.aoa_to_sheet(groupRows);
      groupSheet['!cols'] = [{ wch: 38 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 22 }];
      groupSheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      ];
      groupSheet['!autofilter'] = { ref: `A4:F${Math.max(4, groupRows.length)}` };
      XLSX.utils.book_append_sheet(workbook, groupSheet, 'Funding Sources');

      const detailRows = [
        ['PROJECT FUNDING DETAILS'],
        [`Filters: ${filterDescription}`],
        [],
        [
        '#',
        'Funding Source',
        'Project',
        'Department',
        'Status',
        'Stage(s)',
        'Funding Amount',
        'Project Budget',
        'Paid Amount',
        'Source Coverage',
        'Entries',
        ],
        ...flattenedRows.map((item, index) => [
          index + 1,
          item.fundingSourceName,
          item.projectName,
          item.department,
          item.status,
          item.stages || 'N/A',
          fmtCurrency(item.fundingAmount),
          fmtCurrency(item.budgetAmount),
          fmtCurrency(item.paidAmount),
          fmtPercent(item.sourceCoveragePercentage),
          item.entryCount,
        ]),
        [
        '',
        '',
        'TOTAL',
        '',
        '',
        '',
        fmtCurrency(reportMetrics.totalFunding),
        fmtCurrency(reportMetrics.totalBudget),
        fmtCurrency(reportMetrics.totalPaid),
        fmtPercent(reportMetrics.fundingCoveragePercentage),
        displaySummary.entryCount || 0,
        ],
      ];
      const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
      detailSheet['!cols'] = [
        { wch: 6 },
        { wch: 30 },
        { wch: 44 },
        { wch: 26 },
        { wch: 16 },
        { wch: 22 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 16 },
        { wch: 10 },
      ];
      detailSheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      ];
      detailSheet['!autofilter'] = { ref: `A4:K${Math.max(4, detailRows.length)}` };
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Project Details');

      XLSX.writeFile(workbook, `funding-sources-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setNotice(`Exported ${flattenedRows.length} project funding row${flattenedRows.length === 1 ? '' : 's'} to Excel.`);
    } catch (e) {
      setError(e?.message || 'Failed to export funding sources report to Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setError('');
    setNotice('');
    try {
      const doc = new jsPDF('landscape', 'pt', 'a4');
      const logoDataUrl = await getCountyLogoDataUrl();
      const y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        margin: 40,
        logoDataUrl,
        title: 'Funding Sources Report',
      });

      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 40, y);
      doc.text(`Filters: ${filterDescription}`, 40, y + 12);

      autoTable(doc, {
        startY: y + 24,
        head: [['Funding Sources', 'Projects Funded', 'Entries', 'Total Funding', 'Project Budget', 'Coverage', 'Financing Gap']],
        body: [[
          fmtNumber(displaySummary.groupCount || 0),
          fmtNumber(displaySummary.projectCount || 0),
          fmtNumber(displaySummary.entryCount || 0),
          fmtCurrency(reportMetrics.totalFunding),
          fmtCurrency(reportMetrics.totalBudget),
          fmtPercent(reportMetrics.fundingCoveragePercentage),
          fmtCurrency(reportMetrics.financingGap),
        ]],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14,
        head: [['Funding Source', 'Project', 'Department', 'Status', 'Stage(s)', 'Funding', 'Budget', 'Coverage']],
        body: flattenedRows.map((row) => [
          row.fundingSourceName,
          row.projectName,
          row.department,
          row.status,
          row.stages || 'N/A',
          fmtCurrency(row.fundingAmount),
          fmtCurrency(row.budgetAmount),
          fmtPercent(row.sourceCoveragePercentage),
        ]),
        styles: {
          fontSize: 7,
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'top',
        },
        columnStyles: {
          0: { cellWidth: 105 },
          1: { cellWidth: 160 },
          2: { cellWidth: 105 },
          3: { cellWidth: 70 },
          4: { cellWidth: 75 },
          5: { halign: 'right', cellWidth: 85 },
          6: { halign: 'right', cellWidth: 85 },
          7: { halign: 'right', cellWidth: 60 },
        },
        headStyles: { fillColor: [25, 118, 210], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 40, right: 40 },
      });

      doc.save(`funding-sources-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      setNotice(`Exported ${flattenedRows.length} project funding row${flattenedRows.length === 1 ? '' : 's'} to PDF.`);
    } catch (e) {
      setError(e?.message || 'Failed to export funding sources report to PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {notice ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={1.25} alignItems="stretch">
          <Grid item xs={12} lg={7}>
            <Stack spacing={1.25} sx={{ height: '100%' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ fontWeight: 900, mb: 0.25 }}>
                    Funding Sources Report
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760 }}>
                    Centralized view of project funding by source, partner, budget coverage, and financing gap.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }} noWrap title={filterDescription}>
                    Filters: {filterDescription}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={exportingExcel ? <CircularProgress size={16} /> : <DownloadIcon />}
                    onClick={handleExportExcel}
                    disabled={loading || exportingExcel || exportingPdf || flattenedRows.length === 0}
                  >
                    Excel
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={exportingPdf ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
                    onClick={handleExportPdf}
                    disabled={loading || exportingExcel || exportingPdf || flattenedRows.length === 0}
                  >
                    PDF
                  </Button>
                </Stack>
              </Stack>

              <Grid container spacing={1}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Project name"
                    value={filters.projectName}
                    onChange={(e) => setFilters((p) => ({ ...p, projectName: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        load();
                      }
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Department"
                    sx={{ minWidth: { xs: '100%', sm: 220 } }}
                    value={filters.department}
                    onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
                  >
                    <MenuItem value="">All</MenuItem>
                    {departments.map((d, i) => {
                      const { value, label } = departmentOption(d);
                      return (
                        <MenuItem key={`dept-${i}-${value || 'x'}`} value={value}>
                          {label}
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Funding sources"
                    sx={{ minWidth: { xs: '100%', sm: 240 } }}
                    value={selectedSourceNames}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedSourceNames(typeof value === 'string' ? value.split(',') : value);
                    }}
                    SelectProps={{
                      multiple: true,
                      renderValue: (selected) => selected.length ? selected.join(', ') : 'All funding sources',
                    }}
                  >
                    {sourceOptions.map((sourceName) => (
                      <MenuItem key={sourceName} value={sourceName}>
                        <Checkbox checked={selectedSourceNames.includes(sourceName)} size="small" />
                        <ListItemText primary={sourceName} />
                      </MenuItem>
                    ))}
                    {sourceOptions.length === 0 ? (
                      <MenuItem disabled>No funding sources loaded</MenuItem>
                    ) : null}
                  </TextField>
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="contained" onClick={load} disabled={loading}>
                  Apply
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    const nextFilters = { projectName: '', department: '', limit: 5000 };
                    filtersRef.current = nextFilters;
                    setFilters(nextFilters);
                    setSelectedSourceNames([]);
                    setTimeout(load, 0);
                  }}
                  disabled={loading}
                >
                  Reset
                </Button>
                {loading ? <Chip size="small" icon={<CircularProgress size={14} />} label="Loading..." /> : null}
              </Stack>
            </Stack>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Grid container spacing={1}>
              {summaryMetrics.map((metric) => (
                <Grid item xs={6} sm={4} key={metric.label}>
                  <Paper
                    variant="outlined"
                    sx={{ p: 1, height: '100%', borderRadius: 1.5, bgcolor: 'background.default' }}
                  >
                    <Typography variant="caption" color="text.secondary" fontWeight={800} noWrap title={metric.label}>
                      {metric.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={900} sx={{ mt: 0.25 }} noWrap title={metric.value}>
                      {metric.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap title={metric.sub}>
                      {metric.sub}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {topGroups.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
            Top Funding Sources
          </Typography>
          <Grid container spacing={1.5}>
            {topGroups.map((group) => {
              const share = reportMetrics.totalFunding > 0 ? (Number(group.totalAmount || 0) / reportMetrics.totalFunding) * 100 : 0;
              return (
                <Grid item xs={12} md={4} key={`top-${group.fundingSourceKey}`}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight={800} noWrap title={group.fundingSourceName}>
                      {group.fundingSourceName}
                    </Typography>
                    <Typography variant="h6" fontWeight={900}>
                      {fmtCurrency(group.totalAmount)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, Math.max(0, share))}
                      sx={{ height: 7, borderRadius: 99, my: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {fmtPercent(share)} of funding · {group.projectCount} project{group.projectCount === 1 ? '' : 's'} · {group.entryCount} entr{group.entryCount === 1 ? 'y' : 'ies'}
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      ) : null}

      <Stack spacing={1.25}>
        {displayGroups.map((group, index) => (
          <Accordion key={group.fundingSourceKey || `group-${index}`} defaultExpanded={index < 3}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={{ xs: 0.5, md: 2 }}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                sx={{ width: '100%' }}
              >
                <Typography fontWeight={800} sx={{ flex: 1 }}>
                  {group.fundingSourceName}
                </Typography>
                <Chip size="small" label={`${group.projectCount} projects`} />
                <Chip size="small" label={`${group.entryCount} entries`} />
                <Chip
                  size="small"
                  label={`${fmtPercent(reportMetrics.totalFunding > 0 ? (Number(group.totalAmount || 0) / reportMetrics.totalFunding) * 100 : 0)} of funding`}
                />
                <Chip size="small" color="primary" label={fmtCurrency(group.totalAmount)} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'hidden' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '36%' }}><strong>Project</strong></TableCell>
                      <TableCell sx={{ width: '18%' }}><strong>Status / Stage</strong></TableCell>
                      <TableCell align="right" sx={{ width: '18%' }}><strong>Funding</strong></TableCell>
                      <TableCell align="right" sx={{ width: '18%' }}><strong>Budget / Paid</strong></TableCell>
                      <TableCell align="center" sx={{ width: '10%' }}><strong>Open</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(group.projects || []).map((project) => {
                      const budgetAmount = Number(project.budgetAmount || 0);
                      const sourceCoverage = budgetAmount > 0 ? (Number(project.fundingAmount || 0) / budgetAmount) * 100 : 0;
                      return (
                        <TableRow key={`${group.fundingSourceKey}-${project.projectId}`} hover>
                          <TableCell sx={{ maxWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                              {project.projectName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                              {project.department || 'Unassigned'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{project.status || 'Unknown'}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {project.stages || 'No stage'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700}>{fmtCurrency(project.fundingAmount)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {fmtPercent(sourceCoverage)} coverage · {project.entryCount || 0} entr{Number(project.entryCount || 0) === 1 ? 'y' : 'ies'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{fmtCurrency(project.budgetAmount)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Paid {fmtCurrency(project.paidAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate(`/projects/${project.projectId}`)}
                              sx={{ minWidth: 0, px: { xs: 1, md: 1.5 } }}
                            >
                              <VisibilityIcon sx={{ fontSize: 18, mr: { xs: 0, sm: 0.5 } }} />
                              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Details</Box>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}
        {!loading && displayGroups.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
            <Typography color="text.secondary">
              No project funding entries found for the selected filters.
            </Typography>
          </Paper>
        ) : null}
      </Stack>
    </Box>
  );
}
