import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Grid,
  Alert,
} from '@mui/material';
import apiService from '../api';

const SiteUpdatesDialog = ({ open, onClose, projectId, site }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status: '',
    date: '',
    notes: '',
    budget_kes: '',
    challenges: '',
    recommendations: '',
  });

  useEffect(() => {
    if (open && projectId && site?.site_id) {
      fetchHistory();
    } else if (!open) {
      setHistory([]);
      setError(null);
      setForm({
        status: '',
        date: '',
        notes: '',
        budget_kes: '',
        challenges: '',
        recommendations: '',
      });
    }
  }, [open, projectId, site?.site_id]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.junctions.getProjectSiteHistory(projectId, site.site_id);
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch site history:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId || !site?.site_id) return;
    try {
      setSaving(true);
      setError(null);
      await apiService.junctions.createProjectSiteHistory(projectId, site.site_id, {
        status: form.status || null,
        change_date: form.date || null,
        notes: form.notes || null,
        budget_kes: form.budget_kes,
        challenges: form.challenges || null,
        recommendations: form.recommendations || null,
      });
      // Refresh list and reset form
      await fetchHistory();
      setForm({
        status: '',
        date: dayjs(),
        notes: '',
        budget_kes: '',
        challenges: '',
        recommendations: '',
      });
    } catch (err) {
      console.error('Failed to create site update:', err);
      setError(err.response?.data?.message || err.message || 'Failed to save update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Site Updates – {site?.site_name || `Site ${site?.site_id || ''}`}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            History
          </Typography>
          {loading ? (
            <Typography variant="body2" color="text.secondary">
              Loading history...
            </Typography>
          ) : history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No updates recorded yet.
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid #e0e0e0',
                borderRadius: 1,
                p: 1,
              }}
            >
              {history.map((h) => (
                <Box
                  key={h.id}
                  sx={{
                    mb: 1,
                    pb: 1,
                    borderBottom: '1px dashed #eee',
                    '&:last-of-type': { borderBottom: 'none', mb: 0, pb: 0 },
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {h.change_date
                      ? dayjs(h.change_date).format('YYYY-MM-DD')
                      : ''}
                    {h.status ? ` • Status: ${h.status}` : ''}
                    {h.budget_kes
                      ? ` • Budget: ${Number(h.budget_kes).toLocaleString()}`
                      : ''}
                  </Typography>
                  {h.notes && (
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {h.notes}
                    </Typography>
                  )}
                  {(h.challenges || h.recommendations) && (
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                    >
                      {h.challenges && `Challenges: ${h.challenges} `}
                      {h.recommendations &&
                        `Recommendations: ${h.recommendations}`}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add Update
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Status"
                fullWidth
                size="small"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Date"
                type="date"
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                value={form.date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Budget (KES)"
                fullWidth
                size="small"
                type="number"
                value={form.budget_kes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, budget_kes: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                fullWidth
                size="small"
                multiline
                minRows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Challenges"
                fullWidth
                size="small"
                multiline
                minRows={2}
                value={form.challenges}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, challenges: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Recommendations"
                fullWidth
                size="small"
                multiline
                minRows={2}
                value={form.recommendations}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    recommendations: e.target.value,
                  }))
                }
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Close
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SiteUpdatesDialog;

