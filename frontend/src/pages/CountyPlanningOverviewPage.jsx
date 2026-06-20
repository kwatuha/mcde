import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Stack, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import Header from './dashboard/Header';

export default function CountyPlanningOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    axiosInstance.get('/accountability/county-planning-overview')
      .then(({ data }) => setDomains(data?.domains || []))
      .catch((err) => setError(err?.response?.data?.message || err?.message || 'Failed to load overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Header
        title="County Planning Overview"
        subtitle="Cross-programme snapshot of CIDP, ADP, and RRI delivery linkages"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          {domains.map((domain) => (
            <Grid item xs={12} md={4} key={domain.key}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>{domain.label}</Typography>
                  <Stack spacing={1} sx={{ mb: 2 }}>
                    <Typography variant="body2">Programmes: <strong>{domain.programmes}</strong></Typography>
                    <Typography variant="body2">Linked registry projects: <strong>{domain.linkedProjects}</strong></Typography>
                  </Stack>
                  <Button component={RouterLink} to={domain.route} variant="contained" size="small">
                    Open progress view
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
