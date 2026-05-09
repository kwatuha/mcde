import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : 'N/A');

export default function ProcurementProcuredProjectsPage() {
  const navigate = useNavigate();
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
          <strong>Not Started</strong>). Workflow steps, bidder assessments, and attachments remain on each project for audit.
          Use <strong>View procurement history</strong> to open the same workflow dialog as active projects (browse stages, assessments, attachments) and the workbook viewer from the eye icon—or <strong>Workbook</strong> to jump straight to the HTML workbook.
          If contract signing happened before a purchase order was recorded, use the <strong>LPO / PO</strong> column: an amber badge means no PO activity yet at the
          &quot;Purchase Order Issued&quot; stage. <strong>Record / manage PO</strong> opens the procurement page focused on that stage so you can add details, documents, or replacement POs (e.g. after fiscal year end).
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
                <TableCell><strong>LPO / PO</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && rows.map((r) => {
                const hasPo =
                  r.hasPurchaseOrderRecorded === true ||
                  r.hasPurchaseOrderRecorded === 'true' ||
                  r.hasPurchaseOrderRecorded === 't';
                return (
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
                  <TableCell>
                    <Stack direction="column" spacing={0.75} alignItems="flex-start">
                      {hasPo ? (
                        <Chip size="small" label="PO on file" color="success" variant="outlined" />
                      ) : (
                        <Chip size="small" label="No PO yet" color="warning" variant="outlined" />
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          navigate(ROUTES.PROCUREMENT, {
                            state: { openPoFor: r.projectId },
                          })
                        }
                      >
                        Record / manage PO
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() =>
                          navigate(ROUTES.PROCUREMENT, {
                            state: {
                              openProcurementReviewFor: r.projectId,
                              ...(r.lastWorkflowStage ? { procurementReviewStage: r.lastWorkflowStage } : {}),
                            },
                          })
                        }
                      >
                        View procurement history
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() =>
                          navigate(ROUTES.PROCUREMENT, {
                            state: { openProcurementWorkbookFor: r.projectId },
                          })
                        }
                      >
                        Workbook
                      </Button>
                    </Stack>
                  </TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No completed handoffs yet. Record <strong>Contract Signing</strong> with decision <strong>Approved</strong> on Project Procurement to list projects here.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center">Loading…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
