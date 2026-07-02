import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import { useAuth } from '../../context/AuthContext.jsx';
import ProjectScopeSetupDialog from '../../components/budget/ProjectScopeSetupDialog';
import {
  ComplianceBar,
  ENGINEER_WORKSPACE_ROUTES,
  projectTabLink,
  scopeChip,
} from './engineerWorkspaceShared';
import { useEngineerWorkspaceData } from './useEngineerWorkspaceData';

export default function EngineerWorkspaceProjectsPage() {
  const { hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const { loading, error, load, search, setSearch, projects } = useEngineerWorkspaceData();
  const [scopeItem, setScopeItem] = useState(null);
  const canSetupScope = hasPrivilege('project.update');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(ENGINEER_WORKSPACE_ROUTES.overview)}
          size="small"
        >
          Workspace
        </Button>
        <Tooltip title="Refresh">
          <IconButton onClick={() => load()} disabled={loading} aria-label="Refresh projects">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Project registry</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Scoped projects with file compliance, BQ, and scope setup shortcuts.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <TextField
        size="small"
        placeholder="Search projects..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
        sx={{ mb: 2, maxWidth: 420 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              <Button size="small" onClick={() => load()}>Search</Button>
            </InputAdornment>
          ),
        }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>File compliance</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No projects in your scope. Adjust search or confirm project access with your administrator.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : projects.map((row) => {
                const scope = scopeChip(row.scopeStatus);
                const pct = row.fileCompliance?.completionPct ?? 0;
                return (
                  <TableRow key={row.projectId} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{row.projectName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.departmentName || row.directorate || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.status || '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={scope.label} color={scope.color} />
                      <Typography variant="caption" display="block" color="text.secondary">
                        {row.milestoneCount || 0} milestones · {row.bqItemCount || 0} BQ lines
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <ComplianceBar
                        pct={pct}
                        satisfied={row.fileCompliance?.satisfiedRequired}
                        required={row.fileCompliance?.requiredItems}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                        <Button size="small" onClick={() => navigate(projectTabLink(row.projectId, 'overview'))} sx={{ textTransform: 'none' }}>
                          Open
                        </Button>
                        <Button size="small" onClick={() => navigate(projectTabLink(row.projectId, 'bq'))} startIcon={<RequestQuoteIcon />} sx={{ textTransform: 'none' }}>
                          BQ
                        </Button>
                        <Button size="small" onClick={() => navigate(projectTabLink(row.projectId, 'file-checklist'))} startIcon={<UploadFileIcon />} sx={{ textTransform: 'none' }}>
                          Files
                        </Button>
                        <Button size="small" onClick={() => navigate(`${ENGINEER_WORKSPACE_ROUTES.progressPhotos}?projectId=${row.projectId}`)} startIcon={<PhotoCameraIcon />} sx={{ textTransform: 'none' }}>
                          Photos
                        </Button>
                        {canSetupScope ? (
                          <Button
                            size="small"
                            startIcon={<ArchitectureIcon />}
                            onClick={() => setScopeItem({ registryProjectId: row.projectId, projectName: row.projectName })}
                            sx={{ textTransform: 'none' }}
                          >
                            Scope
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ProjectScopeSetupDialog
        open={Boolean(scopeItem)}
        onClose={() => setScopeItem(null)}
        item={scopeItem}
        onSuccess={() => {
          setScopeItem(null);
          load();
        }}
      />
    </Box>
  );
}
