import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import TuneIcon from '@mui/icons-material/Tune';
import reportsService from '../api/reportsService';

const EMPTY_OPTIONS = {
  financialYears: [],
  departments: [],
  sectors: [],
  periods: [],
};

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'machakos-reporting-template.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function ReportingTemplatePage() {
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [filters, setFilters] = useState({
    financialYear: '',
    period: '',
    department: '',
    sector: '',
    subSector: '',
  });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await reportsService.getReportingTemplateOptions();
        if (!active) return;
        const nextOptions = {
          financialYears: Array.isArray(data?.financialYears) ? data.financialYears : [],
          departments: Array.isArray(data?.departments) ? data.departments : [],
          sectors: Array.isArray(data?.sectors) ? data.sectors : [],
          periods: Array.isArray(data?.periods) ? data.periods : [],
        };
        setOptions(nextOptions);
        setFilters((prev) => ({
          ...prev,
          financialYear: prev.financialYear || nextOptions.financialYears[0] || '',
        }));
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.message || err?.message || 'Failed to load reporting template filters.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedSector = useMemo(() => {
    return options.sectors.find((sector) => (sector.sectorName || sector.name || '') === filters.sector) || null;
  }, [filters.sector, options.sectors]);

  const subSectorOptions = selectedSector?.subSectors || [];

  const updateFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'sector' ? { subSector: '' } : {}),
      ...(key === 'financialYear' && !value ? { period: '' } : {}),
    }));
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const { blob, fileName } = await reportsService.downloadReportingTemplate(filters);
      downloadBlob(blob, fileName);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to download reporting template.');
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
            <DescriptionIcon />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
              Departmental Reporting
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              Reporting Template
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
            disabled={loading || downloading}
            onClick={handleDownload}
            sx={{ minWidth: 190 }}
          >
            Download Word
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ borderRadius: 3, mb: 2.5 }}>
        <CardContent>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
            <TuneIcon color="primary" />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Template Filters
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Leave a filter blank to include all scoped records for that field.
              </Typography>
            </Box>
          </Stack>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Loading filters...
              </Typography>
            </Stack>
          ) : (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField
                select
                size="small"
                label="Financial year"
                value={filters.financialYear}
                onChange={updateFilter('financialYear')}
                sx={{ minWidth: 210 }}
              >
                <MenuItem value="">All years</MenuItem>
                {options.financialYears.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Period"
                value={filters.period}
                onChange={updateFilter('period')}
                disabled={!filters.financialYear}
                sx={{ minWidth: 190 }}
              >
                {(options.periods.length ? options.periods : [{ code: '', name: 'All periods' }]).map((item) => (
                  <MenuItem key={item.code || 'all'} value={item.code}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Department"
                value={filters.department}
                onChange={updateFilter('department')}
                sx={{ minWidth: 250 }}
              >
                <MenuItem value="">All departments</MenuItem>
                {options.departments.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Sector"
                value={filters.sector}
                onChange={updateFilter('sector')}
                sx={{ minWidth: 230 }}
              >
                <MenuItem value="">All sectors</MenuItem>
                {options.sectors.map((item) => {
                  const name = item.sectorName || item.name || '';
                  return (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  );
                })}
              </TextField>
              <TextField
                select
                size="small"
                label="Sub-sector"
                value={filters.subSector}
                onChange={updateFilter('subSector')}
                disabled={!filters.sector}
                sx={{ minWidth: 230 }}
              >
                <MenuItem value="">All sub-sectors</MenuItem>
                {subSectorOptions.map((item) => {
                  const name = item.subSectorName || item.name || '';
                  return (
                    <MenuItem key={item.id || name} value={name}>
                      {name}
                    </MenuItem>
                  );
                })}
              </TextField>
            </Stack>
          )}
        </CardContent>
      </Card>

    </Container>
  );
}
