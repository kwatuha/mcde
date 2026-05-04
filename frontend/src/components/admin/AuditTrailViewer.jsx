import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { listAuditTrail } from '../../api/auditTrailService';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

function detailPreview(detail) {
  if (detail == null) return '—';
  try {
    const s = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return s.length > 160 ? `${s.slice(0, 160)}…` : s;
  } catch {
    return '—';
  }
}

const emptyQuery = () => ({
  action: '',
  entityType: '',
  entityId: '',
  actorUsername: '',
  from: '',
  to: '',
});

export default function AuditTrailViewer() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState(emptyQuery);
  const [query, setQuery] = useState(emptyQuery);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const offset = page * limit;
      const params = {
        limit,
        offset,
        action: query.action.trim() || undefined,
        entityType: query.entityType.trim() || undefined,
        entityId: query.entityId.trim() || undefined,
        actorUsername: query.actorUsername.trim() || undefined,
        from: query.from.trim() || undefined,
        to: query.to.trim() || undefined,
      };
      const data = await listAuditTrail(params);
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(
        e?.response?.data?.error ||
          e?.response?.data?.details ||
          e?.message ||
          'Failed to load audit trail.'
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, query]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setQuery({ ...draft });
    setPage(0);
  };

  const refresh = () => {
    load();
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Security and operational events (OTP, projects, documents, certificates, inspections). Click &quot;Apply
        filters&quot; to search; pagination loads the next page with the same filters.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }} alignItems="center">
          <TextField
            size="small"
            label="Action contains"
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            placeholder="e.g. project.create"
            sx={{ minWidth: 180 }}
          />
          <TextField
            size="small"
            label="Entity type"
            value={draft.entityType}
            onChange={(e) => setDraft((d) => ({ ...d, entityType: e.target.value }))}
            placeholder="project"
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            label="Entity id"
            value={draft.entityId}
            onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
            sx={{ width: 120 }}
          />
          <TextField
            size="small"
            label="Actor username"
            value={draft.actorUsername}
            onChange={(e) => setDraft((d) => ({ ...d, actorUsername: e.target.value }))}
            sx={{ minWidth: 140 }}
          />
          <TextField
            size="small"
            label="From"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            label="To"
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <Button variant="contained" onClick={applyFilters} disabled={loading}>
            Apply filters
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <TableContainer component={Paper} variant="outlined">
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={36} />
          </Box>
        ) : (
          <>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        No rows match the current filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWhen(row.occurredAt)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {row.action}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {row.entityType || '—'}
                          {row.entityId != null && row.entityId !== '' ? (
                            <>
                              <br />
                              <span style={{ opacity: 0.85 }}>id: {row.entityId}</span>
                            </>
                          ) : null}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.actorUsername || '—'}
                        {row.actorUserId != null ? (
                          <>
                            <br />
                            <Typography component="span" variant="caption" color="text.secondary">
                              user #{row.actorUserId}
                            </Typography>
                          </>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.ipAddress || '—'}
                      </TableCell>
                      <TableCell>
                        <Tooltip
                          title={
                            typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail, null, 2)
                          }
                          placement="left"
                        >
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'default' }}>
                            {detailPreview(row.detail)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={limit}
              onRowsPerPageChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </>
        )}
      </TableContainer>
    </Box>
  );
}
