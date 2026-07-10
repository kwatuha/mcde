import { Alert, Button, Stack, Typography } from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import useMobileAppRelease from '../hooks/useMobileAppRelease';

export default function MobileAppDownloadBanner({
  enabled = true,
  severity = 'info',
  sx = {},
  compact = false,
}) {
  const { available, release, isNewForUser } = useMobileAppRelease(enabled);

  if (!enabled || !available) return null;

  const versionLabel = release?.version ? `v${release.version}` : 'latest';
  const title = isNewForUser
    ? `Mobile app update available (${versionLabel})`
    : `Machakos Collector Android app (${versionLabel})`;

  return (
    <Alert
      severity={isNewForUser ? 'success' : severity}
      icon={<PhoneAndroidIcon fontSize="inherit" />}
      sx={{ mb: 2, ...sx }}
      action={(
        <Button
          color="inherit"
          size="small"
          component={RouterLink}
          to={ROUTES.MOBILE_APP_DOWNLOAD}
        >
          Download
        </Button>
      )}
    >
      <Stack spacing={compact ? 0 : 0.5}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {!compact ? (
          <Typography variant="body2">
            {release?.releaseNotes
              ? release.releaseNotes
              : 'Install the field collector app to sync checklists and record monitoring visits offline.'}
          </Typography>
        ) : null}
      </Stack>
    </Alert>
  );
}
