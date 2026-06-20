import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';

/** Legacy route — redirects to unified Project Details inception tab. */
export default function KdspProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (projectId) {
      navigate(`/projects/${projectId}?tab=inception`, { replace: true });
    }
  }, [projectId, navigate]);

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
      <CircularProgress size={28} />
      <Typography sx={{ ml: 2 }}>Opening project inception…</Typography>
    </Box>
  );
}
