import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  Link as MuiLink,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FeedbackIcon from '@mui/icons-material/Feedback';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link } from 'react-router-dom';
import Header from './dashboard/Header';
import axiosInstance from '../api/axiosInstance';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/privilegeUtils.js';

const FETCH_LIMIT = 2000;

function statusLabel(status) {
  const m = {
    pending: 'Awaiting response',
    reviewed: 'Under review',
    responded: 'Responded',
    archived: 'Archived',
  };
  return m[status] || status || '—';
}

function moderationLabel(ms) {
  const m = {
    pending: 'Review pending',
    approved: 'Approved',
    rejected: 'Rejected',
    flagged: 'Flagged',
  };
  return m[ms] || ms || '—';
}

export default function ProjectFeedbackByProjectPage() {
  const { user, hasPrivilege, loading: authLoading } = useAuth();
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const canAccess =
    isAdmin(user) ||
    hasPrivilege('feedback.respond') ||
    hasPrivilege('public_content.approve');

  const load = useCallback(async () => {
    if (!canAccess) {
      setLoading(false);
      setFeedbacks([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: '1',
        limit: String(FETCH_LIMIT),
      });
      const res = await axiosInstance.get(`/public/feedback/admin?${params.toString()}`);
      setFeedbacks(res.data.feedbacks || []);
    } catch (e) {
      console.error(e);
      const detail =
        e.response?.data?.error || e.response?.data?.message || e.response?.data?.details;
      setError(detail || 'Failed to load public feedback.');
      setFeedbacks([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    load();
  }, [load]);

  const searchTrim = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!searchTrim) return feedbacks;
    return feedbacks.filter((f) => {
      const blob = [
        f.name,
        f.subject,
        f.message,
        f.project_name,
        f.projectName,
        f.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(searchTrim);
    });
  }, [feedbacks, searchTrim]);

  const groups = useMemo(() => {
    const map = new Map();
    const unlinked = [];
    for (const f of filtered) {
      const pid = f.project_id ?? f.projectId;
      const pname = f.project_name || f.projectName || (pid ? `Project ${pid}` : null);
      if (pid == null || pid === '') {
        unlinked.push(f);
        continue;
      }
      const key = String(pid);
      if (!map.has(key)) {
        map.set(key, { projectId: pid, projectName: pname || `Project ${pid}`, items: [] });
      }
      map.get(key).items.push(f);
    }
    const arr = Array.from(map.values()).sort((a, b) =>
      a.projectName.localeCompare(b.projectName, undefined, { sensitivity: 'base' })
    );
    if (unlinked.length) {
      arr.push({
        projectId: null,
        projectName: 'Not linked to a project',
        items: unlinked,
      });
    }
    return arr;
  }, [filtered]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (authLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!canAccess) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          You do not have permission to view project-scoped public feedback. This view requires
          feedback or public content review access.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
      <Header
        title="PROJECT FEEDBACK"
        subtitle="Public feedback received, grouped by related project"
      />

      <Paper sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FeedbackIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {groups.length} group{groups.length === 1 ? '' : 's'} · {filtered.length} item
            {filtered.length === 1 ? '' : 's'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Includes all moderation states. Open a project to see full registry details.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Search name, subject, message, project…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 260 }}
        />
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {groups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {feedbacks.length === 0
              ? 'No public feedback records found.'
              : 'No feedback matches your search.'}
          </Typography>
        </Paper>
      ) : (
        groups.map((g) => (
          <Accordion key={g.projectId ?? 'none'} defaultExpanded={groups.length <= 4} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  pr: 1,
                  gap: 1,
                }}
              >
                <Typography fontWeight={600}>{g.projectName}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip size="small" label={`${g.items.length} feedback`} />
                  {g.projectId != null && (
                    <MuiLink
                      component={Link}
                      to={`${ROUTES.PROJECTS}/${g.projectId}`}
                      underline="hover"
                      onClick={(e) => e.stopPropagation()}
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13 }}
                    >
                      Open project <OpenInNewIcon sx={{ fontSize: 16 }} />
                    </MuiLink>
                  )}
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Divider sx={{ mb: 2 }} />
              {g.items.map((f) => (
                <Box
                  key={f.id}
                  sx={{
                    mb: 2,
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 'none', pb: 0, mb: 0 },
                  }}
                >
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                    <Chip size="small" variant="outlined" label={statusLabel(f.status)} />
                    <Chip size="small" variant="outlined" label={moderationLabel(f.moderation_status)} />
                    <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                      #{f.id} · {formatDate(f.created_at)}
                    </Typography>
                  </Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {f.subject || '(No subject)'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    From: {f.name || 'Anonymous'}
                    {f.email ? ` · ${f.email}` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                    {f.message}
                  </Typography>
                  {f.admin_response ? (
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        borderLeft: 3,
                        borderColor: 'success.main',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Official response
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                        {f.admin_response}
                      </Typography>
                      {f.responded_at && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {formatDate(f.responded_at)}
                        </Typography>
                      )}
                    </Box>
                  ) : null}
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Box>
  );
}
