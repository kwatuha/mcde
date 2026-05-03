import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Link as MuiLink,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  TablePagination,
  Paper,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ArticleIcon from '@mui/icons-material/Article';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import WarningIcon from '@mui/icons-material/Warning';
import CancelIcon from '@mui/icons-material/Cancel';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Link, useSearchParams } from 'react-router-dom';
import Header from './dashboard/Header';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext';
import ProjectDocumentsAttachments from '../components/ProjectDocumentsAttachments';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor, formatStatus } from '../utils/tableHelpers';

function getProjectId(p) {
  if (p == null) return null;
  return p.project_id ?? p.projectId ?? p.id ?? null;
}

function getProjectDisplayName(p) {
  if (p == null) return 'Unknown project';
  return p.name || p.projectName || p.project_name || `Project ${getProjectId(p) ?? ''}`.trim();
}

/** Same shape as project registry list rows (status + JSONB progress). */
function rawProjectStatus(p) {
  if (!p || typeof p !== 'object') return '';
  const top = p.status ?? p.Status;
  if (top != null && top !== '') return String(top);
  let prog = p.progress;
  if (typeof prog === 'string' && prog.trim().startsWith('{')) {
    try {
      prog = JSON.parse(prog);
    } catch {
      prog = null;
    }
  }
  if (prog && typeof prog === 'object') {
    const nested = prog.status ?? prog.Status;
    if (nested != null && nested !== '') return String(nested);
  }
  return '';
}

function ProjectRegistryStatusChip({ status, isLight }) {
  if (!status) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  const normalizedStatus = status.toLowerCase() || '';
  const getStatusIcon = () => {
    if (normalizedStatus.includes('completed') || normalizedStatus.includes('closed')) {
      return <CheckCircleIcon sx={{ fontSize: 16 }} />;
    }
    if (
      normalizedStatus.includes('progress') ||
      normalizedStatus.includes('ongoing') ||
      normalizedStatus.includes('initiated')
    ) {
      return <PlayArrowIcon sx={{ fontSize: 16 }} />;
    }
    if (normalizedStatus.includes('hold') || normalizedStatus.includes('paused')) {
      return <PauseIcon sx={{ fontSize: 16 }} />;
    }
    if (normalizedStatus.includes('risk') || normalizedStatus.includes('at risk')) {
      return <WarningIcon sx={{ fontSize: 16 }} />;
    }
    if (normalizedStatus.includes('cancelled') || normalizedStatus.includes('canceled')) {
      return <CancelIcon sx={{ fontSize: 16 }} />;
    }
    if (normalizedStatus.includes('stalled') || normalizedStatus.includes('delayed')) {
      return <ScheduleIcon sx={{ fontSize: 16 }} />;
    }
    if (normalizedStatus.includes('planning') || normalizedStatus.includes('not started')) {
      return <ScheduleIcon sx={{ fontSize: 16 }} />;
    }
    return <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />;
  };

  const bgColor = getProjectStatusBackgroundColor(status);
  const textColor = getProjectStatusTextColor(status);

  return (
    <Chip
      icon={getStatusIcon()}
      label={formatStatus(status)}
      size="small"
      sx={{
        backgroundColor: bgColor,
        color: textColor,
        fontWeight: 600,
        fontSize: '0.75rem',
        height: '26px',
        minWidth: '100px',
        maxWidth: '100%',
        '& .MuiChip-icon': {
          color: textColor,
          marginLeft: '6px',
        },
        '& .MuiChip-label': {
          paddingLeft: '4px',
          paddingRight: '8px',
        },
        boxShadow: isLight
          ? '0 2px 4px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)'
          : '0 2px 6px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)',
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: '6px',
        transition: 'all 0.2s ease-in-out',
        cursor: 'default',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: isLight
            ? '0 4px 8px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)'
            : '0 4px 10px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)',
          borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)',
        },
      }}
    />
  );
}

/** Lowercase blob for finding projects by agency, location, status, etc. */
function projectSearchBlob(p) {
  const parts = [
    getProjectDisplayName(p),
    p._pid,
    p.status,
    p.implementing_agency,
    p.departmentName,
    p.departmentAlias,
    p.ministry,
    p.sectionName,
    p.stateDepartment,
    p.wardNames,
    p.ward,
    p.constituencyNames,
    p.constituency,
    p.subcountyNames,
    p.subcounty,
    p.categoryName,
    p.sector,
    p.programName,
    p.budgetSource,
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatShortDate(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(value);
  }
}

function registryRowProjectId(r) {
  return r.projectId ?? r.projectid ?? r.project_id;
}

function isRegistryRowFlagged(r) {
  const v = r.isFlagged ?? r.isflagged;
  return v === true || v === 1 || String(v).toLowerCase() === 'true';
}

export default function ProjectDocumentsByProjectPage() {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPrivilege } = useAuth();
  const canUse =
    hasPrivilege &&
    (hasPrivilege('document.read_all') || hasPrivilege('document.create'));
  const canSeeRegistry = Boolean(hasPrivilege && hasPrivilege('document.read_all'));

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [documentsModalProjectId, setDocumentsModalProjectId] = useState(null);

  const [viewMode, setViewMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('view') === 'documents'
        ? 'documents'
        : 'projects';
    } catch {
      return 'projects';
    }
  });
  const [docFilter, setDocFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const [registryRows, setRegistryRows] = useState([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState(null);
  const [registrySearch, setRegistrySearch] = useState(() => searchParams.get('rq') || '');
  const [registryPage, setRegistryPage] = useState(0);
  const [registryRowsPerPage, setRegistryRowsPerPage] = useState(25);
  const [registryFlagFilter, setRegistryFlagFilter] = useState('all');

  const [copySnackbar, setCopySnackbar] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 400);
  const debouncedRegistrySearch = useDebouncedValue(registrySearch, 400);

  const openDocumentsModal = useCallback((pid) => {
    if (pid == null) return;
    setDocumentsModalProjectId(pid);
    setDocumentsModalOpen(true);
  }, []);

  const closeDocumentsModal = useCallback(() => {
    setDocumentsModalOpen(false);
    setDocumentsModalProjectId(null);
  }, []);

  useEffect(() => {
    if (!documentsModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDocumentsModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documentsModalOpen, closeDocumentsModal]);

  const loadProjects = useCallback(async () => {
    if (!canUse) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.projects.getProjects({ limit: 5000 });
      const list = Array.isArray(data?.projects) ? data.projects : Array.isArray(data) ? data : [];
      const normalized = list
        .map((p) => ({ ...p, _pid: getProjectId(p) }))
        .filter((p) => p._pid != null);
      setProjects(normalized);
    } catch (e) {
      const d = e.response?.data;
      const parts = [
        d?.message,
        d?.error && String(d.error),
        d?.detail && String(d.detail),
      ].filter(Boolean);
      setError(parts.length ? parts.join(' — ') : e.message || 'Failed to load projects.');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [canUse]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!canUse || !canSeeRegistry) return;
    let cancelled = false;
    (async () => {
      setRegistryLoading(true);
      setRegistryError(null);
      try {
        const rows = await apiService.documents.getDocumentsByProjectRegistry();
        if (!cancelled) setRegistryRows(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!cancelled) {
          const d = e.response?.data;
          setRegistryError(
            [d?.message, d?.error && String(d.error)].filter(Boolean).join(' — ') ||
              e.message ||
              'Could not load document index.'
          );
          setRegistryRows([]);
        }
      } finally {
        if (!cancelled) setRegistryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUse, canSeeRegistry]);

  const docCountByProject = useMemo(() => {
    const m = new Map();
    for (const r of registryRows) {
      const pid = registryRowProjectId(r);
      if (pid == null) continue;
      const k = String(pid);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [registryRows]);

  const queryProjectId = searchParams.get('projectId');
  const openedFromQueryRef = useRef(null);

  useEffect(() => {
    if (!canSeeRegistry && viewMode === 'documents') setViewMode('projects');
  }, [canSeeRegistry, viewMode]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const t = debouncedSearch.trim();
        if (t) next.set('q', t);
        else next.delete('q');
        const rt = debouncedRegistrySearch.trim();
        if (rt) next.set('rq', rt);
        else next.delete('rq');
        return next;
      },
      { replace: true }
    );
  }, [debouncedSearch, debouncedRegistrySearch, setSearchParams]);

  const setViewInUrl = useCallback(
    (mode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (mode === 'documents' && canSeeRegistry) next.set('view', 'documents');
          else next.delete('view');
          return next;
        },
        { replace: true }
      );
    },
    [canSeeRegistry, setSearchParams]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = projects.filter((p) => projectSearchBlob(p).includes(q));
    }
    if (canSeeRegistry && docFilter !== 'all') {
      list = list.filter((p) => {
        const c = docCountByProject.get(String(p._pid)) || 0;
        if (docFilter === 'with') return c > 0;
        if (docFilter === 'without') return c === 0;
        return true;
      });
    }
    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'documents' && canSeeRegistry) {
        const ca = docCountByProject.get(String(a._pid)) || 0;
        const cb = docCountByProject.get(String(b._pid)) || 0;
        if (cb !== ca) return cb - ca;
      }
      if (sortBy === 'status') {
        const sa = String(a.status || '').toLowerCase();
        const sb = String(b.status || '').toLowerCase();
        const cmp = sa.localeCompare(sb);
        if (cmp !== 0) return cmp;
      }
      return String(getProjectDisplayName(a)).localeCompare(String(getProjectDisplayName(b)), undefined, {
        sensitivity: 'base',
      });
    });
    return sorted;
  }, [projects, search, docFilter, sortBy, docCountByProject, canSeeRegistry]);

  useEffect(() => {
    if (queryProjectId == null || queryProjectId === '' || projects.length === 0) return;
    if (openedFromQueryRef.current === queryProjectId) return;
    const match = projects.some((p) => String(p._pid) === String(queryProjectId));
    if (!match) return;
    openedFromQueryRef.current = queryProjectId;
    openDocumentsModal(queryProjectId);
    const idx = filtered.findIndex((p) => String(p._pid) === String(queryProjectId));
    if (idx >= 0) {
      setPage(Math.floor(idx / rowsPerPage));
    }
  }, [queryProjectId, projects, filtered, rowsPerPage, openDocumentsModal]);

  const paginated = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const registryFiltered = useMemo(() => {
    const q = registrySearch.trim().toLowerCase();
    let rows = registryRows;
    if (q) {
      rows = rows.filter((r) => {
        const blob = [
          r.projectDisplayName,
          r.projectdisplayname,
          registryRowProjectId(r),
          r.documentType,
          r.originalFileName,
          r.documentPath,
          r.description,
        r.documentCategory,
      ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (registryFlagFilter === 'flagged') {
      rows = rows.filter((r) => isRegistryRowFlagged(r));
    }
    return rows;
  }, [registryRows, registrySearch, registryFlagFilter]);

  const registryPaginated = useMemo(() => {
    const start = registryPage * registryRowsPerPage;
    return registryFiltered.slice(start, start + registryRowsPerPage);
  }, [registryFiltered, registryPage, registryRowsPerPage]);

  const modalProjectMeta = useMemo(() => {
    if (documentsModalProjectId == null) return null;
    return projects.find((p) => String(p._pid) === String(documentsModalProjectId)) || null;
  }, [projects, documentsModalProjectId]);

  const summary = useMemo(() => {
    const withDocs = projects.filter((p) => (docCountByProject.get(String(p._pid)) || 0) > 0).length;
    return {
      total: projects.length,
      withDocs,
      without: projects.length - withDocs,
      filesIndexed: registryRows.length,
    };
  }, [projects, docCountByProject, registryRows.length]);

  const handleCopyShareLink = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      const next = new URLSearchParams(url.search);
      const t = search.trim();
      if (t) next.set('q', t);
      else next.delete('q');
      if (viewMode === 'documents' && canSeeRegistry) next.set('view', 'documents');
      else next.delete('view');
      const rt = registrySearch.trim();
      if (rt) next.set('rq', rt);
      else next.delete('rq');
      url.search = next.toString();
      navigator.clipboard.writeText(url.toString());
      setCopySnackbar(true);
    } catch {
      setCopySnackbar(true);
    }
  }, [search, viewMode, registrySearch, canSeeRegistry]);

  if (!canUse) {
    return (
      <Box sx={{ p: 2 }}>
        <Header
          title="Project Documents"
          subtitle="Upload and manage attachments for any project from one place"
        />
        <Alert severity="warning" sx={{ mt: 2 }}>
          You need <strong>document.read_all</strong> or <strong>document.create</strong> to use this
          screen.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Header
        title="Project Documents"
        subtitle="Search across projects or the full document index; share links with your team"
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, mb: 1 }} flexWrap="wrap">
        <Chip
          size="small"
          variant="outlined"
          label={`${summary.total} projects`}
          icon={<FolderOpenIcon sx={{ '&&': { fontSize: 18 } }} />}
        />
        {canSeeRegistry && (
          <>
            <Chip size="small" variant="outlined" color="success" label={`${summary.withDocs} with files`} />
            <Chip size="small" variant="outlined" label={`${summary.without} no files yet`} />
            <Chip
              size="small"
              variant="outlined"
              color="primary"
              label={`${summary.filesIndexed} indexed files`}
              icon={<ArticleIcon sx={{ '&&': { fontSize: 18 } }} />}
            />
          </>
        )}
      </Stack>

      <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
        Use <strong>Projects</strong> to open the document manager per project.{' '}
        {canSeeRegistry ? (
          <>
            <strong>All documents</strong> searches every stored file across projects (fast retrieval by
            name or type). Press <strong>Esc</strong> to close the modal.
          </>
        ) : (
          <>Ask an admin for <strong>document.read_all</strong> to enable the cross-project file index.</>
        )}
      </Alert>

      {canSeeRegistry && (
        <Tabs
          value={viewMode}
          onChange={(_, v) => {
            setViewMode(v);
            setPage(0);
            setRegistryPage(0);
            setViewInUrl(v);
          }}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab label="Projects" value="projects" />
          <Tab label="All documents" value="documents" />
        </Tabs>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && viewMode === 'projects' && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
            <TextField
              fullWidth
              size="small"
              label="Search projects"
              placeholder="Name, ID, status, ministry, ward…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Tooltip title="Copy link including search and tab">
              <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopyShareLink}>
                Copy link
              </Button>
            </Tooltip>
          </Stack>

          {canSeeRegistry && (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ mb: 2 }}
              alignItems={{ sm: 'center' }}
              flexWrap="wrap"
            >
              <ToggleButtonGroup
                size="small"
                exclusive
                value={docFilter}
                onChange={(_, v) => {
                  if (v != null) {
                    setDocFilter(v);
                    setPage(0);
                  }
                }}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="with">With documents</ToggleButton>
                <ToggleButton value="without">No documents</ToggleButton>
              </ToggleButtonGroup>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="sort-projects-label">Sort</InputLabel>
                <Select
                  labelId="sort-projects-label"
                  label="Sort"
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="name">Name (A–Z)</MenuItem>
                  <MenuItem value="documents">Most documents first</MenuItem>
                  <MenuItem value="status">Status (A–Z)</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          )}

          <Paper variant="outlined" sx={{ overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell width={140}>Status</TableCell>
                  {canSeeRegistry && <TableCell width={100} align="right">Files</TableCell>}
                  <TableCell width={100}>ID</TableCell>
                  <TableCell width={220} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canSeeRegistry ? 5 : 4}>
                      <Typography variant="body2" color="text.secondary">
                        No projects match your filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((p) => {
                    const pid = p._pid;
                    const modalActive =
                      documentsModalOpen && String(documentsModalProjectId) === String(pid);
                    const cnt = canSeeRegistry ? docCountByProject.get(String(pid)) || 0 : null;
                    return (
                      <TableRow key={String(pid)} hover sx={{ cursor: 'default' }}>
                        <TableCell>{getProjectDisplayName(p)}</TableCell>
                        <TableCell sx={{ py: 1 }}>
                          <ProjectRegistryStatusChip status={rawProjectStatus(p)} isLight={isLight} />
                        </TableCell>
                        {canSeeRegistry && (
                          <TableCell align="right">
                            <Chip size="small" label={cnt} variant={cnt > 0 ? 'filled' : 'outlined'} color="primary" />
                          </TableCell>
                        )}
                        <TableCell>{pid}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant={modalActive ? 'contained' : 'outlined'}
                              onClick={() => openDocumentsModal(pid)}
                            >
                              Documents
                            </Button>
                            <MuiLink
                              component={Link}
                              to={ROUTES.PROJECT_DETAILS.replace(':projectId', String(pid))}
                              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                            >
                              Details <OpenInNewIcon sx={{ fontSize: 16 }} />
                            </MuiLink>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filtered.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Paper>
        </>
      )}

      {!loading && !error && viewMode === 'documents' && canSeeRegistry && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
            <TextField
              fullWidth
              size="small"
              label="Search all documents"
              placeholder="Project name, file name, type, path…"
              value={registrySearch}
              onChange={(e) => {
                setRegistrySearch(e.target.value);
                setRegistryPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Tooltip title="Copy link including registry search">
              <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopyShareLink}>
                Copy link
              </Button>
            </Tooltip>
          </Stack>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={registryFlagFilter}
            onChange={(_, v) => {
              if (v != null) {
                setRegistryFlagFilter(v);
                setRegistryPage(0);
              }
            }}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="all">All files</ToggleButton>
            <ToggleButton value="flagged">Flagged only</ToggleButton>
          </ToggleButtonGroup>

          {registryLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          )}
          {registryError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {registryError}
            </Alert>
          )}
          {!registryLoading && !registryError && (
            <Paper variant="outlined" sx={{ overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Project</TableCell>
                    <TableCell width={140}>Type</TableCell>
                    <TableCell width={90}>Flag</TableCell>
                    <TableCell>File</TableCell>
                    <TableCell width={180}>Uploaded</TableCell>
                    <TableCell width={160} align="right">
                      Open
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {registryPaginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary">
                          No documents match your search.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    registryPaginated.map((r) => {
                      const pid = registryRowProjectId(r);
                      const pname =
                        r.projectDisplayName || r.projectdisplayname || (pid != null ? `Project ${pid}` : '—');
                      const fileLabel =
                        r.originalFileName || r.description || r.documentPath || r.fileName || '—';
                      const rid = r.id ?? r.documentId ?? `${pid}-${fileLabel}`;
                      const regFlagged = isRegistryRowFlagged(r);
                      return (
                        <TableRow key={String(rid)} hover>
                          <TableCell>{pname}</TableCell>
                          <TableCell>{r.documentType || r.documentCategory || '—'}</TableCell>
                          <TableCell>
                            {regFlagged ? (
                              <Chip size="small" label="Flagged" color="warning" variant="filled" />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap title={String(fileLabel)} sx={{ maxWidth: 360 }}>
                              {fileLabel}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatShortDate(r.createdAt || r.created_at)}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                              <Button size="small" variant="outlined" onClick={() => pid != null && openDocumentsModal(pid)}>
                                Manage
                              </Button>
                              <MuiLink
                                component={Link}
                                to={ROUTES.PROJECT_DETAILS.replace(':projectId', String(pid))}
                                sx={{ fontSize: '0.875rem' }}
                              >
                                Project
                              </MuiLink>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={registryFiltered.length}
                page={registryPage}
                onPageChange={(_, newPage) => setRegistryPage(newPage)}
                rowsPerPage={registryRowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRegistryRowsPerPage(parseInt(e.target.value, 10));
                  setRegistryPage(0);
                }}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </Paper>
          )}
        </>
      )}

      <Dialog
        open={documentsModalOpen}
        onClose={closeDocumentsModal}
        maxWidth="lg"
        fullWidth
        scroll="paper"
        aria-labelledby="project-documents-dialog-title"
      >
        <DialogTitle
          id="project-documents-dialog-title"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            pr: 1,
          }}
        >
          <Typography component="span" variant="h6" sx={{ fontWeight: 600 }}>
            {getProjectDisplayName(modalProjectMeta) || `Project ${documentsModalProjectId ?? ''}`}
          </Typography>
          <IconButton edge="end" aria-label="close" onClick={closeDocumentsModal} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            pt: 1,
            maxHeight: { xs: '80vh', sm: '82vh' },
            overflow: 'auto',
          }}
        >
          {documentsModalProjectId != null && (
            <ProjectDocumentsAttachments
              key={String(documentsModalProjectId)}
              projectId={documentsModalProjectId}
            />
          )}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={copySnackbar}
        autoHideDuration={2500}
        onClose={() => setCopySnackbar(false)}
        message="Link copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
