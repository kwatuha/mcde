import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LoginIcon from '@mui/icons-material/Login';
import { Link, useSearchParams } from 'react-router-dom';
import projectService from '../api/projectService';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext.jsx';

function formatDate(value) {
  if (value == null || value === '') return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function VerifyCertificatePage() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const runVerify = useCallback(async (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
      setResult({ valid: false, message: 'Enter a certificate number.' });
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await projectService.certificates.verifyByNumberPublic(trimmed);
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.details || err?.response?.data?.message || err?.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get('cert') || searchParams.get('number');
    if (fromUrl) {
      setInput(fromUrl);
      runVerify(fromUrl);
    }
  }, [searchParams, runVerify]);

  const handleSubmit = (e) => {
    e.preventDefault();
    runVerify(input);
  };

  const projectLink =
    result?.valid && result?.project?.projectId != null
      ? ROUTES.PROJECT_DETAILS.replace(':projectId', String(result.project.projectId))
      : null;

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', py: { xs: 2, sm: 4 }, px: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <VerifiedUserIcon color="primary" sx={{ fontSize: 36 }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Verify project certificate
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter the certificate number printed on the payment certificate. This check does not require an account.
          </Typography>
        </Box>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Certificate number"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. as shown on the certificate header"
                fullWidth
                autoComplete="off"
                disabled={loading}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button type="submit" variant="contained" disabled={loading}>
                  {loading ? 'Checking…' : 'Verify'}
                </Button>
                {!token && (
                  <Button component={Link} to={ROUTES.LOGIN} variant="outlined" startIcon={<LoginIcon />}>
                    Staff login
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {result && !result.valid ? (
        <Alert severity="warning" icon={<VerifiedUserIcon fontSize="inherit" />}>
          {result.message || 'Invalid certificate number — no matching record was found.'}
        </Alert>
      ) : null}

      {result && result.valid ? (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Certificate found
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.25}>
              <Typography>
                <strong>Certificate no.:</strong> {result.certificate?.certNumber || '—'}
              </Typography>
              <Typography>
                <strong>Type:</strong> {result.certificate?.certType || '—'}
              </Typography>
              <Typography>
                <strong>Request / issue date:</strong> {formatDate(result.certificate?.requestDate)}
              </Typography>
              <Typography>
                <strong>Application status:</strong> {result.certificate?.applicationStatus || '—'}
              </Typography>
              <Typography>
                <strong>Progress status:</strong> {result.certificate?.progressStatus || '—'}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography>
                <strong>Project:</strong> {result.project?.projectName || '—'}
              </Typography>
              <Typography>
                <strong>Project status:</strong> {result.project?.status || '—'}
              </Typography>
              {token && projectLink ? (
                <Box sx={{ pt: 1 }}>
                  <Button
                    component={Link}
                    to={projectLink}
                    variant="outlined"
                    endIcon={<OpenInNewIcon />}
                  >
                    Open project details
                  </Button>
                </Box>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}
    </Box>
  );
}
