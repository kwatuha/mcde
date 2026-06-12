import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
  useTheme,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Flag as FlagIcon,
  Link as LinkIcon,
  ThumbDown as ThumbDownIcon,
} from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from './dashboard/Header';
import { tokens } from './dashboard/theme';

function getProgramLabel(programme) {
  if (!programme) return '';
  const code = programme.programCode || programme.program_code;
  const name = programme.programme || programme.programName || programme.name;
  return [code, name].filter(Boolean).join(' - ');
}

function getSubprogramLabel(subprogramme) {
  if (!subprogramme) return '';
  const code = subprogramme.subProgramCode || subprogramme.sub_program_code;
  const name = subprogramme.subProgramme || subprogramme.subProgramName || subprogramme.name;
  return [code, name].filter(Boolean).join(' - ');
}

function suggestionStatusColor(status) {
  if (status === 'accepted') return 'success';
  if (status === 'rejected') return 'default';
  return 'warning';
}

function confidenceLabel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'Confidence pending';
  return `${Math.round(num * 100)}% confidence`;
}

const CIDP_TARGET_YEARS = [1, 2, 3, 4, 5];
const cidpAutocompletePaperSx = {
  minWidth: 720,
  maxWidth: 'min(960px, calc(100vw - 48px))',
};

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `KES ${num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getYearTargetBudgetRows(record) {
  return CIDP_TARGET_YEARS.map((year) => ({
    year,
    target: record?.[`yr${year}Targets`] || '',
    budget: record?.[`yr${year}Budget`] ?? null,
  })).filter((row) => row.target || row.budget != null);
}

function sourcePreview(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > 260 ? `${value.slice(0, 260)}...` : value;
}

function TargetBudgetTable({ record }) {
  const rows = getYearTargetBudgetRows(record);

  if (!rows.length) {
    return (
      <Alert severity="info" variant="outlined">
        No structured yearly targets or budgets are available for this CIDP subprogramme yet.
      </Alert>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Year</TableCell>
            <TableCell>Target</TableCell>
            <TableCell align="right">Indicative Budget</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.year}>
              <TableCell sx={{ fontWeight: 700 }}>Year {row.year}</TableCell>
              <TableCell>{row.target || '—'}</TableCell>
              <TableCell align="right">{formatCurrency(row.budget)}</TableCell>
            </TableRow>
          ))}
          {record?.totalBudget != null && (
            <TableRow>
              <TableCell colSpan={2} sx={{ fontWeight: 800 }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>
                {formatCurrency(record.totalBudget)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ProjectCidpImplementationLinksPage({ projectId, projectName = '', embedded = false, onChanged }) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { hasPrivilege, loading: authLoading } = useAuth();

  const canView = hasPrivilege && (hasPrivilege('project.read_all') || hasPrivilege('strategic_plan.read_all'));
  const canEdit =
    hasPrivilege &&
    (hasPrivilege('project.update') || hasPrivilege('strategic_plan.update') || hasPrivilege('strategic_plan.create'));

  const [catalog, setCatalog] = useState({ programmes: [], subprogrammes: [] });
  const [currentLink, setCurrentLink] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedSubprogram, setSelectedSubprogram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const subprogramOptions = useMemo(() => {
    const programId = selectedProgram?.programId;
    if (!programId) return [];
    return catalog.subprogrammes.filter((row) => Number(row.programId) === Number(programId));
  }, [catalog.subprogrammes, selectedProgram]);

  const selectedProgramId = selectedProgram?.programId || null;

  const hydrateSelection = useCallback((catalogData, link) => {
    const programId = link?.programId;
    const subProgramId = link?.subProgramId;
    const program = catalogData.programmes.find((row) => Number(row.programId) === Number(programId)) || null;
    const subprogram = catalogData.subprogrammes.find((row) => Number(row.subProgramId) === Number(subProgramId)) || null;
    setSelectedProgram(program);
    setSelectedSubprogram(subprogram);
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
        apiService.projects.getCidpCatalog(),
        apiService.projects.getCidpProjectLink(projectId),
      ]);
      const nextCatalog = {
        programmes: Array.isArray(catalogData?.programmes) ? catalogData.programmes : [],
        subprogrammes: Array.isArray(catalogData?.subprogrammes) ? catalogData.subprogrammes : [],
      };
      setCatalog(nextCatalog);
      setCurrentLink(linkData?.currentLink || null);
      setSuggestions(Array.isArray(linkData?.suggestions) ? linkData.suggestions : []);
      hydrateSelection(nextCatalog, linkData?.currentLink);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load CIDP linkage.');
    } finally {
      setLoading(false);
    }
  }, [projectId, canView, hydrateSelection]);

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading, loadData]);

  useEffect(() => {
    if (!selectedProgramId) {
      setSelectedSubprogram(null);
      return;
    }
    if (selectedSubprogram && Number(selectedSubprogram.programId) !== Number(selectedProgramId)) {
      setSelectedSubprogram(null);
    }
  }, [selectedProgramId, selectedSubprogram]);

  const saveLink = async ({ program, subprogram, suggestionId } = {}) => {
    const programToSave = program || selectedProgram;
    const subprogramToSave = subprogram || selectedSubprogram;
    if (!canEdit || !projectId) return;
    if (!programToSave?.programId) {
      setError('Select a CIDP programme before saving.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiService.projects.updateCidpProjectLink(projectId, {
        programId: programToSave.programId,
        subProgramId: subprogramToSave?.subProgramId || null,
        suggestionId: suggestionId || null,
      });
      setCurrentLink(data?.currentLink || null);
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      hydrateSelection(catalog, data?.currentLink);
      setMessage('Project linked to CIDP implementation target.');
      if (typeof onChanged === 'function') onChanged(data?.currentLink || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save CIDP link.');
    } finally {
      setSaving(false);
    }
  };

  const rejectSuggestion = async (suggestionId) => {
    if (!canEdit || !projectId || !suggestionId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiService.projects.updateCidpSuggestionStatus(projectId, suggestionId, 'rejected');
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      setMessage('CIDP suggestion rejected.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update CIDP suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const acceptSuggestion = async (suggestion) => {
    const program = catalog.programmes.find((row) => Number(row.programId) === Number(suggestion.programId));
    const subprogram = catalog.subprogrammes.find((row) => Number(row.subProgramId) === Number(suggestion.subProgramId));
    if (!program) {
      setError('This suggestion refers to a CIDP programme that is no longer available.');
      return;
    }
    await saveLink({ program, subprogram, suggestionId: suggestion.id });
  };

  const pendingSuggestions = suggestions.filter((row) => row.status !== 'rejected');
  const selectedTarget =
    selectedSubprogram ||
    (selectedProgram?.programId && Number(selectedProgram.programId) === Number(currentLink?.programId) ? currentLink : null);

  if (!canView && !authLoading) {
    return (
      <Alert severity="warning">
        You need project or strategic planning read privileges to view CIDP implementation links.
      </Alert>
    );
  }

  return (
    <Box>
      {!embedded && (
        <Header title="CIDP Project Linkage" subtitle="Link projects to CIDP programmes and subprogrammes" />
      )}

      {loading ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {message && <Alert severity="success" onClose={() => setMessage('')}>{message}</Alert>}

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', gap: 1, alignItems: 'center' }}>
                  <FlagIcon color="primary" />
                  CIDP Implementation Link
                </Typography>
                {projectName && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Project: ${projectName}`}
                    sx={{ mt: 1, maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                  />
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Link this project to the CIDP programme/subprogramme it implements, then use project progress,
                  monitoring, evaluation, and BQ delivery as evidence of CIDP implementation.
                </Typography>
              </Box>
              <Chip
                color={currentLink?.programId ? 'success' : 'warning'}
                label={currentLink?.programId ? 'Linked to CIDP' : 'CIDP link pending'}
                sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, fontWeight: 700 }}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">Current programme</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                      {currentLink?.programme || 'Not linked'}
                    </Typography>
                    {currentLink?.programCode && (
                      <Chip size="small" label={currentLink.programCode} sx={{ mt: 1 }} />
                    )}
                    {currentLink?.sectorName && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Sector: {currentLink.sectorName}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">Current subprogramme</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                      {currentLink?.subProgramme || 'Not linked'}
                    </Typography>
                    {currentLink?.subProgramCode && (
                      <Chip size="small" label={currentLink.subProgramCode} sx={{ mt: 1 }} />
                    )}
                    {currentLink?.totalBudget != null && (
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={`CIDP budget ${formatCurrency(currentLink.totalBudget)}`}
                        sx={{ mt: 1, ml: currentLink?.subProgramCode ? 1 : 0 }}
                      />
                    )}
                    {(currentLink?.kpi || currentLink?.baseline) && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {currentLink.kpi ? `KPI: ${currentLink.kpi}` : ''}
                        {currentLink.kpi && currentLink.baseline ? ' | ' : ''}
                        {currentLink.baseline ? `Baseline: ${currentLink.baseline}` : ''}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {currentLink?.subProgramId && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                  Linked CIDP Yearly Targets and Budgets
                </Typography>
                <TargetBudgetTable record={currentLink} />
                {(currentLink.sourceCidpPage || currentLink.sourcePdfPage) && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    {currentLink.sourceCidpPage && <Chip size="small" variant="outlined" label={`CIDP p. ${currentLink.sourceCidpPage}`} />}
                    {currentLink.sourcePdfPage && <Chip size="small" variant="outlined" label={`PDF p. ${currentLink.sourcePdfPage}`} />}
                  </Stack>
                )}
              </Box>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Review Suggested CIDP Links
            </Typography>
            {pendingSuggestions.length === 0 ? (
              <Alert severity="info" variant="outlined">
                No pending CIDP suggestions were generated for this project. Use manual selection below.
              </Alert>
            ) : (
              <Grid container spacing={1.5}>
                {pendingSuggestions.slice(0, 6).map((suggestion) => (
                  <Grid item xs={12} md={6} key={suggestion.id}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                              {suggestion.programCode} {suggestion.programme}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {suggestion.subProgramCode
                                ? `${suggestion.subProgramCode} ${suggestion.subProgramme || ''}`
                                : 'Programme-level suggestion'}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            color={suggestionStatusColor(suggestion.status)}
                            label={suggestion.status || 'review_pending'}
                          />
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                          <Chip size="small" label={confidenceLabel(suggestion.confidence)} />
                          {suggestion.totalBudget != null && (
                            <Chip size="small" color="primary" variant="outlined" label={formatCurrency(suggestion.totalBudget)} />
                          )}
                          {suggestion.sourceCidpPage && (
                            <Chip size="small" variant="outlined" label={`CIDP p. ${suggestion.sourceCidpPage}`} />
                          )}
                        </Stack>
                        {suggestion.matchReason && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            {suggestion.matchReason}
                          </Typography>
                        )}
                        {suggestion.sourceText && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Source: {sourcePreview(suggestion.sourceText)}
                          </Typography>
                        )}
                        {canEdit && suggestion.status !== 'accepted' && (
                          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<CheckCircleIcon />}
                              disabled={saving}
                              onClick={() => acceptSuggestion(suggestion)}
                            >
                              Accept
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="inherit"
                              startIcon={<ThumbDownIcon />}
                              disabled={saving}
                              onClick={() => rejectSuggestion(suggestion.id)}
                            >
                              Reject
                            </Button>
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Manual CIDP Assignment
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={catalog.programmes}
                  value={selectedProgram}
                  slotProps={{ paper: { sx: cidpAutocompletePaperSx } }}
                  onChange={(event, value) => {
                    setSelectedProgram(value);
                    setSelectedSubprogram(null);
                  }}
                  getOptionLabel={getProgramLabel}
                  isOptionEqualToValue={(option, value) => Number(option.programId) === Number(value.programId)}
                  sx={{ minWidth: { xs: '100%', md: 420 } }}
                  renderInput={(params) => (
                    <TextField {...params} label="CIDP Programme" placeholder="Search programme code or name" />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={subprogramOptions}
                  value={selectedSubprogram}
                  slotProps={{ paper: { sx: cidpAutocompletePaperSx } }}
                  onChange={(event, value) => setSelectedSubprogram(value)}
                  getOptionLabel={getSubprogramLabel}
                  isOptionEqualToValue={(option, value) => Number(option.subProgramId) === Number(value.subProgramId)}
                  disabled={!selectedProgram}
                  sx={{ minWidth: { xs: '100%', md: 420 } }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="CIDP Subprogramme"
                      placeholder={selectedProgram ? 'Search subprogramme' : 'Select programme first'}
                    />
                  )}
                />
              </Grid>
            </Grid>
            {selectedTarget?.subProgramId && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                  Selected CIDP Target Snapshot
                </Typography>
                <TargetBudgetTable record={selectedTarget} />
              </Box>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
                disabled={!canEdit || saving || !selectedProgram}
                onClick={() => saveLink()}
              >
                Save CIDP Link
              </Button>
              {!canEdit && (
                <Typography variant="caption" color="text.secondary">
                  Requires project update or strategic planning update privilege.
                </Typography>
              )}
            </Stack>
          </Paper>

          <Alert severity="info" variant="outlined" sx={{ borderColor: colors.blueAccent[400] }}>
            Once linked, this project can be reported as implementation evidence for the selected CIDP programme.
            Progress still comes from the project schedule, BQ, monitoring, inspection, and evaluation records.
          </Alert>
        </Stack>
      )}
    </Box>
  );
}

export default ProjectCidpImplementationLinksPage;
