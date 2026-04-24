import React, { useEffect, useMemo, useState } from 'react';
import {
  alpha,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
  Stack,
  TablePagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import apiService from '../api';

function ProjectsUploadLogPage() {
  const theme = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [detailsRow, setDetailsRow] = useState(null);
  const [query, setQuery] = useState('');
  const [mappingFilter, setMappingFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiService.projects.getProjectUploadLogs();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          const msg = err?.response?.data?.message || err?.message || 'Failed to load projects upload logs.';
          if (String(msg).toLowerCase().includes('invalid project id')) {
            setError(
              'Upload log endpoint is not active on backend yet (request is being routed as /projects/:id). Please add/import-log routes before the generic project-id route.'
            );
          } else {
            setError(msg);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const da = new Date(a?.createdAt || a?.created_at || 0).getTime();
        const db = new Date(b?.createdAt || b?.created_at || 0).getTime();
        return db - da;
      }),
    [rows]
  );

  const extractErrorDetails = (row) => {
    const metadata = row?.metadataJson || {};
    const summary = metadata?.summary || {};
    const mapping = metadata?.importContext?.mappingSummary || {};
    return {
      importMessage: row?.importMessage || '',
      processingErrors: Array.isArray(summary?.errors) ? summary.errors : [],
      rowsWithUnmatchedMetadata: Array.isArray(mapping?.rowsWithUnmatchedMetadata)
        ? mapping.rowsWithUnmatchedMetadata
        : [],
      unmatchedBuckets: {
        sectors: mapping?.sectors?.unmatched || [],
        ministries: mapping?.ministries?.unmatched || [],
        stateDepartments: mapping?.stateDepartments?.unmatched || [],
        counties: mapping?.counties?.unmatched || [],
        constituencies: mapping?.constituencies?.unmatched || [],
        wards: mapping?.kenyaWards?.unmatched || [],
      },
    };
  };

  const getRowComputed = (row) => {
    const details = extractErrorDetails(row);
    const mappingErrorCount =
      details.processingErrors.length + details.rowsWithUnmatchedMetadata.length;
    const mappingErrors =
      row?.hadMappingErrors === true ||
      row?.mappingErrors === true ||
      Number(row?.mappingErrorCount ?? 0) > 0 ||
      mappingErrorCount > 0;
    return { details, mappingErrorCount, mappingErrors };
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedRows.filter((row) => {
      const { mappingErrors } = getRowComputed(row);
      if (mappingFilter === 'errors' && !mappingErrors) return false;
      if (mappingFilter === 'clean' && mappingErrors) return false;
      if (!q) return true;
      const hay = [
        row?.fullName,
        row?.userFullName,
        row?.uploadedByName,
        row?.roleName,
        row?.userRole,
        row?.ministry,
        row?.stateDepartment,
        row?.uploadedFileName,
        row?.importMessage,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedRows, query, mappingFilter]);

  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const stats = useMemo(() => {
    const withErrors = sortedRows.filter((r) => getRowComputed(r).mappingErrors).length;
    return {
      total: sortedRows.length,
      withErrors,
      clean: sortedRows.length - withErrors,
    };
  }, [sortedRows]);

  const handleDownload = async (row) => {
    const id = row?.id ?? row?.logId ?? row?.uploadLogId;
    if (!id) return;
    setDownloadingId(id);
    try {
      const blob = await apiService.projects.downloadProjectUploadLogFile(id);
      const filename =
        row?.originalFileName || row?.uploadedFileName || `projects-upload-${id}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to download uploaded file.';
      if (String(msg).toLowerCase().includes('invalid project id')) {
        setError(
          'Download endpoint is not active on backend yet (request is being routed as /projects/:id). Please add/import-log file route before the generic project-id route.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Projects Upload Log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review how users import projects data, including mapping results and inserted/updated rows.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search user, role, file, ministry..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 280, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Chip
          label={`All (${sortedRows.length})`}
          color={mappingFilter === 'all' ? 'primary' : 'default'}
          onClick={() => {
            setMappingFilter('all');
            setPage(0);
          }}
          clickable
        />
        <Chip
          label={`With errors (${sortedRows.filter((r) => getRowComputed(r).mappingErrors).length})`}
          color={mappingFilter === 'errors' ? 'warning' : 'default'}
          onClick={() => {
            setMappingFilter('errors');
            setPage(0);
          }}
          clickable
        />
        <Chip
          label={`Clean (${sortedRows.filter((r) => !getRowComputed(r).mappingErrors).length})`}
          color={mappingFilter === 'clean' ? 'success' : 'default'}
          onClick={() => {
            setMappingFilter('clean');
            setPage(0);
          }}
          clickable
        />
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper
        elevation={0}
        sx={{
          border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.05)}`,
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.04 : 0.12),
          }}
        >
          <Chip
            icon={<UploadFileIcon />}
            variant="outlined"
            color="primary"
            label={`Total logs: ${stats.total}`}
            size="small"
          />
          <Chip
            icon={<WarningAmberIcon />}
            variant="outlined"
            color="warning"
            label={`Needs attention: ${stats.withErrors}`}
            size="small"
          />
          <Chip
            icon={<CheckCircleOutlineIcon />}
            variant="outlined"
            color="success"
            label={`Clean imports: ${stats.clean}`}
            size="small"
          />
        </Stack>
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: '68vh' }}>
            <Table size="small">
              <TableHead
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  bgcolor: theme.palette.background.paper,
                }}
              >
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Uploaded At</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>State Department</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Inserted</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Updated</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Mapping Errors</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.map((row) => {
                  const id = row?.id ?? row?.logId ?? row?.uploadLogId;
                  const inserted = Number(row?.rowsInserted ?? row?.insertedRows ?? 0);
                  const updated = Number(row?.rowsUpdated ?? row?.updatedRows ?? 0);
                  const { mappingErrorCount, mappingErrors } = getRowComputed(row);
                  return (
                    <TableRow
                      key={id || `${row?.createdAt}-${row?.uploadedFileName}`}
                      hover
                      sx={{
                        '&:nth-of-type(odd)': {
                          bgcolor: alpha(theme.palette.action.hover, 0.35),
                        },
                        '& td': {
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.55)}`,
                          py: 1.1,
                        },
                      }}
                    >
                      <TableCell>
                        {row?.createdAt || row?.created_at
                          ? new Date(row.createdAt || row.created_at).toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell>{row?.fullName || row?.userFullName || row?.uploadedByName || '—'}</TableCell>
                      <TableCell>{row?.roleName || row?.userRole || '—'}</TableCell>
                      <TableCell>{row?.stateDepartment || row?.stateDepartmentName || '—'}</TableCell>
                      <TableCell align="right">{inserted}</TableCell>
                      <TableCell align="right">{updated}</TableCell>
                      <TableCell>
                        {mappingErrors ? (
                          <Chip
                            size="small"
                            color="warning"
                            icon={<WarningAmberIcon />}
                            label={`Yes${mappingErrorCount ? ` (${mappingErrorCount})` : ''}`}
                          />
                        ) : (
                          <Chip
                            size="small"
                            color="success"
                            variant="outlined"
                            icon={<CheckCircleOutlineIcon />}
                            label="No"
                          />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Tooltip title="View full import details">
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<VisibilityIcon />}
                              onClick={() => setDetailsRow(row)}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Details
                            </Button>
                          </Tooltip>
                          <Tooltip title="Download uploaded source file">
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<DownloadIcon />}
                                onClick={() => handleDownload(row)}
                                disabled={downloadingId === id || !id}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                              >
                                {downloadingId === id ? 'Downloading...' : 'Download'}
                              </Button>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No upload logs found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      {!loading ? (
        <TablePagination
          component="div"
          count={filteredRows.length}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      ) : null}

      <Dialog open={detailsRow != null} onClose={() => setDetailsRow(null)} maxWidth="md" fullWidth>
        <DialogTitle>Upload Error Details</DialogTitle>
        <DialogContent dividers>
          {detailsRow ? (
            <Box sx={{ display: 'grid', gap: 1 }}>
              <Typography variant="body2">
                <strong>File:</strong> {detailsRow?.uploadedFileName || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Import message:</strong> {detailsRow?.importMessage || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Ministry:</strong> {detailsRow?.ministry || detailsRow?.ministryName || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>State Department:</strong> {detailsRow?.stateDepartment || detailsRow?.stateDepartmentName || '—'}
              </Typography>
              {(() => {
                const details = extractErrorDetails(detailsRow);
                return (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>
                      Row/processing errors
                    </Typography>
                    {details.processingErrors.length ? (
                      <Box component="ul" sx={{ mt: 0, mb: 0, pl: 2.5 }}>
                        {details.processingErrors.slice(0, 100).map((e, idx) => (
                          <li key={`${idx}-${e}`}>
                            <Typography variant="body2">{e}</Typography>
                          </li>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No processing errors logged.</Typography>
                    )}

                    <Typography variant="subtitle2" sx={{ mt: 1 }}>
                      Mapping mismatches by row
                    </Typography>
                    {details.rowsWithUnmatchedMetadata.length ? (
                      <Box component="ul" sx={{ mt: 0, mb: 0, pl: 2.5 }}>
                        {details.rowsWithUnmatchedMetadata.slice(0, 100).map((r, idx) => (
                          <li key={`${idx}-${r?.rowNumber || idx}`}>
                            <Typography variant="body2">
                              Row {r?.rowNumber || '?'} ({r?.projectName || 'Unknown'}): {(r?.unmatched || []).join('; ')}
                            </Typography>
                          </li>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No row-level mapping mismatch details logged.</Typography>
                    )}
                  </>
                );
              })()}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsRow(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ProjectsUploadLogPage;
