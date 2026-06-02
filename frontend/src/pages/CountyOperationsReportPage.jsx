import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RefreshIcon from '@mui/icons-material/Refresh';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import reportsService from '../api/reportsService';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

const PERIOD_OPTIONS = [
  { code: '', name: 'All periods' },
  { code: 'Q1', name: 'Q1: Jul - Sep' },
  { code: 'Q2', name: 'Q2: Oct - Dec' },
  { code: 'Q3', name: 'Q3: Jan - Mar' },
  { code: 'Q4', name: 'Q4: Apr - Jun' },
  { code: 'H1', name: 'Half year: Jul - Dec' },
  { code: 'H2', name: 'Half year: Jan - Jun' },
  { code: 'ANNUAL', name: 'Annual: Jul - Jun' },
];

const emptyOptions = {
  departments: [],
  sections: [],
  statuses: [],
  subCounties: [],
  wards: [],
  financialYears: [],
  periods: PERIOD_OPTIONS,
  reportingFrequencies: [],
};

const numberValue = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmtNumber = (value, digits = 0) =>
  numberValue(value).toLocaleString('en-KE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const fmtMoney = (value) => {
  const n = numberValue(value);
  if (Math.abs(n) >= 1_000_000_000) return `KES ${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString('en-KE')}`;
};

const fmtPct = (value) => `${fmtNumber(value, 1)}%`;

const filterSelectSx = { minWidth: 180 };

const cleanFilters = (filters) =>
  Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  );

const asRows = (value) => (Array.isArray(value) ? value : []);

const downloadWorkbook = (data) => {
  const workbook = XLSX.utils.book_new();
  const summaryRows = Object.entries(data?.summary || {}).map(([metric, value]) => ({ metric, value }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.departmentRows)), 'Departments');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.periodRows)), 'FY Periods');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.regionalRows)), 'Regions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.activityRows)), 'Activities');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.indicatorRegionRows)), 'Indicators by Region');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.indicatorDepartmentWardRows)), 'Indicators by Dept Ward');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.evaluationRows)), 'Evaluations');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(asRows(data?.attentionRows)), 'Attention');
  XLSX.writeFile(workbook, `county-operations-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

function EmptyOrTable({ rows, columns, emptyText = 'No rows for the selected filters.' }) {
  if (!rows.length) {
    return <Alert severity="info">{emptyText}</Alert>;
  }
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} align={column.align || 'left'} sx={{ fontWeight: 700 }}>
                {column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id || row.projectId || `${row.department || row.subCounty || row.activityCode}-${index}`}>
              {columns.map((column) => (
                <TableCell key={column.key} align={column.align || 'left'}>
                  {column.render ? column.render(row) : row[column.key] || ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function CountyOperationsReportPage() {
  const [filters, setFilters] = useState({
    financialYear: '',
    period: '',
    department: '',
    section: '',
    status: '',
    subCounty: '',
    ward: '',
  });
  const [options, setOptions] = useState(emptyOptions);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(() => cleanFilters(filters), [filters]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const result = await reportsService.getCountyOperationsFilterOptions();
      setOptions({
        ...emptyOptions,
        ...(result || {}),
        departments: Array.isArray(result?.departments) ? result.departments : [],
        sections: Array.isArray(result?.sections) ? result.sections : [],
        statuses: Array.isArray(result?.statuses) ? result.statuses : [],
        subCounties: Array.isArray(result?.subCounties) ? result.subCounties : [],
        wards: Array.isArray(result?.wards) ? result.wards : [],
        financialYears: Array.isArray(result?.financialYears) ? result.financialYears : [],
        periods: Array.isArray(result?.periods) && result.periods.length ? result.periods : PERIOD_OPTIONS,
        reportingFrequencies: Array.isArray(result?.reportingFrequencies) ? result.reportingFrequencies : [],
      });
    } catch {
      setOptions(emptyOptions);
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await reportsService.getCountyOperationsReport(params);
      setData(result || {});
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load county operations report.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const summary = data?.summary || {};
  const departmentRows = asRows(data?.departmentRows);
  const periodRows = asRows(data?.periodRows);
  const regionalRows = asRows(data?.regionalRows);
  const activityRows = asRows(data?.activityRows);
  const indicatorRegionRows = asRows(data?.indicatorRegionRows);
  const indicatorDepartmentWardRows = asRows(data?.indicatorDepartmentWardRows);
  const evaluationRows = asRows(data?.evaluationRows);
  const attentionRows = asRows(data?.attentionRows);

  const reportTabs = [
    {
      label: 'Departments',
      count: departmentRows.length,
      rows: departmentRows,
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'section', label: 'Section / unit' },
        { key: 'projectCount', label: 'Projects', align: 'right', render: (row) => fmtNumber(row.projectCount) },
        { key: 'allocatedBudget', label: 'Budget', align: 'right', render: (row) => fmtMoney(row.allocatedBudget) },
        { key: 'disbursedBudget', label: 'Disbursed', align: 'right', render: (row) => fmtMoney(row.disbursedBudget) },
        { key: 'averageProgress', label: 'Progress', align: 'right', render: (row) => fmtPct(row.averageProgress) },
        { key: 'linkedActivityCount', label: 'Activities', align: 'right', render: (row) => fmtNumber(row.linkedActivityCount) },
        { key: 'evaluationCount', label: 'Evaluations', align: 'right', render: (row) => fmtNumber(row.evaluationCount) },
      ],
    },
    {
      label: 'Periods',
      title: 'Financial year periods',
      count: periodRows.length,
      rows: periodRows,
      columns: [
        { key: 'financialYear', label: 'Financial year' },
        { key: 'period', label: 'Period' },
        { key: 'projectCount', label: 'Projects', align: 'right', render: (row) => fmtNumber(row.projectCount) },
        { key: 'allocatedBudget', label: 'Budget', align: 'right', render: (row) => fmtMoney(row.allocatedBudget) },
        { key: 'disbursedBudget', label: 'Disbursed', align: 'right', render: (row) => fmtMoney(row.disbursedBudget) },
        { key: 'averageProgress', label: 'Progress', align: 'right', render: (row) => fmtPct(row.averageProgress) },
        { key: 'completedProjects', label: 'Completed', align: 'right', render: (row) => fmtNumber(row.completedProjects) },
        { key: 'attentionProjects', label: 'Attention', align: 'right', render: (row) => fmtNumber(row.attentionProjects) },
      ],
    },
    {
      label: 'Activities',
      title: 'Activities and indicators',
      count: activityRows.length,
      rows: activityRows.slice(0, 250),
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'projectName', label: 'Project' },
        { key: 'activityName', label: 'Activity' },
        { key: 'indicatorName', label: 'Indicator' },
        { key: 'targetValue', label: 'Target', align: 'right', render: (row) => fmtNumber(row.targetValue, 1) },
        { key: 'achievedValue', label: 'Achieved', align: 'right', render: (row) => fmtNumber(row.achievedValue, 1) },
        { key: 'achievementRate', label: 'Rate', align: 'right', render: (row) => (row.achievementRate == null ? '-' : fmtPct(row.achievementRate)) },
        { key: 'activityStatus', label: 'Status', render: (row) => row.activityStatus || '-' },
      ],
    },
    {
      label: 'Regions',
      count: regionalRows.length,
      rows: regionalRows,
      columns: [
        { key: 'subCounty', label: 'Sub-county' },
        { key: 'ward', label: 'Ward' },
        { key: 'department', label: 'Department' },
        { key: 'projectCount', label: 'Projects', align: 'right', render: (row) => fmtNumber(row.projectCount) },
        { key: 'allocatedBudget', label: 'Budget', align: 'right', render: (row) => fmtMoney(row.allocatedBudget) },
        { key: 'disbursedBudget', label: 'Disbursed', align: 'right', render: (row) => fmtMoney(row.disbursedBudget) },
        { key: 'averageProgress', label: 'Progress', align: 'right', render: (row) => fmtPct(row.averageProgress) },
      ],
    },
    {
      label: 'Regional KPIs',
      title: 'Indicators by region',
      count: indicatorRegionRows.length,
      rows: indicatorRegionRows,
      columns: [
        { key: 'subCounty', label: 'Sub-county', render: (row) => row.subCounty || 'Unspecified' },
        { key: 'ward', label: 'Ward', render: (row) => row.ward || 'Unspecified' },
        { key: 'indicatorName', label: 'Indicator' },
        { key: 'measurementType', label: 'Measurement type', render: (row) => row.measurementType || '-' },
        { key: 'projectCount', label: 'Projects', align: 'right', render: (row) => fmtNumber(row.projectCount) },
        { key: 'targetValue', label: 'Target', align: 'right', render: (row) => fmtNumber(row.targetValue, 1) },
        { key: 'achievedValue', label: 'Achieved', align: 'right', render: (row) => fmtNumber(row.achievedValue, 1) },
        { key: 'achievementRate', label: 'Achievement', align: 'right', render: (row) => (row.achievementRate == null ? '-' : fmtPct(row.achievementRate)) },
      ],
    },
    {
      label: 'Dept KPIs',
      title: 'Indicators by department',
      count: indicatorDepartmentWardRows.length,
      rows: indicatorDepartmentWardRows,
      columns: [
        { key: 'department', label: 'Department', render: (row) => row.department || 'Unassigned' },
        { key: 'ward', label: 'Ward', render: (row) => row.ward || 'Unspecified' },
        { key: 'indicatorName', label: 'Indicator' },
        { key: 'measurementType', label: 'Measurement type', render: (row) => row.measurementType || '-' },
        { key: 'projectCount', label: 'Projects', align: 'right', render: (row) => fmtNumber(row.projectCount) },
        { key: 'targetValue', label: 'Target', align: 'right', render: (row) => fmtNumber(row.targetValue, 1) },
        { key: 'achievedValue', label: 'Achieved', align: 'right', render: (row) => fmtNumber(row.achievedValue, 1) },
        { key: 'achievementRate', label: 'Achievement', align: 'right', render: (row) => (row.achievementRate == null ? '-' : fmtPct(row.achievementRate)) },
      ],
    },
    {
      label: 'Evaluations',
      count: evaluationRows.length,
      rows: evaluationRows,
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'subCounty', label: 'Sub-county', render: (row) => row.subCounty || 'Unspecified' },
        { key: 'ward', label: 'Ward', render: (row) => row.ward || 'Unspecified' },
        { key: 'projectName', label: 'Project' },
        { key: 'activityName', label: 'Activity' },
        { key: 'indicatorName', label: 'Indicator' },
        { key: 'evaluationDate', label: 'Evaluation date', render: (row) => row.evaluationDate || '-' },
        { key: 'targetValue', label: 'Target', align: 'right', render: (row) => fmtNumber(row.targetValue, 1) },
        { key: 'achievedValue', label: 'Achieved', align: 'right', render: (row) => fmtNumber(row.achievedValue, 1) },
        { key: 'performanceScore', label: 'Score', align: 'right', render: (row) => fmtPct(row.performanceScore) },
      ],
    },
    {
      label: 'Attention',
      count: attentionRows.length,
      rows: attentionRows,
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'projectName', label: 'Project' },
        { key: 'status', label: 'Status' },
        { key: 'progress', label: 'Progress', align: 'right', render: (row) => fmtPct(row.progress) },
        { key: 'allocatedBudget', label: 'Budget', align: 'right', render: (row) => fmtMoney(row.allocatedBudget) },
        { key: 'absorptionRate', label: 'Absorption', align: 'right', render: (row) => fmtPct(row.absorptionRate) },
        { key: 'statusReason', label: 'Reason', render: (row) => row.statusReason || row.latestUpdateSummary || '-' },
      ],
    },
  ];
  const selectedReport = reportTabs[activeTab] || reportTabs[0];

  const handlePdf = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const logoDataUrl = await getCountyLogoDataUrl();
    let y = drawCountyOfficialHeader(doc, {
      unit: 'pt',
      logoDataUrl,
      title: `County Operations Report - ${selectedReport.title || selectedReport.label}`,
      departmentName: filters.department || '',
    });
    doc.setFontSize(9);
    const filterText = Object.keys(params).length ? JSON.stringify(params) : 'All scoped records';
    doc.text(`Generated: ${new Date().toLocaleString()} | Filters: ${filterText}`, 40, y);
    y += 16;
    autoTable(doc, {
      startY: y,
      head: [selectedReport.columns.map((column) => column.label)],
      body: selectedReport.rows.map((row) =>
        selectedReport.columns.map((column) => {
          const value = column.render ? column.render(row) : row[column.key];
          return value === null || value === undefined || value === '' ? '-' : String(value);
        })
      ),
      styles: {
        fontSize: selectedReport.columns.length > 8 ? 6 : 7,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: [22, 96, 136] },
    });
    doc.save(`county-operations-report-${selectedReport.label.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const updateFilter = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const resetFilters = () => {
    setFilters({
      financialYear: '',
      period: '',
      department: '',
      section: '',
      status: '',
      subCounty: '',
      ward: '',
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.25, md: 3 },
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2.5}
          sx={{ mb: 2.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0, pr: { md: 2 } }}>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              County Operations Report
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 780, lineHeight: 1.6 }}>
              A scoped operations view combining projects, planning activity links, indicator achievements,
              evaluations, regional spread, and financial-year periods running July to June.
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap={{ xs: 'wrap', md: 'nowrap' }}
            justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
            sx={{ flexShrink: 0, minWidth: { md: 330 } }}
          >
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadReport} disabled={loading} sx={{ minWidth: 104 }}>
              Refresh
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadWorkbook(data || {})} disabled={!data} sx={{ minWidth: 104 }}>
              Excel
            </Button>
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={handlePdf} disabled={!data} sx={{ minWidth: 104 }}>
              PDF
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Financial year" value={filters.financialYear} onChange={updateFilter('financialYear')}>
              <MenuItem value="">All</MenuItem>
              {options.financialYears.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Period" value={filters.period} onChange={updateFilter('period')}>
              {(options.periods.length ? options.periods : emptyOptions.periods).map((item) => (
                <MenuItem key={item.code || 'all'} value={item.code}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={3}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Department" value={filters.department} onChange={updateFilter('department')}>
              <MenuItem value="">All scoped departments</MenuItem>
              {options.departments.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={3}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Section / unit" value={filters.section} onChange={updateFilter('section')}>
              <MenuItem value="">All</MenuItem>
              {options.sections.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Status" value={filters.status} onChange={updateFilter('status')}>
              <MenuItem value="">All</MenuItem>
              {options.statuses.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={3}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Sub-county" value={filters.subCounty} onChange={updateFilter('subCounty')}>
              <MenuItem value="">All</MenuItem>
              {options.subCounties.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={3}>
            <TextField select fullWidth size="small" sx={filterSelectSx} label="Ward" value={filters.ward} onChange={updateFilter('ward')}>
              <MenuItem value="">All</MenuItem>
              {options.wards.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={6} lg={4}>
            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={loadReport} disabled={loading} sx={{ minWidth: 132 }}>
                Apply filters
              </Button>
              <Button variant="text" onClick={resetFilters}>
                Reset
              </Button>
              {optionsLoading && <Chip size="small" label="Loading options..." />}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {loading && (
        <Paper sx={{ p: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={22} />
          <Typography>Loading county operations report...</Typography>
        </Paper>
      )}

      {!loading && data && numberValue(summary.projectCount) === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No scoped projects were found for the selected filters. Check the user&apos;s organization access,
          clear filters, or run the county operations demo seed on this database.
        </Alert>
      )}

      <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mb: 2,
            '& .MuiTab-root': {
              minWidth: { xs: 72, sm: 90 },
              px: { xs: 1, sm: 1.25 },
              textTransform: 'none',
              fontWeight: 700,
            },
          }}
        >
          {reportTabs.map((tab) => (
            <Tab
              key={tab.label}
              title={tab.title || tab.label}
              label={
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box component="span">{tab.label}</Box>
                  <Chip
                    size="small"
                    label={fmtNumber(tab.count)}
                    sx={{
                      height: 20,
                      minWidth: 24,
                      '& .MuiChip-label': { px: 0.75, fontSize: '0.72rem' },
                    }}
                  />
                </Stack>
              }
            />
          ))}
        </Tabs>

        <EmptyOrTable rows={selectedReport.rows} columns={selectedReport.columns} />
      </Paper>
    </Box>
  );
}
