import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/privilegeUtils';
import mobileAppService from '../api/mobileAppService';

const ACCEPT_APK = '.apk,application/vnd.android.package-archive';

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
  const { user } = useAuth();
  const canUpload = isAdmin(user);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [release, setRelease] = useState(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showManualUpload, setShowManualUpload] = useState(false);

  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [apkFile, setApkFile] = useState(null);

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

  const handleUpload = async () => {
    if (!apkFile) {
      setError('Choose an APK file first.');
      return;
    }
    if (!version.trim()) {
      setError('Enter a version label (e.g. 1.0.0).');
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      await mobileAppService.uploadRelease(apkFile, {
        version: version.trim(),
        releaseNotes: releaseNotes.trim(),
      });
      setApkFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage('Mobile app release updated. Staff can download the new APK below.');
      await loadRelease();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Upload failed.');
    } finally {
      setUploading(false);
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
            <Typography variant="body2" component="div" sx={{ mb: 1 }}>
              No mobile app has been published on this server yet.
            </Typography>
            <Typography variant="body2" component="div">
              An administrator should run the release script from the project (builds the APK and registers it
              in the database), for example:
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 1,
                mb: 0,
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontSize: '0.8rem',
                overflow: 'auto',
              }}
            >
              {`./deploy/release-mobile-app-mcmes.sh --version 1.0.0 --notes "Initial release"`}
            </Box>
            {canUpload ? (
              <Typography variant="body2" sx={{ mt: 1.5 }}>
                Alternatively, expand <strong>Manual upload (optional)</strong> below to publish an APK through
                the web portal.
              </Typography>
            ) : null}
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

      {canUpload ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Button
            fullWidth
            onClick={() => setShowManualUpload((v) => !v)}
            endIcon={showManualUpload ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{
              justifyContent: 'space-between',
              textTransform: 'none',
              color: 'text.primary',
              py: 1,
              px: 0,
              mb: showManualUpload ? 2 : 0,
            }}
          >
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="h6" component="span" display="block">
                Manual upload (optional)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use only if the automated release script is unavailable. Normal publishing is via{' '}
                <code>deploy/release-mobile-app*.sh</code>.
              </Typography>
            </Box>
          </Button>
          <Collapse in={showManualUpload}>
            <Stack spacing={2}>
              <TextField
                label="Version"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                label="Release notes (optional)"
                placeholder="What's new in this build"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
              <Button variant="outlined" component="label">
                {apkFile ? apkFile.name : 'Choose APK file'}
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept={ACCEPT_APK}
                  onChange={(e) => setApkFile(e.target.files?.[0] || null)}
                />
              </Button>
              <Button
                variant="contained"
                color="secondary"
                startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <CloudUploadIcon />}
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Upload & publish'}
              </Button>
            </Stack>
          </Collapse>
        </Paper>
      ) : null}
    </Box>
  );
}
