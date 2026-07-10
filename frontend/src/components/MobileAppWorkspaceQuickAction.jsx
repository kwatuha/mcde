import {
  Box,
  Card,
  CardActionArea,
  Stack,
  Typography,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../configs/appConfig';
import { canAccessMobileCollectorDownload } from '../utils/mobileCollectorAccessUtils';

const COLOR = '#1565c0';

export default function MobileAppWorkspaceQuickAction() {
  const navigate = useNavigate();
  const { user, hasPrivilege } = useAuth();

  if (!canAccessMobileCollectorDownload(user, hasPrivilege)) {
    return null;
  }

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s',
        '&:hover': {
          borderColor: COLOR,
          boxShadow: `0 8px 24px ${COLOR}22`,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardActionArea
        onClick={() => navigate(ROUTES.MOBILE_APP_DOWNLOAD)}
        sx={{ height: '100%', p: 2 }}
      >
        <Stack spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${COLOR}18`,
              color: COLOR,
            }}
          >
            <PhoneAndroidIcon />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Mobile collector app
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Download the Android app for offline checklists and field visits.
            </Typography>
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
