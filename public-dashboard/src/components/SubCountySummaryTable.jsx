import React, { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
  alpha,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  LocationOn,
  Visibility,
  TrendingUp,
  Assessment,
  NavigateNext,
} from '@mui/icons-material';
import SubCountyProjectsModal from './SubCountyProjectsModal';
import { getSubCountyStats } from '../services/publicApi';
import { formatCurrency } from '../utils/formatters';

const SubCountySummaryTable = ({ finYearId, filters = {}, onDrillDown }) => {
  const theme = useTheme();
  const [subCounties, setSubCounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubCounty, setSelectedSubCounty] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchSubCountyStats();
  }, [finYearId, filters]);

  const fetchSubCountyStats = async () => {
    try {
      setLoading(true);
      const data = await getSubCountyStats(finYearId, filters);
      // Sort by number of projects descending
      const sorted = (data || []).sort((a, b) => (b.project_count || 0) - (a.project_count || 0));
      setSubCounties(sorted);
      setError(null);
    } catch (err) {
      console.error('Error fetching subcounty stats:', err);
      setError('Failed to load sub-county statistics');
      setSubCounties([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubCountyClick = (subCounty) => {
    setSelectedSubCounty(subCounty);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSubCounty(null);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (subCounties.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <LocationOn sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No sub-county data available
        </Typography>
      </Paper>
    );
  }

  // Calculate totals
  const totals = subCounties.reduce((acc, sc) => ({
    projects: acc.projects + (sc.project_count || 0),
    budget: acc.budget + (parseFloat(sc.total_budget) || 0)
  }), { projects: 0, budget: 0 });

  return (
    <>
      <Box sx={{ mb: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <LocationOn color="primary" />
          <Typography variant="h5" fontWeight="bold">
            Projects per Sub-County
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Distribution of projects across sub-counties
        </Typography>
      </Box>

      <TableContainer 
        component={Paper} 
        elevation={3}
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          '& .MuiTableCell-head': {
            fontWeight: 'bold',
            backgroundColor: theme.palette.success.main,
            color: theme.palette.success.contrastText,
          }
        }}
      >
        <Table sx={{ minWidth: 400 }}>
          <TableHead>
            <TableRow>
              <TableCell>Sub-County</TableCell>
              <TableCell align="center">No. of Projects</TableCell>
              <TableCell align="right">Total Budgeted Amount</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subCounties.map((subCounty, index) => (
              <TableRow
                key={index}
                hover
                sx={{
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.success.main, 0.05),
                    cursor: 'pointer'
                  },
                  '&:last-child td, &:last-child th': { border: 0 }
                }}
              >
                <TableCell 
                  component="th" 
                  scope="row"
                  onClick={() => handleSubCountyClick(subCounty)}
                  sx={{ 
                    fontWeight: 500,
                    '&:hover': {
                      color: theme.palette.success.main
                    }
                  }}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <LocationOn sx={{ fontSize: 20, color: 'text.secondary' }} />
                    {subCounty.subcounty_name || 'Unknown'}
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={subCounty.project_count || 0}
                    size="medium"
                    color="primary"
                    sx={{ fontWeight: 'bold', minWidth: 60 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body1" fontWeight="medium" color="success.main">
                    {formatCurrency(subCounty.total_budget || 0)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Box display="flex" justifyContent="center" gap={0.5}>
                    {onDrillDown && (
                      <Tooltip title="Explore wards in this sub-county">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() =>
                            onDrillDown({
                              subcounty_name: subCounty.subcounty_name,
                              subcounty_id: subCounty.subcounty_id,
                            })
                          }
                        >
                          <NavigateNext />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="View Sub-County Projects">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => handleSubCountyClick(subCounty)}
                      >
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            
            {/* Totals Row */}
            <TableRow
              sx={{
                backgroundColor: alpha(theme.palette.success.main, 0.12),
                '& td': {
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                  borderTop: `2px solid ${theme.palette.success.main}`
                }
              }}
            >
              <TableCell component="th" scope="row">
                <Box display="flex" alignItems="center" gap={1}>
                  <TrendingUp sx={{ color: 'success.main' }} />
                  Total
                </Box>
              </TableCell>
              <TableCell align="center">
                <Chip
                  label={totals.projects}
                  size="medium"
                  color="success"
                  sx={{ fontWeight: 'bold', minWidth: 60 }}
                />
              </TableCell>
              <TableCell align="right">
                <Typography variant="body1" fontWeight="bold" color="success.main">
                  {formatCurrency(totals.budget)}
                </Typography>
              </TableCell>
              <TableCell align="center">-</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {/* SubCounty Projects Modal */}
      {selectedSubCounty && (
        <SubCountyProjectsModal
          open={modalOpen}
          onClose={handleCloseModal}
          subCounty={selectedSubCounty}
          finYearId={finYearId}
        />
      )}
    </>
  );
};

export default SubCountySummaryTable;

