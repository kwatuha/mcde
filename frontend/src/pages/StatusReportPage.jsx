import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Chip,
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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../api';
import reportsService from '../api/reportsService';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

const DEFAULT_FILTERS = {
  financialYear: '',
  department: '',
  status: '',
  subcounty: '',
  ward: '',
  sublocation: '',
  village: '',
  projectName: '',
};

const STATUS_ORDER = ['Completed', 'Ongoing', 'Not started', 'Under Procurement', 'Stalled', 'Suspended', 'Other'];
const REPORT_COLUMNS = [
  { key: 'projectName', label: 'Project', width: 38 },
  { key: 'department', label: 'Department', width: 26 },
  { key: 'financialYear', label: 'Financial Year', width: 16 },
  { key: 'subcounty', label: 'Sub-county', width: 18 },
  { key: 'ward', label: 'Ward', width: 20 },
  { key: 'sublocation', label: 'Sublocation', width: 20 },
  { key: 'village', label: 'Village', width: 20 },
  { key: 'startDate', label: 'Start Date', width: 15 },
  { key: 'endDate', label: 'End Date', width: 15 },
  { key: 'budget', label: 'Budget', width: 16, numeric: true },
  { key: 'paid', label: 'Paid', width: 16, numeric: true },
  { key: 'balance', label: 'Balance', width: 16, numeric: true },
  { key: 'status', label: 'Original Status', width: 24 },
];

function cleanFilters(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => String(value ?? '').trim() !== '')
  );
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatCellValue(row, column) {
  if (column.numeric) return Number(row?.[column.key] || 0);
  if (column.key === 'startDate' || column.key === 'endDate') return formatDate(row?.[column.key]);
  return row?.[column.key] || '';
}

function hexToRgb(hex) {
  const normalized = String(hex || '#757575').replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function sanitizeSheetName(name) {
  return String(name || 'Status')
    .replace(/[\][*?/\\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Status';
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function saveExcelXml(xml, fileName) {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function statusTitle(status) {
  return `${status} Projects`;
}

function styleIdForStatus(status) {
  return `Status_${String(status || 'Other').replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function excelCell(value, styleId = '', numeric = false, mergeAcross = null) {
  const attrs = [
    styleId ? `ss:StyleID="${styleId}"` : '',
    mergeAcross ? `ss:MergeAcross="${mergeAcross}"` : '',
  ].filter(Boolean).join(' ');
  const cellAttrs = attrs ? ` ${attrs}` : '';
  if (numeric) {
    const numberValue = Number(value || 0);
    return `<Cell${cellAttrs}><Data ss:Type="Number">${Number.isFinite(numberValue) ? numberValue : 0}</Data></Cell>`;
  }
  return `<Cell${cellAttrs}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function excelHeaderRow() {
  return `<Row>${['#', ...REPORT_COLUMNS.map((column) => column.label)]
    .map((label) => excelCell(label, 'Header'))
    .join('')}</Row>`;
}

function excelProjectRow(row, index, status) {
  const styleId = styleIdForStatus(status);
  const cells = [
    excelCell(index, styleId, true),
    ...REPORT_COLUMNS.map((column) => excelCell(formatCellValue(row, column), styleId, column.numeric)),
  ];
  return `<Row>${cells.join('')}</Row>`;
}

function excelColumnsXml() {
  return [
    '<Column ss:Width="40"/>',
    ...REPORT_COLUMNS.map((column) => `<Column ss:Width="${Math.max(60, column.width * 7)}"/>`),
  ].join('');
}

function buildStatusStylesXml(groups) {
  const statusStyles = groups.map((group) => {
    const backgroundColor = getProjectStatusBackgroundColor(group.status);
    const textColor = getProjectStatusTextColor(group.status) === 'black' ? '#000000' : '#FFFFFF';
    const styleId = styleIdForStatus(group.status);
    return `
      <Style ss:ID="${styleId}">
        <Font ss:Color="${textColor}"/>
        <Interior ss:Color="${backgroundColor}" ss:Pattern="Solid"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/>
        </Borders>
      </Style>
      <Style ss:ID="${styleId}_Section">
        <Font ss:Bold="1" ss:Color="${textColor}"/>
        <Interior ss:Color="${backgroundColor}" ss:Pattern="Solid"/>
      </Style>
    `;
  }).join('');

  return `
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal">
        <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      </Style>
      <Style ss:ID="Title">
        <Font ss:Bold="1" ss:Size="16"/>
      </Style>
      <Style ss:ID="Header">
        <Font ss:Bold="1" ss:Color="#FFFFFF"/>
        <Interior ss:Color="#1F4E79" ss:Pattern="Solid"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
        </Borders>
      </Style>
      ${statusStyles}
    </Styles>
  `;
}

function buildMainWorksheetXml(groups) {
  const rowsXml = groups.map((group) => `
    <Row>
      ${excelCell(`${statusTitle(group.status)} (${group.rows.length})`, `${styleIdForStatus(group.status)}_Section`, false, REPORT_COLUMNS.length)}
    </Row>
    ${excelHeaderRow()}
    ${group.rows.map((row, index) => excelProjectRow(row, index + 1, group.status)).join('')}
    <Row/>
    <Row/>
  `).join('');

  return `
    <Worksheet ss:Name="Status Report">
      <Table>
        ${excelColumnsXml()}
        <Row>${excelCell('Projects Status Report', 'Title', false, REPORT_COLUMNS.length)}</Row>
        <Row>${excelCell(`Generated: ${new Date().toLocaleString()}`, '', false, REPORT_COLUMNS.length)}</Row>
        <Row/>
        ${rowsXml}
      </Table>
    </Worksheet>
  `;
}

function buildStatusWorksheetXml(group) {
  return `
    <Worksheet ss:Name="${escapeXml(sanitizeSheetName(group.status))}">
      <Table>
        ${excelColumnsXml()}
        ${excelHeaderRow()}
        ${group.rows.map((row, index) => excelProjectRow(row, index + 1, group.status)).join('')}
      </Table>
    </Worksheet>
  `;
}

function buildExcelWorkbookXml(groups, includeStatusSheets) {
  const statusSheets = includeStatusSheets ? groups.map(buildStatusWorksheetXml).join('') : '';
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${buildStatusStylesXml(groups)}
  ${buildMainWorksheetXml(groups)}
  ${statusSheets}
</Workbook>`;
}

function buildGroupedRows(rows, selectedStatus) {
  const filteredRows = selectedStatus
    ? rows.filter((row) => normalizeProjectStatus(row.status) === selectedStatus)
    : rows;
  const groups = STATUS_ORDER.map((status) => ({
    status,
    rows: filteredRows.filter((row) => normalizeProjectStatus(row.status) === status),
  })).filter((group) => group.rows.length > 0);

  const customStatuses = [...new Set(filteredRows.map((row) => normalizeProjectStatus(row.status)))]
    .filter((status) => !STATUS_ORDER.includes(status));
  customStatuses.forEach((status) => {
    const statusRows = filteredRows.filter((row) => normalizeProjectStatus(row.status) === status);
    if (statusRows.length) groups.push({ status, rows: statusRows });
  });

  return groups;
}

export default function StatusReportPage() {
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [rows, setRows] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ departments: [], financialYears: [] });
  const [geoOptions, setGeoOptions] = useState({ subcounties: [], wards: [], sublocations: [], villages: [] });
  const [geoLoading, setGeoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [includeStatusSheets, setIncludeStatusSheets] = useState(true);
  const [error, setError] = useState('');

  const groupedRows = useMemo(() => buildGroupedRows(rows, filters.status), [rows, filters.status]);
  const visibleRows = useMemo(() => groupedRows.flatMap((group) => group.rows), [groupedRows]);
  const totalBudget = useMemo(() => visibleRows.reduce((sum, row) => sum + Number(row.budget || 0), 0), [visibleRows]);
  const totalPaid = useMemo(() => visibleRows.reduce((sum, row) => sum + Number(row.paid || 0), 0), [visibleRows]);
  const totalBalance = useMemo(() => visibleRows.reduce((sum, row) => sum + Number(row.balance || 0), 0), [visibleRows]);

  const departmentOptions = useMemo(
    () => (filterOptions.departments || []).map((item) => item?.name || item?.alias || item).filter(Boolean),
    [filterOptions.departments]
  );
  const financialYearOptions = useMemo(
    () => (filterOptions.financialYears || []).map((item) => item?.name || item).filter(Boolean),
    [filterOptions.financialYears]
  );
  const statusOptions = useMemo(() => {
    const loaded = [...new Set(rows.map((row) => normalizeProjectStatus(row.status)))].filter(Boolean);
    return STATUS_ORDER.filter((status) => loaded.includes(status) || ['Completed', 'Ongoing', 'Other'].includes(status));
  }, [rows]);

  const load = useCallback(async (nextFilters = DEFAULT_FILTERS) => {
    setLoading(true);
    setError('');
    try {
      const { status: _status, ...apiFilters } = nextFilters;
      const response = await reportsService.getStatusReport(cleanFilters(apiFilters));
      setRows(response?.rows || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load status report.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    reportsService.getFilterOptions()
      .then((data) => {
        if (mounted) setFilterOptions(data || {});
      })
      .catch(() => {
        if (mounted) setFilterOptions({ departments: [], financialYears: [] });
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    load(DEFAULT_FILTERS);
  }, [load]);

  useEffect(() => {
    let mounted = true;
    const fetchGeo = async () => {
      setGeoLoading(true);
      try {
        const [subcounties, wards, sublocations, villages] = await Promise.all([
          apiService.kenyaWards.getCatalogSubcounties(),
          filters.subcounty ? apiService.kenyaWards.getCatalogWardsBySubcounty(filters.subcounty) : Promise.resolve([]),
          filters.ward ? apiService.kenyaWards.getSublocations(filters.subcounty, filters.ward) : Promise.resolve([]),
          filters.sublocation
            ? apiService.kenyaWards.getVillages(filters.subcounty, filters.ward, filters.sublocation)
            : Promise.resolve([]),
        ]);
        if (!mounted) return;
        setGeoOptions({
          subcounties: subcounties || [],
          wards: wards || [],
          sublocations: sublocations || [],
          villages: villages || [],
        });
      } catch {
        if (mounted) setGeoOptions({ subcounties: [], wards: [], sublocations: [], villages: [] });
      } finally {
        if (mounted) setGeoLoading(false);
      }
    };
    fetchGeo();
    return () => {
      mounted = false;
    };
  }, [filters.subcounty, filters.ward, filters.sublocation]);

  const updateFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value || '' };
      if (key === 'subcounty') {
        next.ward = '';
        next.sublocation = '';
        next.village = '';
      }
      if (key === 'ward') {
        next.sublocation = '';
        next.village = '';
      }
      if (key === 'sublocation') {
        next.village = '';
      }
      return next;
    });
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const workbookXml = buildExcelWorkbookXml(groupedRows, includeStatusSheets);
      saveExcelXml(workbookXml, `status-report-${new Date().toISOString().slice(0, 10)}.xls`);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      let y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        logoDataUrl: await getCountyLogoDataUrl(),
        title: 'Projects Status Report',
        subtitle: `Generated ${new Date().toLocaleString()}`,
      });
      doc.setFontSize(9);
      doc.text(`Projects: ${visibleRows.length} | Budget: ${formatCurrency(totalBudget)} | Paid: ${formatCurrency(totalPaid)}`, 40, y + 12);
      y += 28;

      groupedRows.forEach((group) => {
        if (y > 500) {
          doc.addPage();
          y = 40;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`${statusTitle(group.status)} (${group.rows.length})`, 40, y);
        const fillColor = hexToRgb(getProjectStatusBackgroundColor(group.status));
        autoTable(doc, {
          startY: y + 8,
          head: [['#', ...REPORT_COLUMNS.map((column) => column.label)]],
          body: group.rows.map((row, index) => [
            index + 1,
            ...REPORT_COLUMNS.map((column) => column.numeric ? formatCurrency(row[column.key]) : formatCellValue(row, column)),
          ]),
          styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
          headStyles: { fillColor, textColor: getProjectStatusTextColor(group.status) === 'black' ? 0 : 255 },
          didParseCell: (data) => {
            if (data.section === 'body') {
              data.cell.styles.fillColor = fillColor;
              data.cell.styles.textColor = getProjectStatusTextColor(group.status) === 'black' ? 0 : 255;
            }
          },
          margin: { left: 24, right: 24 },
        });
        y = (doc.lastAutoTable?.finalY || y) + 24;
      });
      doc.save(`status-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Status Report</Typography>
            <Typography variant="body2" color="text.secondary">
              Browse projects grouped by status and export a color-coded status workbook.
            </Typography>
          </Box>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                size="small"
                label="Financial Year"
                value={filters.financialYear}
                onChange={(event) => updateFilter('financialYear', event.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">All years</MenuItem>
                {financialYearOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Autocomplete
                size="small"
                options={departmentOptions}
                value={filters.department || null}
                onChange={(_, value) => updateFilter('department', value)}
                renderInput={(params) => <TextField {...params} label="Department" sx={{ minWidth: 200 }} />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                size="small"
                label="Status"
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">All statuses</MenuItem>
                {statusOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="Project name"
                value={filters.projectName}
                onChange={(event) => updateFilter('projectName', event.target.value)}
                sx={{ minWidth: 200 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Autocomplete
                size="small"
                loading={geoLoading}
                options={geoOptions.subcounties}
                value={filters.subcounty || null}
                onChange={(_, value) => updateFilter('subcounty', value)}
                renderInput={(params) => <TextField {...params} label="Sub-county" sx={{ minWidth: 190 }} />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Autocomplete
                size="small"
                loading={geoLoading}
                options={geoOptions.wards}
                value={filters.ward || null}
                onChange={(_, value) => updateFilter('ward', value)}
                renderInput={(params) => <TextField {...params} label="Ward" sx={{ minWidth: 190 }} />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Autocomplete
                size="small"
                loading={geoLoading}
                options={geoOptions.sublocations}
                value={filters.sublocation || null}
                onChange={(_, value) => updateFilter('sublocation', value)}
                renderInput={(params) => <TextField {...params} label="Sublocation" sx={{ minWidth: 190 }} />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Autocomplete
                size="small"
                loading={geoLoading}
                options={geoOptions.villages}
                value={filters.village || null}
                onChange={(_, value) => updateFilter('village', value)}
                renderInput={(params) => <TextField {...params} label="Village" sx={{ minWidth: 190 }} />}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="contained" onClick={() => load(filters)} disabled={loading}>
                  {loading ? <CircularProgress size={18} color="inherit" /> : 'Browse'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={handleExportPdf}
                  disabled={loading || exportingPdf || visibleRows.length === 0}
                >
                  PDF
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportExcel}
                  disabled={loading || exportingExcel || visibleRows.length === 0}
                >
                  Excel
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setFilters({ ...DEFAULT_FILTERS });
                    load(DEFAULT_FILTERS);
                  }}
                >
                  Reset
                </Button>
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeStatusSheets}
                    onChange={(event) => setIncludeStatusSheets(event.target.checked)}
                  />
                }
                label="Add separate Excel sheets for each status"
              />
            </Grid>
          </Grid>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">Projects</Typography>
            <Typography variant="h6">{visibleRows.length.toLocaleString()}</Typography>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">Budget</Typography>
            <Typography variant="h6">KES {formatCurrency(totalBudget)}</Typography>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">Paid</Typography>
            <Typography variant="h6">KES {formatCurrency(totalPaid)}</Typography>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">Balance</Typography>
            <Typography variant="h6">KES {formatCurrency(totalBalance)}</Typography>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Paper>
      ) : groupedRows.length === 0 ? (
        <Alert severity="info">No projects found for the selected filters.</Alert>
      ) : (
        <Stack spacing={2}>
          {groupedRows.map((group) => (
            <Paper key={group.status} sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Chip
                  label={`${statusTitle(group.status)} (${group.rows.length})`}
                  sx={{
                    fontWeight: 700,
                    backgroundColor: getProjectStatusBackgroundColor(group.status),
                    color: getProjectStatusTextColor(group.status),
                  }}
                />
              </Stack>
              <TableContainer sx={{ maxHeight: 520 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      {REPORT_COLUMNS.map((column) => (
                        <TableCell key={column.key} align={column.numeric ? 'right' : 'left'}>
                          {column.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.rows.map((row, index) => (
                      <TableRow
                        key={row.projectId || `${group.status}-${index}`}
                        sx={{
                          backgroundColor: getProjectStatusBackgroundColor(group.status),
                          '& td': { color: getProjectStatusTextColor(group.status) },
                          '&:hover': { opacity: 0.9 },
                        }}
                      >
                        <TableCell>{index + 1}</TableCell>
                        {REPORT_COLUMNS.map((column) => (
                          <TableCell key={column.key} align={column.numeric ? 'right' : 'left'}>
                            {column.numeric ? formatCurrency(row[column.key]) : formatCellValue(row, column)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
