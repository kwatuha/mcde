import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
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
import DownloadIcon from '@mui/icons-material/Download';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../api';
import reportsService from '../api/reportsService';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

const currentYear = new Date().getFullYear();
const DEFAULT_FILTERS = {
  startYear: String(currentYear - 2),
  endYear: String(currentYear),
  subcounty: '',
  ward: '',
  sublocation: '',
  village: '',
};

const DIMENSION_COLUMNS = [
  { key: 'subcounty', label: 'Sub-county', width: 20 },
  { key: 'ward', label: 'Ward', width: 22 },
  { key: 'sublocation', label: 'Sublocation', width: 24 },
  { key: 'village', label: 'Village', width: 26 },
];

const METRIC_COLUMNS = [
  { key: 'count', label: 'Projects', source: 'countsByYear', totalKey: 'total', width: 12 },
  { key: 'budget', label: 'Budget', source: 'budgetByYear', totalKey: 'totalBudget', width: 16 },
  { key: 'paid', label: 'Paid', source: 'paidByYear', totalKey: 'totalPaid', width: 16 },
];

const DEFAULT_DIMENSIONS = DIMENSION_COLUMNS.map((column) => column.key);
const DEFAULT_METRICS = ['count'];

function yearRange(startYear, endYear) {
  const start = parseInt(String(startYear || ''), 10);
  const end = parseInt(String(endYear || ''), 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const first = Math.min(start, end);
  const last = Math.max(start, end);
  if (last - first > 30) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function extractYearsFromFinancialYears(financialYears = []) {
  const values = new Set();
  financialYears.forEach((item) => {
    const label = String(item?.name || item || '');
    const matches = label.match(/\d{4}/g) || [];
    matches.forEach((year) => values.add(Number(year)));
  });
  if (values.size === 0) {
    for (let year = currentYear - 10; year <= currentYear + 1; year += 1) {
      values.add(year);
    }
  }
  return [...values]
    .filter((year) => Number.isFinite(year) && year >= 1900 && year <= 2200)
    .sort((a, b) => b - a);
}

function cleanFilters(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => String(value ?? '').trim() !== '')
  );
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

function getMetricValue(row, metricKey, year) {
  const metric = METRIC_COLUMNS.find((item) => item.key === metricKey);
  if (!metric) return 0;
  return Number(row?.[metric.source]?.[String(year)] || 0);
}

function getTotalMetricValue(row, metricKey) {
  const metric = METRIC_COLUMNS.find((item) => item.key === metricKey);
  if (!metric) return 0;
  return Number(row?.[metric.totalKey] || 0);
}

function formatMetricValue(value, metricKey) {
  return metricKey === 'count' ? formatNumber(value) : formatCurrency(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildReportColumns(years, selectedDimensions, selectedMetrics) {
  const dimensionColumns = DIMENSION_COLUMNS
    .filter((column) => selectedDimensions.includes(column.key))
    .map((column) => ({ ...column, type: 'dimension' }));
  const yearlyColumns = years.flatMap((year) => (
    METRIC_COLUMNS
      .filter((metric) => selectedMetrics.includes(metric.key))
      .map((metric) => ({
        key: `${year}:${metric.key}`,
        label: selectedMetrics.length === 1 ? String(year) : `${year} ${metric.label}`,
        year,
        metricKey: metric.key,
        type: 'metric',
        width: metric.width,
      }))
  ));
  const totalColumns = METRIC_COLUMNS
    .filter((metric) => selectedMetrics.includes(metric.key))
    .map((metric) => ({
      key: `total:${metric.key}`,
      label: selectedMetrics.length === 1 && metric.key === 'count' ? 'Total' : `Total ${metric.label}`,
      metricKey: metric.key,
      type: 'total',
      width: metric.width,
    }));
  return [...dimensionColumns, ...yearlyColumns, ...totalColumns];
}

function getColumnValue(row, column) {
  if (column.type === 'dimension') return row[column.key] || 'Unspecified';
  if (column.type === 'metric') return getMetricValue(row, column.metricKey, column.year);
  if (column.type === 'total') return getTotalMetricValue(row, column.metricKey);
  return '';
}

export default function YearlyTrendsReportPage() {
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [years, setYears] = useState([]);
  const [yearOptions, setYearOptions] = useState(() => extractYearsFromFinancialYears([]));
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ countsByYear: {}, total: 0 });
  const [geoOptions, setGeoOptions] = useState({
    subcounties: [],
    wards: [],
    sublocations: [],
    villages: [],
  });
  const [geoLoading, setGeoLoading] = useState({
    subcounties: false,
    wards: false,
    sublocations: false,
    villages: false,
  });
  const [selectedDimensions, setSelectedDimensions] = useState(DEFAULT_DIMENSIONS);
  const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_METRICS);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextFilters = DEFAULT_FILTERS) => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsService.getYearlyLocationTrendsReport(cleanFilters(nextFilters));
      setYears(Array.isArray(data?.years) ? data.years : []);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotals(data?.totals || { countsByYear: {}, budgetByYear: {}, paidByYear: {}, total: 0, totalBudget: 0, totalPaid: 0 });
      if (data?.filters?.startYear || data?.filters?.endYear) {
        setFilters((prev) => {
          const startYear = String(data.filters.startYear || prev.startYear);
          const endYear = String(data.filters.endYear || prev.endYear);
          if (prev.startYear === startYear && prev.endYear === endYear) return prev;
          return { ...prev, startYear, endYear };
        });
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load yearly trends report.');
      setRows([]);
      setYears([]);
      setTotals({ countsByYear: {}, budgetByYear: {}, paidByYear: {}, total: 0, totalBudget: 0, totalPaid: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(DEFAULT_FILTERS);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const options = await reportsService.getFilterOptions();
        if (!cancelled) {
          const nextYears = extractYearsFromFinancialYears(options?.financialYears || []);
          setYearOptions(nextYears);
        }
      } catch {
        if (!cancelled) setYearOptions(extractYearsFromFinancialYears([]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGeoLoading((prev) => ({ ...prev, subcounties: true }));
      try {
        let list = [];
        if (typeof apiService.kenyaWards?.getCatalogSubcounties === 'function') {
          list = await apiService.kenyaWards.getCatalogSubcounties();
        }
        if (!Array.isArray(list) || list.length === 0) {
          list = await apiService.kenyaWards.getSubcounties();
        }
        if (!cancelled) {
          setGeoOptions((prev) => ({ ...prev, subcounties: Array.isArray(list) ? list : [] }));
        }
      } catch {
        if (!cancelled) setGeoOptions((prev) => ({ ...prev, subcounties: [] }));
      } finally {
        if (!cancelled) setGeoLoading((prev) => ({ ...prev, subcounties: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subcounty = String(filters.subcounty || '').trim();
      if (!subcounty) {
        setGeoOptions((prev) => ({ ...prev, wards: [], sublocations: [], villages: [] }));
        return;
      }
      setGeoLoading((prev) => ({ ...prev, wards: true }));
      try {
        let list = [];
        if (typeof apiService.kenyaWards?.getCatalogWardsBySubcounty === 'function') {
          list = await apiService.kenyaWards.getCatalogWardsBySubcounty(subcounty);
        }
        if (!Array.isArray(list) || list.length === 0) {
          list = await apiService.kenyaWards.getWardsBySubcounty(subcounty);
        }
        const values = (Array.isArray(list) ? list : [])
          .map((item) => (typeof item === 'string' ? item : item?.name || item?.wardName || ''))
          .filter(Boolean);
        if (!cancelled) {
          setGeoOptions((prev) => ({ ...prev, wards: values, sublocations: [], villages: [] }));
        }
      } catch {
        if (!cancelled) setGeoOptions((prev) => ({ ...prev, wards: [], sublocations: [], villages: [] }));
      } finally {
        if (!cancelled) setGeoLoading((prev) => ({ ...prev, wards: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.subcounty]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subcounty = String(filters.subcounty || '').trim();
      const ward = String(filters.ward || '').trim();
      if (!subcounty || !ward) {
        setGeoOptions((prev) => ({ ...prev, sublocations: [], villages: [] }));
        return;
      }
      setGeoLoading((prev) => ({ ...prev, sublocations: true }));
      try {
        const list = await apiService.kenyaWards.getSublocations({ subcounty, ward });
        if (!cancelled) {
          setGeoOptions((prev) => ({ ...prev, sublocations: Array.isArray(list) ? list : [], villages: [] }));
        }
      } catch {
        if (!cancelled) setGeoOptions((prev) => ({ ...prev, sublocations: [], villages: [] }));
      } finally {
        if (!cancelled) setGeoLoading((prev) => ({ ...prev, sublocations: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.subcounty, filters.ward]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subcounty = String(filters.subcounty || '').trim();
      const ward = String(filters.ward || '').trim();
      const sublocation = String(filters.sublocation || '').trim();
      if (!subcounty || !ward || !sublocation) {
        setGeoOptions((prev) => ({ ...prev, villages: [] }));
        return;
      }
      setGeoLoading((prev) => ({ ...prev, villages: true }));
      try {
        const list = await apiService.kenyaWards.getVillages({ subcounty, ward, sublocation });
        if (!cancelled) {
          setGeoOptions((prev) => ({ ...prev, villages: Array.isArray(list) ? list : [] }));
        }
      } catch {
        if (!cancelled) setGeoOptions((prev) => ({ ...prev, villages: [] }));
      } finally {
        if (!cancelled) setGeoLoading((prev) => ({ ...prev, villages: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.subcounty, filters.ward, filters.sublocation]);

  const displayYears = useMemo(() => {
    const selected = yearRange(filters.startYear, filters.endYear);
    return selected.length ? selected : years;
  }, [filters.startYear, filters.endYear, years]);

  const reportColumns = useMemo(
    () => buildReportColumns(displayYears, selectedDimensions, selectedMetrics),
    [displayYears, selectedDimensions, selectedMetrics]
  );

  const activeFiltersText = useMemo(() => {
    const entries = Object.entries(filters).filter(([, value]) => String(value || '').trim() !== '');
    return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(', ') : 'All scoped records';
  }, [filters]);

  const handleExportExcel = () => {
    const headers = ['#', ...reportColumns.map((column) => column.label)];
    const body = rows.map((row, index) => [
      index + 1,
      ...reportColumns.map((column) => {
        const value = getColumnValue(row, column);
        return column.type === 'dimension' ? value : Number(value || 0);
      }),
    ]);
    const totalRow = [
      'Total',
      ...reportColumns.map((column) => {
        if (column.type === 'dimension') return '';
        return Number(getColumnValue(totals, column) || 0);
      }),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body, totalRow]);
    worksheet['!cols'] = [
      { wch: 6 },
      ...reportColumns.map((column) => ({ wch: column.width || 14 })),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Yearly Trends');
    XLSX.writeFile(workbook, `yearly-trends-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportWord = async () => {
    setExportingWord(true);
    try {
      const logoDataUrl = await getCountyLogoDataUrl();
      const metricColumns = reportColumns.filter((column) => column.type !== 'dimension');
      const summaryRows = `
        <tr>
          <td>${rows.length.toLocaleString()}</td>
          ${metricColumns.map((column) => `
            <td style="text-align:right;">${escapeHtml(formatMetricValue(getColumnValue(totals, column), column.metricKey))}</td>
          `).join('')}
        </tr>
      `;
      const bodyRows = rows.map((row) => `
        <tr>
          ${reportColumns.map((column) => {
            const value = getColumnValue(row, column);
            const display = column.type === 'dimension' ? value : formatMetricValue(value, column.metricKey);
            const align = column.type === 'dimension' ? 'left' : 'right';
            return `<td style="text-align:${align};">${escapeHtml(display)}</td>`;
          }).join('')}
        </tr>
      `).join('');
      const generatedAt = new Date().toLocaleString();
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Yearly Trends Report</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 10pt; color: #111827; }
            .official-header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #166088; padding-bottom: 10px; }
            .official-header img { width: 76px; height: auto; margin-bottom: 6px; }
            .official-header .county { font-size: 16pt; font-weight: bold; color: #166088; }
            .official-header .subtitle { font-size: 10pt; color: #4b5563; }
            h1 { font-size: 18pt; margin-bottom: 4px; }
            .meta { color: #4b5563; margin-bottom: 14px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
            th { background: #166088; color: #ffffff; font-weight: bold; }
            th, td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
            .summary th, .summary td { text-align: right; }
            .summary th:first-child, .summary td:first-child { text-align: left; }
          </style>
        </head>
        <body>
          <div class="official-header">
            ${logoDataUrl ? `<img src="${logoDataUrl}" alt="County logo" />` : ''}
            <div class="county">County Government of Machakos</div>
            <div class="subtitle">Government Projects Reporting Platform</div>
          </div>
          <h1>Yearly Trends Report</h1>
          <div class="meta">Generated: ${escapeHtml(generatedAt)}<br />Filters: ${escapeHtml(activeFiltersText)}</div>
          <table class="summary">
            <thead>
              <tr>
                <th>Rows</th>
                ${metricColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>${summaryRows}</tbody>
          </table>
          <table>
            <thead>
              <tr>${reportColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
            </thead>
            <tbody>${bodyRows || `<tr><td colspan="${Math.max(reportColumns.length, 1)}">No records found.</td></tr>`}</tbody>
          </table>
        </body>
        </html>
      `;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yearly-trends-report-${new Date().toISOString().slice(0, 10)}.doc`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || 'Failed to export yearly trends report Word document.');
    } finally {
      setExportingWord(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const logoDataUrl = await getCountyLogoDataUrl();
      let y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        logoDataUrl,
        title: 'Yearly Trends Report',
      });

      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()} | Filters: ${activeFiltersText}`, 40, y);
      y += 18;

      autoTable(doc, {
        startY: y,
        head: [['Rows', ...reportColumns.filter((column) => column.type !== 'dimension').map((column) => column.label)]],
        body: [[
          rows.length.toLocaleString(),
          ...reportColumns
            .filter((column) => column.type !== 'dimension')
            .map((column) => formatMetricValue(getColumnValue(totals, column), column.metricKey)),
        ]],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [22, 96, 136] },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14,
        head: [reportColumns.map((column) => column.label)],
        body: rows.map((row) => reportColumns.map((column) => {
          const value = getColumnValue(row, column);
          return column.type === 'dimension' ? value : formatMetricValue(value, column.metricKey);
        })),
        styles: { fontSize: reportColumns.length > 12 ? 6 : 7, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [22, 96, 136] },
        margin: { top: 40, left: 30, right: 30 },
      });

      doc.save(`yearly-trends-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(e?.message || 'Failed to export yearly trends report PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const updateYearFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: String(value || '') }));
  };

  const updateGeoFilter = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value || '' };
      if (field === 'subcounty') {
        next.ward = '';
        next.sublocation = '';
        next.village = '';
      }
      if (field === 'ward') {
        next.sublocation = '';
        next.village = '';
      }
      if (field === 'sublocation') {
        next.village = '';
      }
      return next;
    });
  };

  const toggleDimension = (key) => {
    setSelectedDimensions((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ));
  };

  const toggleMetric = (key) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(key)) {
        return prev.length === 1 ? prev : prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 } }}>
      <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.25 }}>
          Yearly Trends Report
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Counts projects by start year across sub-county, ward, sublocation, and village.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

        <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Grid item xs={6} sm={3} md="auto">
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 125 }}
              label="Start year"
              value={filters.startYear}
              onChange={(e) => updateYearFilter('startYear', e.target.value)}
            >
              {yearOptions.map((year) => (
                <MenuItem key={`start-${year}`} value={String(year)}>
                  {year}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md="auto">
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 125 }}
              label="End year"
              value={filters.endYear}
              onChange={(e) => updateYearFilter('endYear', e.target.value)}
            >
              {yearOptions.map((year) => (
                <MenuItem key={`end-${year}`} value={String(year)}>
                  {year}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md="auto">
            <Autocomplete
              options={geoOptions.subcounties}
              value={filters.subcounty || null}
              loading={geoLoading.subcounties}
              onChange={(event, value) => updateGeoFilter('subcounty', value || '')}
              sx={{ minWidth: 210 }}
              renderInput={(params) => <TextField {...params} fullWidth size="small" label="Sub-county" />}
            />
          </Grid>
          <Grid item xs={12} sm={6} md="auto">
            <Autocomplete
              options={geoOptions.wards}
              value={filters.ward || null}
              loading={geoLoading.wards}
              disabled={!filters.subcounty}
              onChange={(event, value) => updateGeoFilter('ward', value || '')}
              sx={{ minWidth: 210 }}
              renderInput={(params) => <TextField {...params} fullWidth size="small" label="Ward" placeholder={filters.subcounty ? '' : 'Select sub-county first'} />}
            />
          </Grid>
          <Grid item xs={12} sm={6} md="auto">
            <Autocomplete
              options={geoOptions.sublocations}
              value={filters.sublocation || null}
              loading={geoLoading.sublocations}
              disabled={!filters.subcounty || !filters.ward}
              onChange={(event, value) => updateGeoFilter('sublocation', value || '')}
              sx={{ minWidth: 220 }}
              renderInput={(params) => <TextField {...params} fullWidth size="small" label="Sublocation" placeholder={filters.ward ? '' : 'Select ward first'} />}
            />
          </Grid>
          <Grid item xs={12} sm={6} md="auto">
            <Autocomplete
              options={geoOptions.villages}
              value={filters.village || null}
              loading={geoLoading.villages}
              disabled={!filters.subcounty || !filters.ward || !filters.sublocation}
              onChange={(event, value) => updateGeoFilter('village', value || '')}
              sx={{ minWidth: 220 }}
              renderInput={(params) => <TextField {...params} fullWidth size="small" label="Village" placeholder={filters.sublocation ? '' : 'Select sublocation first'} />}
            />
          </Grid>
          <Grid item xs={12} md>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
              <Button size="small" variant="contained" onClick={() => load(filters)} disabled={loading}>
                {loading ? 'Loading...' : 'Browse'}
              </Button>
              <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportExcel} disabled={loading || rows.length === 0}>
                Excel
              </Button>
              <Button size="small" variant="outlined" startIcon={<DescriptionIcon />} onClick={handleExportWord} disabled={loading || exportingWord || rows.length === 0}>
                {exportingWord ? 'Exporting...' : 'Word'}
              </Button>
              <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={loading || exportingPdf || rows.length === 0}>
                {exportingPdf ? 'Exporting...' : 'PDF'}
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ p: 1, mb: 1.25, borderRadius: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.25 }}>
            Report columns
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
                Location columns
              </Typography>
              <Stack direction="row" flexWrap="wrap" columnGap={1.25} rowGap={0}>
                {DIMENSION_COLUMNS.map((column) => (
                  <FormControlLabel
                    key={column.key}
                    sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.82rem' } }}
                    control={
                      <Checkbox
                        size="small"
                        sx={{ py: 0.25 }}
                        checked={selectedDimensions.includes(column.key)}
                        onChange={() => toggleDimension(column.key)}
                      />
                    }
                    label={column.label}
                  />
                ))}
              </Stack>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
                Yearly metrics
              </Typography>
              <Stack direction="row" flexWrap="wrap" columnGap={1.25} rowGap={0}>
                {METRIC_COLUMNS.map((column) => (
                  <FormControlLabel
                    key={column.key}
                    sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.82rem' } }}
                    control={
                      <Checkbox
                        size="small"
                        sx={{ py: 0.25 }}
                        checked={selectedMetrics.includes(column.key)}
                        onChange={() => toggleMetric(column.key)}
                      />
                    }
                    label={column.label}
                  />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                At least one metric remains selected. Budget and Paid use project budget/payment fields when available.
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} />
            <Typography>Loading yearly trends...</Typography>
          </Stack>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {reportColumns.map((column) => (
                    <TableCell
                      key={column.key}
                      align={column.type === 'dimension' ? 'left' : 'right'}
                      sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.subcounty}|${row.ward}|${row.sublocation}|${row.village}`} hover>
                    {reportColumns.map((column) => {
                      const value = getColumnValue(row, column);
                      return (
                        <TableCell key={column.key} align={column.type === 'dimension' ? 'left' : 'right'}>
                          {column.type === 'dimension' ? value : formatMetricValue(value, column.metricKey)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                <TableRow>
                  {reportColumns.map((column, index) => {
                    if (column.type === 'dimension') {
                      return (
                        <TableCell key={column.key} sx={{ fontWeight: 800 }}>
                          {index === 0 ? 'Total' : ''}
                        </TableCell>
                      );
                    }
                    const value = getColumnValue(totals, column);
                    return (
                      <TableCell key={column.key} align="right" sx={{ fontWeight: 800 }}>
                        {formatMetricValue(value, column.metricKey)}
                      </TableCell>
                    );
                  })}
                </TableRow>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={Math.max(reportColumns.length, 1)}>
                      <Alert severity="info">No projects found for the selected year range and filters.</Alert>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
