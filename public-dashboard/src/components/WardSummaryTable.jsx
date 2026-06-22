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
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  LocationCity,
  Visibility,
  TrendingUp,
  ExpandMore,
  NavigateNext,
} from '@mui/icons-material';
import WardProjectsModal from './WardProjectsModal';
import { getWardStats } from '../services/publicApi';
import { formatCurrency } from '../utils/formatters';

const WardSummaryTable = ({ finYearId, filters = {}, onDrillDown }) => {
  const theme = useTheme();
  const [wardsBySubCounty, setWardsBySubCounty] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedSubCounty, setExpandedSubCounty] = useState(null);

  useEffect(() => {
    fetchWardStats();
  }, [finYearId, filters]);

  const fetchWardStats = async () => {
    try {
      setLoading(true);
      const data = await getWardStats(finYearId, filters);
      
      // Group wards by sub-county
      const grouped = (data || []).reduce((acc, ward) => {
        const subCountyName = ward.subcounty_name || 'Unassigned';
        if (!acc[subCountyName]) {
          acc[subCountyName] = {
            subCountyName,
            wards: [],
            totalProjects: 0,
            totalBudget: 0
          };
        }
        acc[subCountyName].wards.push(ward);
        acc[subCountyName].totalProjects += ward.project_count || 0;
        acc[subCountyName].totalBudget += parseFloat(ward.total_budget) || 0;
        return acc;
      }, {});
      
      // Sort wards within each subcounty by project count
      Object.values(grouped).forEach(subCounty => {
        subCounty.wards.sort((a, b) => (b.project_count || 0) - (a.project_count || 0));
      });
      
      setWardsBySubCounty(grouped);
      setError(null);
      
      // Auto-expand first sub-county
      const firstSubCounty = Object.keys(grouped)[0];
      if (firstSubCounty) {
        setExpandedSubCounty(firstSubCounty);
      }
    } catch (err) {
      console.error('Error fetching ward stats:', err);
      setError('Failed to load ward statistics');
      setWardsBySubCounty({});
    } finally {
      setLoading(false);
    }
  };

  const handleWardClick = (ward) => {
    setSelectedWard(ward);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedWard(null);
  };

  const handleAccordionChange = (subCountyName) => (event, isExpanded) => {
    setExpandedSubCounty(isExpanded ? subCountyName : null);
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

  const subCounties = Object.values(wardsBySubCounty);
  
  if (subCounties.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <LocationCity sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No ward data available
        </Typography>
      </Paper>
    );
  }

  // Calculate grand totals
  const grandTotals = subCounties.reduce((acc, sc) => ({
    projects: acc.projects + sc.totalProjects,
    budget: acc.budget + sc.totalBudget,
    wards: acc.wards + sc.wards.length
  }), { projects: 0, budget: 0, wards: 0 });

  return (
    <>
      <Box sx={{ mb: 2.5 }}>
        <Box display="flex" alignItems="center" gap={1.5} mb={1}>
          <Box sx={{ 
            p: 1, 
            borderRadius: 2, 
            background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LocationCity sx={{ fontSize: 24, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
              Ward-Level Project Distribution
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', mt: 0.25 }}>
              Projects distributed across {grandTotals.wards} wards in {subCounties.length} sub-counties
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 6.5, display: 'block' }}>
          Click on any sub-county to expand and view wards, then click a ward to see its projects
        </Typography>
      </Box>

      {/* Grand Total Summary Card */}
      <Paper 
        elevation={0}
        sx={{
          p: 2.5,
          mb: 2.5,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)'
        }}
      >
        <Box display="flex" justifyContent="space-around" alignItems="center" flexWrap="wrap" gap={3}>
          <Box textAlign="center">
            <Typography variant="h3" fontWeight="bold" sx={{ fontSize: '2rem', mb: 0.5, textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              {grandTotals.wards}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.95, fontSize: '0.875rem' }}>
              Total Wards
            </Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h3" fontWeight="bold" sx={{ fontSize: '2rem', mb: 0.5, textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              {grandTotals.projects}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.95, fontSize: '0.875rem' }}>
              Total Projects
            </Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h4" fontWeight="bold" sx={{ fontSize: '1.5rem', mb: 0.5, textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              {formatCurrency(grandTotals.budget)}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.95, fontSize: '0.875rem' }}>
              Total Budget
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Wards Grouped by Sub-County */}
      <Box>
        {subCounties.map((subCounty, scIndex) => (
          <Accordion
            key={scIndex}
            expanded={expandedSubCounty === subCounty.subCountyName}
            onChange={handleAccordionChange(subCounty.subCountyName)}
            elevation={0}
            sx={{
              mb: 1.5,
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              border: '1px solid',
              borderColor: 'divider',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                borderColor: 'secondary.main',
                borderOpacity: 0.5
              },
              '&.Mui-expanded': {
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                borderColor: 'secondary.main',
                borderOpacity: 0.7
              }
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMore sx={{ color: 'secondary.main' }} />}
              sx={{
                backgroundColor: alpha(theme.palette.secondary.main, 0.05),
                borderRadius: '12px',
                px: 2,
                py: 1.5,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.secondary.main, 0.1)
                },
                '&.Mui-expanded': {
                  backgroundColor: alpha(theme.palette.secondary.main, 0.08),
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }
              }}
            >
              <Box sx={{ width: '100%', pr: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <Box sx={{ 
                      p: 0.75, 
                      borderRadius: 1.5, 
                      background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <LocationCity sx={{ fontSize: 20, color: 'white' }} />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ fontSize: '0.95rem', mb: 0.25 }}>
                        {subCounty.subCountyName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        {subCounty.wards.length} wards • {subCounty.totalProjects} projects
                      </Typography>
                    </Box>
                  </Box>
                  <Box textAlign="right">
                    <Typography variant="body1" fontWeight="bold" color="secondary.main" sx={{ fontSize: '0.95rem', mb: 0.25 }}>
                      {formatCurrency(subCounty.totalBudget)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      Total Budget
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
              <TableContainer>
                <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <TableHead>
                    <TableRow
                      sx={{
                        backgroundColor: alpha(theme.palette.secondary.main, 0.08),
                        '& th': {
                          borderBottom: '2px solid',
                          borderColor: 'secondary.main',
                          borderOpacity: 0.3,
                          py: 1.5,
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          letterSpacing: '0.02em'
                        }
                      }}
                    >
                      <TableCell sx={{ pl: 3 }}>Ward Name</TableCell>
                      <TableCell align="center">No. of Projects</TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>Total Budget</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {subCounty.wards.map((ward, wardIndex) => (
                      <TableRow
                        key={wardIndex}
                        hover
                        sx={{
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.secondary.main, 0.06),
                            cursor: 'pointer',
                            transform: 'scale(1.01)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                          },
                          '& td': {
                            py: 1.5,
                            borderBottom: '1px solid',
                            borderColor: 'divider'
                          }
                        }}
                      >
                        <TableCell
                          component="th"
                          scope="row"
                          onClick={() => handleWardClick(ward)}
                          sx={{
                            fontWeight: 600,
                            pl: 3,
                            fontSize: '0.875rem',
                            '&:hover': {
                              color: theme.palette.secondary.main
                            }
                          }}
                        >
                          <Box display="flex" alignItems="center" gap={1.25}>
                            <Box sx={{ 
                              p: 0.5, 
                              borderRadius: 1, 
                              background: alpha(theme.palette.secondary.main, 0.1),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <LocationCity sx={{ fontSize: 16, color: 'secondary.main' }} />
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {ward.ward_name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={ward.project_count || 0}
                            size="small"
                            sx={{ 
                              fontWeight: 'bold', 
                              minWidth: 50,
                              height: 28,
                              background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                              color: 'white',
                              fontSize: '0.8rem',
                              boxShadow: '0 2px 6px rgba(156, 39, 176, 0.3)'
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 3 }}>
                          <Typography variant="body2" fontWeight="600" color="secondary.main" sx={{ fontSize: '0.875rem' }}>
                            {formatCurrency(ward.total_budget || 0)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box display="flex" justifyContent="center" gap={0.25}>
                            {onDrillDown && (
                              <Tooltip title="Explore sublocations in this ward" arrow>
                                <IconButton
                                  size="small"
                                  sx={{ color: 'primary.main' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDrillDown(ward);
                                  }}
                                >
                                  <NavigateNext fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="View Ward Projects" arrow>
                              <IconButton
                                size="small"
                                onClick={() => handleWardClick(ward)}
                                sx={{
                                  color: 'secondary.main',
                                  '&:hover': {
                                    background: alpha(theme.palette.secondary.main, 0.1),
                                    transform: 'scale(1.1)'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Sub-County Subtotal Row */}
                    <TableRow
                      sx={{
                        background: 'linear-gradient(135deg, rgba(156, 39, 176, 0.15) 0%, rgba(123, 31, 162, 0.1) 100%)',
                        borderTop: '2px solid',
                        borderColor: 'secondary.main',
                        borderOpacity: 0.5,
                        '& td': {
                          fontWeight: 'bold',
                          fontSize: '0.9rem',
                          py: 1.75,
                          borderBottom: 'none'
                        },
                        '&:hover': {
                          background: 'linear-gradient(135deg, rgba(156, 39, 176, 0.2) 0%, rgba(123, 31, 162, 0.15) 100%)'
                        }
                      }}
                    >
                      <TableCell sx={{ pl: 3 }}>
                        <Box display="flex" alignItems="center" gap={1.25}>
                          <Box sx={{ 
                            p: 0.5, 
                            borderRadius: 1, 
                            background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <TrendingUp sx={{ fontSize: 16, color: 'white' }} />
                          </Box>
                          <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                            {subCounty.subCountyName} Subtotal
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={subCounty.totalProjects}
                          size="small"
                          sx={{ 
                            fontWeight: 'bold', 
                            minWidth: 50,
                            height: 32,
                            background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                            color: 'white',
                            fontSize: '0.85rem',
                            boxShadow: '0 3px 8px rgba(156, 39, 176, 0.4)'
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>
                        <Typography variant="body1" fontWeight="bold" color="secondary.main" sx={{ fontSize: '0.95rem' }}>
                          {formatCurrency(subCounty.totalBudget)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      {/* Ward Projects Modal */}
      {selectedWard && (
        <WardProjectsModal
          open={modalOpen}
          onClose={handleCloseModal}
          ward={selectedWard}
          finYearId={finYearId}
        />
      )}
    </>
  );
};

export default WardSummaryTable;


