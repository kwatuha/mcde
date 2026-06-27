import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/privilegeUtils';
import mobileAppService from '../api/mobileAppService';
import { ROUTES } from '../configs/appConfig';
import { Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function yesNoChip(onLatest) {
  if (onLatest === true) return <Chip size="small" label="Latest" color="success" />;
  if (onLatest === false) return <Chip size="small" label="Older" color="warning" />;
  return <Chip size="small" label="Unknown" variant="outlined" />;
}

export default function MobileAppUsagePage() {
  const { user } = useAuth();
  const canView = isAdmin(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [currentRelease, setCurrentRelease] = useState(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const [releaseResult, usageResult] = await Promise.allSettled([
        mobileAppService.getRelease(),
        mobileAppService.getUsageReport(),
      ]);

      if (releaseResult.status === 'fulfilled') {
        setCurrentRelease(releaseResult.value?.release || null);
      } else if (usageResult.status === 'fulfilled') {
        setCurrentRelease(usageResult.value?.currentRelease || null);
      }

      if (usageResult.status === 'fulfilled') {
        setReport(usageResult.value);
      } else {
        const e = usageResult.reason;
        const details = e?.response?.data?.details;
        const base =
          e?.response?.data?.message || e?.message || 'Could not load mobile app usage.';
        setError(details ? `${base} (${details})` : base);
        setReport(null);
      }
    } catch (e) {
      const details = e?.response?.data?.details;
      const base = e?.response?.data?.message || e?.message || 'Could not load mobile app usage.';
      setError(details ? `${base} (${details})` : base);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Alert severity="error">Administrator access is required to view mobile app usage.</Alert>
      </Box>
    );
  }

  const summary = report?.summary || {};
  const currentVersion = currentRelease?.version || report?.currentRelease?.version || '—';

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <PhoneAndroidIcon color="primary" sx={{ fontSize: 36 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            Mobile app usage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track APK downloads and field app activity by user and version. Current published release:{' '}
            <strong>{currentVersion}</strong>
          </Typography>
        </Box>
        <Button component={RouterLink} to={ROUTES.MOBILE_APP_DOWNLOAD} variant="outlined" size="small">
          Manage release
        </Button>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {[
              { label: 'APK downloads', value: summary.totalDownloads ?? 0 },
              { label: 'Staff who downloaded', value: summary.uniqueDownloaders ?? 0 },
              { label: 'Active app users', value: summary.uniqueAppUsers ?? 0 },
              { label: 'On latest app version', value: summary.onLatestAppVersion ?? 0 },
              { label: 'On older app version', value: summary.onOlderAppVersion ?? 0 },
            ].map((card) => (
              <Paper key={card.label} variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                <Typography variant="caption" color="text.secondary">
                  {card.label}
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {card.value}
                </Typography>
              </Paper>
            ))}
          </Stack>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              By version
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell align="right">Downloads</TableCell>
                    <TableCell align="right">Downloaders</TableCell>
                    <TableCell align="right">App activity</TableCell>
                    <TableCell align="right">App users</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(report?.versionBreakdown || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        No usage recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.versionBreakdown.map((row) => (
                      <TableRow key={row.version_label}>
                        <TableCell>{row.version_label}</TableCell>
                        <TableCell align="right">{row.download_count ?? 0}</TableCell>
                        <TableCell align="right">{row.downloader_count ?? 0}</TableCell>
                        <TableCell align="right">{row.app_activity_count ?? 0}</TableCell>
                        <TableCell align="right">{row.app_user_count ?? 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              By user
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Last downloaded version comes from the web portal. Last app version is reported when the Android app
              signs in or syncs.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Last download</TableCell>
                    <TableCell>Download ver.</TableCell>
                    <TableCell>Last app use</TableCell>
                    <TableCell>App ver.</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(report?.users || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No user activity yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.users.map((row) => (
                      <TableRow key={row.userId} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {row.fullName?.trim() || row.username || `#${row.userId}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.username}
                            {row.email ? ` · ${row.email}` : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.roleName || '—'}</TableCell>
                        <TableCell>{formatWhen(row.lastDownloadAt)}</TableCell>
                        <TableCell>{row.lastDownloadVersion || '—'}</TableCell>
                        <TableCell>{formatWhen(row.lastAppActivityAt)}</TableCell>
                        <TableCell>{row.lastAppVersion || '—'}</TableCell>
                        <TableCell align="center">{yesNoChip(row.onLatestAppVersion)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent events
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Event</TableCell>
                    <TableCell>Version</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(report?.recentEvents || []).slice(0, 50).map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>{formatWhen(ev.createdAt)}</TableCell>
                      <TableCell>{ev.username || `#${ev.userId}`}</TableCell>
                      <TableCell>{ev.eventType}</TableCell>
                      <TableCell>{ev.appVersion || ev.releaseVersion || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}
    </Box>
  );
}
