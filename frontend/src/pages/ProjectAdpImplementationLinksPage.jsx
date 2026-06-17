import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'KES 0';
  return `KES ${num.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

function getAdpProjectLabel(row) {
  if (!row) return '';
  return [
    row.financialYear,
    row.projectName,
    row.locationText || row.sectorName,
  ].filter(Boolean).join(' - ');
}

function confidenceLabel(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${Math.round(num * 100)}% confidence` : 'Confidence pending';
}

export default function ProjectAdpImplementationLinksPage({ projectId, projectName = '', embedded = false, onChanged }) {
  const { hasPrivilege, loading: authLoading } = useAuth();
  const canView = hasPrivilege && (hasPrivilege('project.read_all') || hasPrivilege('strategic_plan.read_all'));
  const canEdit = hasPrivilege && (hasPrivilege('project.update') || hasPrivilege('strategic_plan.update') || hasPrivilege('strategic_plan.create'));

  const [catalog, setCatalog] = useState([]);
  const [currentLink, setCurrentLink] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedAdpProject, setSelectedAdpProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const hydrateSelection = useCallback((catalogRows, link) => {
    const adpProjectId = link?.adpProjectId;
    const selected = catalogRows.find((row) => Number(row.id) === Number(adpProjectId)) || null;
    setSelectedAdpProject(selected);
  }, []);

  const loadData = useCallback(async () => {
    if (!projectId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [catalogData, linkData] = await Promise.all([
        apiService.adp.getCatalog(),
        apiService.adp.getProjectLink(projectId),
      ]);
      const nextCatalog = Array.isArray(catalogData?.projects) ? catalogData.projects : [];
      setCatalog(nextCatalog);
      setCurrentLink(linkData?.currentLink || null);
      setSuggestions(Array.isArray(linkData?.suggestions) ? linkData.suggestions : []);
      hydrateSelection(nextCatalog, linkData?.currentLink);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load ADP linkage.');
    } finally {
      setLoading(false);
    }
  }, [canView, hydrateSelection, projectId]);

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading, loadData]);

  const saveLink = async ({ adpProject, suggestionId } = {}) => {
    const projectToSave = adpProject || selectedAdpProject;
    if (!canEdit || !projectId || !projectToSave?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiService.adp.updateProjectLink(projectId, {
        adpProjectId: projectToSave.id,
        suggestionId: suggestionId || null,
      });
      setCurrentLink(data?.currentLink || null);
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      hydrateSelection(catalog, data?.currentLink);
      setMessage('Project linked to ADP implementation priority.');
      if (typeof onChanged === 'function') onChanged(data?.currentLink || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save ADP link.');
    } finally {
      setSaving(false);
    }
  };

  const rejectSuggestion = async (suggestionId) => {
    if (!canEdit || !suggestionId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiService.adp.updateSuggestionStatus(suggestionId, 'rejected');
      setCurrentLink(data?.currentLink || null);
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      setMessage('ADP suggestion rejected.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update ADP suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const pendingSuggestions = useMemo(
    () => suggestions.filter((row) => row.status === 'review_pending'),
    [suggestions]
  );

  if (!canView && !authLoading) {
    return <Alert severity="warning">You do not have permission to view ADP implementation links.</Alert>;
  }

  return (
    <Box sx={{ p: embedded ? 0 : 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            ADP Implementation Link
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Connect {projectName || 'this project'} to the annual ADP priority it implements.
          </Typography>
        </Box>

        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={20} />
            <Typography>Loading ADP linkage...</Typography>
          </Stack>
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}

            {currentLink?.adpProjectId ? (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Current ADP Link</Typography>
                <Typography variant="body2">{currentLink.adpProjectName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[currentLink.financialYear, currentLink.sectorName, currentLink.programmeName, currentLink.locationText].filter(Boolean).join(' | ')}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  <Chip size="small" label={currentLink.planStatus || 'ADP status pending'} />
                  <Chip size="small" label={formatCurrency(currentLink.estimatedCost)} />
                  {currentLink.performanceIndicator && <Chip size="small" label={currentLink.performanceIndicator} />}
                </Stack>
              </Paper>
            ) : (
              <Alert severity="info">This project is not linked to an ADP priority yet.</Alert>
            )}

            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} md={9}>
                <Autocomplete
                  options={catalog}
                  value={selectedAdpProject}
                  onChange={(_event, value) => setSelectedAdpProject(value)}
                  getOptionLabel={getAdpProjectLabel}
                  isOptionEqualToValue={(option, value) => Number(option.id) === Number(value.id)}
                  renderInput={(params) => <TextField {...params} label="ADP planned project" size="small" />}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button fullWidth variant="contained" disabled={!canEdit || saving || !selectedAdpProject?.id} onClick={() => saveLink()}>
                  {saving ? 'Saving...' : 'Save ADP Link'}
                </Button>
              </Grid>
            </Grid>

            <Paper variant="outlined">
              <Box sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Suggested ADP Matches
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Suggestions are generated from project names, sector text, locations, indicators, and ADP project keywords.
                </Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ADP Project</TableCell>
                      <TableCell>Reason</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingSuggestions.map((suggestion) => (
                      <TableRow key={suggestion.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{suggestion.adpProjectName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[suggestion.financialYear, suggestion.sectorName, suggestion.locationText].filter(Boolean).join(' | ')}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{suggestion.matchReason}</Typography>
                          <Chip size="small" label={confidenceLabel(suggestion.confidence)} color="warning" sx={{ mt: 0.5 }} />
                        </TableCell>
                        <TableCell><Chip size="small" label={suggestion.status} /></TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" startIcon={<CheckCircleIcon />} disabled={!canEdit || saving} onClick={() => saveLink({ adpProject: { id: suggestion.adpProjectId }, suggestionId: suggestion.id })}>
                              Accept
                            </Button>
                            <Button size="small" color="inherit" startIcon={<ThumbDownIcon />} disabled={!canEdit || saving} onClick={() => rejectSuggestion(suggestion.id)}>
                              Reject
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingSuggestions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Alert severity="info">No pending ADP suggestions for this project yet.</Alert>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  );
}
