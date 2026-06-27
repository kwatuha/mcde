import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import mobileAppService from '../api/mobileAppService';

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

export default function MobileAppDownloadPage() {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [release, setRelease] = useState(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const loadRelease = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await mobileAppService.getRelease();
      setAvailable(!!data?.available);
      setRelease(data?.release || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not load mobile app info.');
      setAvailable(false);
      setRelease(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRelease();
  }, [loadRelease]);

  useEffect(() => {
    if (available && release?.id) {
      mobileAppService.dismissRelease().catch(() => {});
    }
  }, [available, release?.id]);

  const handleDownload = async () => {
    setDownloading(true);
    setMessage(null);
    setError(null);
    try {
      await mobileAppService.downloadApk(release?.originalFileName || 'machakos-collector.apk');
      setMessage('Download started. Open the APK on your Android phone to install.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <PhoneAndroidIcon color="primary" sx={{ fontSize: 36 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Machakos Field Collector
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Download the published Android app for mobile data collection.
          </Typography>
        </Box>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Current release
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : available && release ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleOutlineIcon color="success" />
              <Typography>
                Version <strong>{release.version}</strong>
                {release.fileSize ? ` · ${formatBytes(release.fileSize)}` : ''}
              </Typography>
            </Stack>
            {release.createdAt ? (
              <Typography variant="body2" color="text.secondary">
                Published {new Date(release.createdAt).toLocaleString()}
              </Typography>
            ) : null}
            {release.releaseNotes ? (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {release.releaseNotes}
              </Typography>
            ) : null}
            <Button
              variant="contained"
              size="large"
              startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CloudDownloadIcon />}
              onClick={handleDownload}
              disabled={downloading}
              sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
            >
              {downloading ? 'Downloading…' : 'Download APK'}
            </Button>
          </Stack>
        ) : (
          <Alert severity="warning">
            No mobile app has been published on this server yet. Contact an administrator.
          </Alert>
        )}

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle2" gutterBottom>
          Install on your phone
        </Typography>
        <Typography variant="body2" color="text.secondary" component="ol" sx={{ pl: 2.5, m: 0 }}>
          <li>Sign in on this page from your Android phone (Chrome works best).</li>
          <li>Tap <strong>Download APK</strong> and open the downloaded file.</li>
          <li>Allow installs from your browser if Android asks (Settings → Install unknown apps).</li>
          <li>Open <strong>Machakos Collector</strong>, sign in, sync checklists, and collect data offline.</li>
        </Typography>
      </Paper>
    </Box>
  );
}
