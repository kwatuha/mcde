import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  Stack,
  Button,
  TextField,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Divider,
  Autocomplete,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import Header from './dashboard/Header';
import apiService from '../api';
import projectService from '../api/projectService';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const INITIAL_FORM = {
  teamName: '',
  name: '',
  role: '',
  email: '',
  phone: '',
  dateAppointed: '',
  dateEnded: '',
  notes: '',
};

export default function ProjectTeamsPage() {
  const { hasPrivilege } = useAuth();
  const canRead = hasPrivilege('project.read_all');
  const canWrite = hasPrivilege('project.update') || hasPrivilege('project.create');

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const fileInputRef = useRef(null);
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [loadingStaffDirectory, setLoadingStaffDirectory] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const selectedProject = useMemo(
    () => projects.find((p) => String(p.projectId || p.id) === String(selectedProjectId)),
    [projects, selectedProjectId]
  );
  const normalizeEmail = useCallback((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), []);

  const enrichTeamWithStaffSource = useCallback(
    (team) => {
      const email = normalizeEmail(team?.email);
      if (!email) return team;
      const match = staffDirectory.find((s) => s.email === email);
      if (!match) return team;
      return {
        ...team,
        isStaffMember: true,
        staffSource: match.source,
        staffDirectoryId: match.id,
      };
    },
    [staffDirectory, normalizeEmail]
  );
  const loadProjects = useCallback(async () => {
    if (!canRead) return;
    setLoadingProjects(true);
    setError('');
    try {
      const rows = await projectService.projects.getProjects({ limit: 5000 });
      const list = Array.isArray(rows?.projects) ? rows.projects : Array.isArray(rows) ? rows : [];
      setProjects(list);
      if (!selectedProjectId && list.length > 0) {
        setSelectedProjectId(String(list[0].projectId || list[0].id));
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load projects.');
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [canRead, selectedProjectId]);

  const loadStaffDirectory = useCallback(async () => {
    setLoadingStaffDirectory(true);
    try {
      const [usersRows, employeesRows] = await Promise.all([
        apiService.users?.getUsers ? apiService.users.getUsers() : Promise.resolve([]),
        apiService.hr?.getEmployees ? apiService.hr.getEmployees() : Promise.resolve([]),
      ]);
      const users = Array.isArray(usersRows?.users) ? usersRows.users : Array.isArray(usersRows) ? usersRows : [];
      const employees = Array.isArray(employeesRows?.employees) ? employeesRows.employees : Array.isArray(employeesRows) ? employeesRows : [];
      const employeeByEmail = new Map();
      for (const e of employees) {
        const email = normalizeEmail(e.email || e.workEmail || e.personalEmail);
        if (email) employeeByEmail.set(email, e);
      }

      const directory = [];
      for (const u of users) {
        const email = normalizeEmail(u.email);
        if (!email) continue;
        const employee = employeeByEmail.get(email) || null;
        const fullName =
          u.fullName ||
          [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
          employee?.fullName ||
          [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim() ||
          u.username ||
          email;
        directory.push({
          id: `user-${u.userId || u.id || email}`,
          email,
          fullName,
          role: employee?.jobTitle || employee?.position || employee?.designation || u.roleName || u.role || '',
          source: employee ? 'staff' : 'user',
          employee,
        });
      }

      for (const e of employees) {
        const email = normalizeEmail(e.email || e.workEmail || e.personalEmail);
        if (!email || directory.some((d) => d.email === email)) continue;
        directory.push({
          id: `emp-${e.employeeId || e.id || email}`,
          email,
          fullName: e.fullName || [e.firstName, e.lastName].filter(Boolean).join(' ').trim() || email,
          role: e.jobTitle || e.position || e.designation || '',
          source: 'employee',
          employee: e,
        });
      }

      directory.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setStaffDirectory(directory);
    } catch {
      setStaffDirectory([]);
    } finally {
      setLoadingStaffDirectory(false);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    if (!selectedProjectId) {
      setTeams([]);
      return;
    }
    setLoadingTeams(true);
    setError('');
    try {
      if (apiService.projects?.getTeams) {
        const rows = await apiService.projects.getTeams(selectedProjectId);
        const baseRows = Array.isArray(rows) ? rows : [];
        setTeams(baseRows.map(enrichTeamWithStaffSource));
      } else {
        const stored = localStorage.getItem(`project-teams-${selectedProjectId}`);
        const baseRows = stored ? JSON.parse(stored) : [];
        setTeams(baseRows.map(enrichTeamWithStaffSource));
      }
    } catch (e) {
      const stored = localStorage.getItem(`project-teams-${selectedProjectId}`);
      const baseRows = stored ? JSON.parse(stored) : [];
      setTeams(baseRows.map(enrichTeamWithStaffSource));
      setError(e?.response?.data?.message || e?.message || 'Failed to load team members.');
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedProjectId, enrichTeamWithStaffSource]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadStaffDirectory();
  }, [loadStaffDirectory]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const resetDialog = () => {
    setEditingTeam(null);
    setForm(INITIAL_FORM);
    setSelectedStaff(null);
    setOpenDialog(false);
  };

  const openCreate = () => {
    setEditingTeam(null);
    setForm(INITIAL_FORM);
    setSelectedStaff(null);
    setOpenDialog(true);
  };

  const openEdit = (row) => {
    setEditingTeam(row);
    setForm({
      teamName: row.teamName || '',
      name: row.name || '',
      role: row.role || '',
      email: row.email || '',
      phone: row.phone || '',
      dateAppointed: row.dateAppointed ? new Date(row.dateAppointed).toISOString().slice(0, 10) : '',
      dateEnded: row.dateEnded ? new Date(row.dateEnded).toISOString().slice(0, 10) : '',
      notes: row.notes || '',
    });
    const normalizedRowEmail = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    setSelectedStaff(staffDirectory.find((s) => s.email === normalizedRowEmail) || null);
    setOpenDialog(true);
  };

  const handleSave = async () => {
    if (!selectedProjectId) return;
    try {
      let updated = [...teams];
      if (editingTeam) {
        if (apiService.projects?.updateTeamMember) {
          await apiService.projects.updateTeamMember(selectedProjectId, editingTeam.teamMemberId, form);
        }
        updated = updated.map((t) => (t.teamMemberId === editingTeam.teamMemberId ? { ...t, ...form } : t));
      } else {
        const localTeam = {
          teamMemberId: String(Date.now()),
          teamName: form.teamName || form.role || 'General Team',
          ...form,
          projectId: selectedProjectId,
          isStaffMember: Boolean(selectedStaff && (selectedStaff.source === 'staff' || selectedStaff.source === 'employee')),
          staffSource: selectedStaff?.source || null,
          staffDirectoryId: selectedStaff?.id || null,
        };
        if (apiService.projects?.addTeamMember) {
          const saved = await apiService.projects.addTeamMember(selectedProjectId, form);
          updated.push(saved ? { ...saved, ...localTeam } : localTeam);
        } else {
          updated.push(localTeam);
        }
      }
      setTeams(updated);
      localStorage.setItem(`project-teams-${selectedProjectId}`, JSON.stringify(updated));
      resetDialog();
      setSnackbar({ open: true, message: editingTeam ? 'Team member updated.' : 'Team member added.', severity: 'success' });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save team member.');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm('Delete this team member?')) return;
    try {
      if (apiService.projects?.deleteTeamMember) {
        await apiService.projects.deleteTeamMember(selectedProjectId, row.teamMemberId);
      }
      const updated = teams.filter((t) => t.teamMemberId !== row.teamMemberId);
      setTeams(updated);
      localStorage.setItem(`project-teams-${selectedProjectId}`, JSON.stringify(updated));
      setSnackbar({ open: true, message: 'Team member deleted.', severity: 'success' });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete team member.');
    }
  };

  const handleDownloadTemplate = () => {
    if (!selectedProjectId) return;
    const headers = ['Team Name', 'Name', 'Role', 'Email', 'Phone', 'Date Appointed', 'Date Ended', 'Notes'];
    const exampleRows = [
      ['Inspection Team', 'John Doe', 'Project Manager', 'john.doe@example.com', '+254712345678', '2026-01-01', '', 'Team lead'],
      ['PMC', 'Jane Smith', 'Engineer', 'jane.smith@example.com', '+254700000000', '2026-01-15', '', 'Member'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
    worksheet['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Team Template');
    XLSX.writeFile(workbook, `project-teams-template-${selectedProjectId}.xlsx`);
  };

  const handleTeamFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProjectId) return;
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let uploadedTeams = [];
      if (ext === 'xlsx' || ext === 'xls') {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, blankrows: false });
        for (let i = 1; i < jsonData.length; i += 1) {
          const row = Array.isArray(jsonData[i]) ? jsonData[i] : [];
          const team = {
            teamMemberId: `upload-${Date.now()}-${i}`,
            teamName: String(row[0] || '').trim(),
            name: String(row[1] || '').trim(),
            role: String(row[2] || '').trim(),
            email: String(row[3] || '').trim(),
            phone: String(row[4] || '').trim(),
            dateAppointed: String(row[5] || '').trim(),
            dateEnded: String(row[6] || '').trim(),
            notes: String(row[7] || '').trim(),
            projectId: selectedProjectId,
          };
          if (team.teamName || team.name) uploadedTeams.push(team);
        }
      } else if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter((l) => l.trim());
        for (let i = 1; i < lines.length; i += 1) {
          const v = lines[i].split(',').map((x) => x.trim());
          const team = {
            teamMemberId: `upload-${Date.now()}-${i}`,
            teamName: v[0] || '',
            name: v[1] || '',
            role: v[2] || '',
            email: v[3] || '',
            phone: v[4] || '',
            dateAppointed: v[5] || '',
            dateEnded: v[6] || '',
            notes: v[7] || '',
            projectId: selectedProjectId,
          };
          if (team.teamName || team.name) uploadedTeams.push(team);
        }
      } else {
        throw new Error('Unsupported format. Upload .xlsx, .xls, or .csv.');
      }

      if (!uploadedTeams.length) throw new Error('No valid team rows found in file.');
      const existingSet = new Set(teams.map((t) => `${t.teamName || ''}|${t.name || ''}|${t.email || ''}`));
      const newTeams = uploadedTeams.filter((t) => !existingSet.has(`${t.teamName || ''}|${t.name || ''}|${t.email || ''}`));
      const updated = [...teams, ...newTeams];
      setTeams(updated);
      localStorage.setItem(`project-teams-${selectedProjectId}`, JSON.stringify(updated));
      setSnackbar({
        open: true,
        message: `Uploaded ${newTeams.length} team member(s).`,
        severity: 'success',
      });
    } catch (e) {
      setError(e?.message || 'Failed to upload team file.');
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleDownloadTeamsPDF = () => {
    const doc = new jsPDF('portrait', 'pt', 'a4');
    doc.setFontSize(16);
    doc.text('Project Team Members', 40, 40);
    doc.setFontSize(10);
    doc.text(`Project: ${selectedProject?.projectName || selectedProject?.name || 'N/A'}`, 40, 58);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 40, 72);
    const rows = teams.map((m, i) => [
      String(i + 1),
      m.teamName || 'General',
      m.name || 'N/A',
      m.role || 'N/A',
      m.email || 'N/A',
      m.phone || 'N/A',
      m.dateAppointed ? new Date(m.dateAppointed).toLocaleDateString() : 'N/A',
    ]);
    autoTable(doc, {
      head: [['#', 'Team', 'Name', 'Role', 'Email', 'Phone', 'Date Appointed']],
      body: rows,
      startY: 86,
      styles: { fontSize: 8 },
    });
    doc.save(`project-teams-${selectedProjectId}.pdf`);
  };

  const handlePrintTeams = () => {
    const htmlRows = teams
      .map(
        (m, i) => `<tr><td>${i + 1}</td><td>${m.teamName || 'General'}</td><td>${m.name || 'N/A'}</td><td>${m.role || 'N/A'}</td><td>${m.email || 'N/A'}</td><td>${m.phone || 'N/A'}</td></tr>`
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Project Teams</title></head><body><h2>Project Team Members</h2><p>Project: ${selectedProject?.projectName || selectedProject?.name || 'N/A'}</p><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>#</th><th>Team</th><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  if (!canRead) {
    return <Alert severity="warning">You need `project.read_all` to access Project Teams.</Alert>;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Header title="Project Teams" subtitle="Manage project team members across projects" />
      <Paper sx={{ p: 2, mt: 1, borderRadius: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, mb: 1.5 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ flex: 1 }}>
              <TextField
                select
                size="small"
                label="Project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                sx={{ minWidth: 320, maxWidth: 700, flex: 1 }}
              >
                {projects.map((p) => (
                  <MenuItem key={p.projectId || p.id} value={String(p.projectId || p.id)}>
                    {p.projectName || p.name || `Project ${p.projectId || p.id}`}
                  </MenuItem>
                ))}
              </TextField>
              <Chip
                size="small"
                label={`${teams.length} member${teams.length === 1 ? '' : 's'}`}
                variant="outlined"
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
              />
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' } }} />

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleTeamFileUpload}
              />
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate} disabled={!selectedProjectId}>
                Template
              </Button>
              <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileInputRef.current?.click()} disabled={!canWrite || !selectedProjectId}>
                Upload
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTeamsPDF} disabled={!teams.length}>
                PDF
              </Button>
              <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrintTeams} disabled={!teams.length}>
                Print
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} disabled={!canWrite || !selectedProjectId}>
                Add Team Member
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {loadingProjects || loadingTeams ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ height: 560, width: '100%' }}>
            <DataGrid
              rows={teams}
              getRowId={(r) => r.teamMemberId || `${r.teamName || ''}-${r.name || ''}-${r.email || ''}`}
              columns={[
                { field: 'teamName', headerName: 'Team', width: 150, valueGetter: (_, r) => r.teamName || r.role || 'General' },
                { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
                { field: 'role', headerName: 'Role', width: 180 },
                { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
                {
                  field: 'source',
                  headerName: 'Source',
                  width: 110,
                  sortable: false,
                  renderCell: (params) => {
                    const isStaff =
                      params.row.isStaffMember === true ||
                      params.row.staffSource === 'staff' ||
                      params.row.staffSource === 'employee';
                    return isStaff ? <Chip size="small" color="info" label="Staff" /> : '—';
                  },
                },
                { field: 'phone', headerName: 'Phone', width: 140 },
                {
                  field: 'actions',
                  headerName: '',
                  width: 110,
                  sortable: false,
                  renderCell: (params) => (
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" disabled={!canWrite} onClick={() => openEdit(params.row)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" disabled={!canWrite} onClick={() => handleDelete(params.row)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ),
                },
              ]}
              disableRowSelectionOnClick
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{
                borderRadius: 1.5,
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: 'action.hover',
                  borderBottom: 1,
                  borderColor: 'divider',
                },
                '& .MuiDataGrid-cell': {
                  py: 0.5,
                },
              }}
              slots={{
                noRowsOverlay: () => (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      {selectedProject ? `No team members added for ${selectedProject.projectName || selectedProject.name}.` : 'Select a project to view teams.'}
                    </Typography>
                  </Box>
                ),
              }}
            />
          </Box>
        )}
      </Paper>

      <Dialog open={openDialog} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTeam ? 'Edit Team Member' : 'Add Team Member'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Autocomplete
              options={staffDirectory}
              loading={loadingStaffDirectory}
              value={selectedStaff}
              onChange={(_, value) => {
                setSelectedStaff(value || null);
                if (!value) return;
                setForm((prev) => ({
                  ...prev,
                  name: value.fullName || prev.name,
                  email: value.email || prev.email,
                  role: prev.role || value.role || prev.role,
                }));
              }}
              getOptionLabel={(option) =>
                `${option.fullName}${option.role ? ` (${option.role})` : ''} — ${option.email}`
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Add from staff / employees"
                  placeholder="Search by name or email"
                  helperText="Directory merges users and employees by email."
                />
              )}
            />
            <TextField label="Team Name" value={form.teamName} onChange={(e) => setForm((p) => ({ ...p, teamName: e.target.value }))} />
            <TextField label="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={form.role}
                label="Role"
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              >
                <MenuItem value="Project Manager">Project Manager</MenuItem>
                <MenuItem value="Evaluation Committee">Evaluation Committee</MenuItem>
                <MenuItem value="PMC">PMC (Project Management Committee)</MenuItem>
                <MenuItem value="Inspection Team">Inspection Team</MenuItem>
                <MenuItem value="Technical Advisor">Technical Advisor</MenuItem>
                <MenuItem value="Financial Officer">Financial Officer</MenuItem>
                <MenuItem value="Quality Assurance">Quality Assurance</MenuItem>
                <MenuItem value="Safety Officer">Safety Officer</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <TextField label="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            <TextField label="Date Appointed" type="date" InputLabelProps={{ shrink: true }} value={form.dateAppointed} onChange={(e) => setForm((p) => ({ ...p, dateAppointed: e.target.value }))} />
            <TextField label="Date Ended" type="date" InputLabelProps={{ shrink: true }} value={form.dateEnded} onChange={(e) => setForm((p) => ({ ...p, dateEnded: e.target.value }))} />
            <TextField label="Notes" multiline rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canWrite}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
