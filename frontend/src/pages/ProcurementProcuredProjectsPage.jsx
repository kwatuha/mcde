import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import apiService from '../api';

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : 'N/A');

export default function ProcurementProcuredProjectsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.procurement.getCompletedProcurementsHistory();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load procured projects.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box sx={{ p: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>
          Procured projects
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Projects that finished procurement (Contract Signing saved as Approved). The winning bidder was linked as a contractor and the project moved to execution (
          <strong>Not Started</strong>). Workflow steps, bidder assessments, and attachments remain on each project for audit—open the project below to review history.
        </Typography>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Project</strong></TableCell>
                <TableCell><strong>Current status</strong></TableCell>
                <TableCell><strong>Completed at</strong></TableCell>
                <TableCell><strong>Was (procurement)</strong></TableCell>
                <TableCell><strong>Contractor ID</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && rows.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>
                    <Link component={RouterLink} to={`/projects/${r.projectId}`} underline="hover">
                      {r.projectName || `Project ${r.projectId}`}
                    </Link>
                  </TableCell>
                  <TableCell>{r.projectStatus || '-'}</TableCell>
                  <TableCell>{r.procurementCompletedAt ? fmtDate(r.procurementCompletedAt) : '-'}</TableCell>
                  <TableCell>{r.procurementPreviousStatus || '-'}</TableCell>
                  <TableCell>{r.awardedContractorId ?? '-'}</TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No completed handoffs yet. Record <strong>Contract Signing</strong> with decision <strong>Approved</strong> on Project Procurement to list projects here.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} align="center">Loading…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
