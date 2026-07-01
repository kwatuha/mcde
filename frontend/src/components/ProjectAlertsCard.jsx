import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Avatar,
  Button,
  Alert,
  AlertTitle,
  CircularProgress,
  useTheme,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Assignment as AssignmentIcon,
  PriorityHigh as PriorityHighIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import { tokens } from '../pages/dashboard/theme';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function iconForCategory(category) {
  switch (category) {
    case 'finance':
      return <TrendingUpIcon />;
    case 'schedule':
      return <ScheduleIcon />;
    case 'quality':
      return <WarningIcon />;
    case 'risk':
      return <ErrorIcon />;
    case 'monitoring':
      return <AssignmentIcon />;
    default:
      return <InfoIcon />;
  }
}

const ProjectAlertsCard = ({ currentUser }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!currentUser) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await apiService.projectEscalations.listSignals({ limit: 12 });
      setAlerts(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not load project alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return colors.redAccent?.[500] || '#f44336';
      case 'high':
        return colors.yellowAccent?.[500] || '#ff9800';
      case 'medium':
        return colors.blueAccent?.[500] || '#2196f3';
      case 'low':
        return colors.greenAccent?.[500] || '#4caf50';
      default:
        return colors.grey[400];
    }
  };

  const handleAction = async (signalId, action) => {
    setBusyId(signalId);
    try {
      if (action === 'acknowledge') {
        await apiService.projectEscalations.acknowledge(signalId, 'Acknowledged from dashboard');
      } else {
        await apiService.projectEscalations.resolve(signalId, 'Resolved from dashboard');
      }
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high');
  const openAlerts = alerts.filter((a) => a.status === 'open');

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 3,
        bgcolor: '#ffffff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight="bold" color="#000000">
            Project Escalations
          </Typography>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              label={`${criticalAlerts.length} high+`}
              size="small"
              sx={{ bgcolor: '#f44336', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}
            />
            <Chip
              label={`${openAlerts.length} open`}
              size="small"
              sx={{ bgcolor: '#ff9800', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}
            />
            <Button size="small" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress size={32} />
          </Box>
        ) : alerts.length === 0 ? (
          <Alert severity="success" sx={{ flex: 1 }}>
            No open project escalations in your scope.
          </Alert>
        ) : (
          <>
            {criticalAlerts.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <AlertTitle sx={{ fontWeight: 'bold' }}>
                  {criticalAlerts.length} high-priority escalation{criticalAlerts.length > 1 ? 's' : ''}
                </AlertTitle>
                Review schedule, finance, quality, or risk signals below.
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
              {alerts.map((alert) => (
                <Box
                  key={alert.signalId}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    border: `1px solid ${getSeverityColor(alert.severity)}30`,
                    borderLeft: `4px solid ${getSeverityColor(alert.severity)}`,
                  }}
                >
                  <Box display="flex" alignItems="flex-start" gap={2}>
                    <Avatar sx={{ bgcolor: getSeverityColor(alert.severity), width: 40, height: 40 }}>
                      {iconForCategory(alert.category)}
                    </Avatar>
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
                        <Typography variant="subtitle2" fontWeight="bold">
                          {alert.title}
                        </Typography>
                        <Chip label={String(alert.severity || 'medium').toUpperCase()} size="small" color="default" />
                        <Chip label={`L${alert.escalationLevel || 1}`} size="small" variant="outlined" />
                        {alert.severity === 'critical' && (
                          <PriorityHighIcon sx={{ color: '#f44336', fontSize: 16 }} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {alert.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {alert.projectName} · {alert.department || '—'} · {formatWhen(alert.detectedAt)}
                      </Typography>
                      <Box display="flex" gap={1} mt={1.5} flexWrap="wrap">
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => navigate(`${ROUTES.PROJECTS}/${alert.projectId}`)}
                        >
                          Open project
                        </Button>
                        {alert.status === 'open' && (
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busyId === alert.signalId}
                            onClick={() => handleAction(alert.signalId, 'acknowledge')}
                          >
                            Acknowledge
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={busyId === alert.signalId}
                          onClick={() => handleAction(alert.signalId, 'resolve')}
                        >
                          Resolve
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}

        <Box mt={2} pt={2} borderTop="1px solid rgba(0,0,0,0.08)">
          <Button size="small" onClick={() => navigate(ROUTES.OPERATIONS_DASHBOARD)}>
            View operations dashboard
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ProjectAlertsCard;
