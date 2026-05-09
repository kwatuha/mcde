import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import apiService from '../api';

const fmtCurrency = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** GET /reports/filter-options returns `{ name, alias }`; support legacy string entries. */
function departmentSelectValueLabel(d) {
  if (d == null) return { value: '', label: '—' };
  if (typeof d === 'string') {
    const v = d.trim();
    return { value: v, label: v || '—' };
  }
  const name = d.name != null ? String(d.name).trim() : '';
  const alias = d.alias != null ? String(d.alias).trim() : '';
  const value = name || alias;
  const label = name && alias && name !== alias ? `${name} (${alias})` : (value || '—');
  return { value, label };
}

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function ProjectFinanceOverviewPage() {
  const [filters, setFilters] = useState({ projectName: '', department: '', limit: 500 });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);

  const load = useCallback(async () => {
    const q = filtersRef.current;
    setLoading(true);
    setError('');
    try {
      const [finance, partner, options] = await Promise.all([
        apiService.reports.getProjectFinanceOverview(q),
        apiService.reports.getPartnerContributions(),
        apiService.reports.getFilterOptions(),
      ]);
      setRows(Array.isArray(finance?.rows) ? finance.rows : []);
      setSummary(finance?.summary || null);
      setPartners(Array.isArray(partner?.rows) ? partner.rows : []);
      setDepartments(Array.isArray(options?.departments) ? options.departments : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load financial overview.');
      setRows([]);
      setPartners([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const topPartners = useMemo(() => partners.slice(0, 5), [partners]);

  const exportStatement = async (projectId) => {
    try {
      const { blob, fileName } = await apiService.reports.downloadProjectFinancialStatement(projectId);
      downloadBlob(blob, fileName);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to export project financial statement.');
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={800}>Project Financing Overview</Typography>
        <Typography variant="body2" color="text.secondary">
          Consolidated financing, partner contributions, certified amounts, pending liabilities and downloadable project financial statements.
        </Typography>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            size="small"
            label="Project Name"
            value={filters.projectName}
            onChange={(e) => setFilters((p) => ({ ...p, projectName: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                load();
              }
            }}
            placeholder="Filter by name, then Apply or Enter"
            fullWidth
          />
          <TextField
            size="small"
            label="Department"
            select
            value={filters.department}
            onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All</MenuItem>
            {departments.map((d, i) => {
              const { value, label } = departmentSelectValueLabel(d);
              return (
                <MenuItem key={`dept-${i}-${value || 'x'}`} value={value}>{label}</MenuItem>
              );
            })}
          </TextField>
          <Button type="button" variant="contained" onClick={load} disabled={loading}>Apply</Button>
        </Stack>
      </Paper>

      {summary ? (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }}>
          <Chip label={`Projects: ${summary.count || 0}`} />
          <Chip label={`Budget: ${fmtCurrency(summary.totalBudget)}`} />
          <Chip label={`Paid: ${fmtCurrency(summary.totalPaid)}`} />
          <Chip label={`Partner Funding: ${fmtCurrency(summary.totalPartnerFunding)}`} />
          <Chip label={`Certified: ${fmtCurrency(summary.totalCertified)}`} />
          <Chip label={`Pending Bills: ${fmtCurrency(summary.totalPendingBills)}`} color="warning" />
        </Stack>
      ) : null}

      <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Project</strong></TableCell>
                <TableCell><strong>Dept</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Budget</strong></TableCell>
                <TableCell align="right"><strong>Paid</strong></TableCell>
                <TableCell align="right"><strong>Partner Funding</strong></TableCell>
                <TableCell align="right"><strong>Certified</strong></TableCell>
                <TableCell align="right"><strong>Pending Bills</strong></TableCell>
                <TableCell align="right"><strong>Absorption %</strong></TableCell>
                <TableCell><strong>Statement</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>{r.projectName}</TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell align="right">{fmtCurrency(r.budgetAmount)}</TableCell>
                  <TableCell align="right">{fmtCurrency(r.paidAmount)}</TableCell>
                  <TableCell align="right">{fmtCurrency(r.partnerFundingAmount)}</TableCell>
                  <TableCell align="right">{fmtCurrency(r.certifiedAmount)}</TableCell>
                  <TableCell align="right">{fmtCurrency(r.pendingBillAmount)}</TableCell>
                  <TableCell align="right">{Number(r.absorptionPercentage || 0).toFixed(1)}%</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => exportStatement(r.projectId)}
                    >
                      Excel
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={10} align="center">No records found.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Top Partner Contributions</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Partner</strong></TableCell>
                <TableCell align="right"><strong>Projects Supported</strong></TableCell>
                <TableCell align="right"><strong>Total Contribution</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topPartners.map((p) => (
                <TableRow key={`${p.partnerId}-${p.partnerName}`}>
                  <TableCell>{p.partnerName}</TableCell>
                  <TableCell align="right">{p.projectsSupported}</TableCell>
                  <TableCell align="right">{fmtCurrency(p.totalContribution)}</TableCell>
                </TableRow>
              ))}
              {!topPartners.length ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">No partner contribution records.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
