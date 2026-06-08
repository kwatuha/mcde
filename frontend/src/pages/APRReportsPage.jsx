import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import reportsService from '../api/reportsService';

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'machakos-apr.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function APRReportsPage() {
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await reportsService.getAPRFinancialYears();
        if (!active) return;
        const years = Array.isArray(data?.financialYears) ? data.financialYears : [];
        setFinancialYears(years);
        setSelectedYear((current) => current || years[0] || '');
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.message || err?.message || 'Failed to load APR financial years.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleDownload = async () => {
    if (!selectedYear) return;
    setDownloading(true);
    setError('');
    try {
      const { blob, fileName } = await reportsService.downloadAPRReport(selectedYear);
      downloadBlob(blob, fileName);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to download APR Word report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mb: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.50',
              color: 'primary.main',
              flexShrink: 0,
            }}
          >
            <AssessmentIcon />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
              Annual Performance Reporting
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              APR Reports
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 900 }}>
              Generate a Word-based Annual Progress Report scoped to the selected financial year and the current
              user&apos;s organization access.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              select
              size="small"
              label="Financial year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={loading || financialYears.length === 0}
              sx={{ minWidth: 220 }}
            >
              {financialYears.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={!selectedYear || loading || downloading}
              onClick={handleDownload}
              sx={{ minWidth: 180 }}
            >
              Download Word
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Loading available financial years...
          </Typography>
        </Paper>
      ) : financialYears.length === 0 ? (
        <Alert severity="info">
          No financial years were found from scoped project data. Once projects have timeline dates or financial year
          values, they will appear here for APR generation.
        </Alert>
      ) : null}
    </Container>
  );
}
