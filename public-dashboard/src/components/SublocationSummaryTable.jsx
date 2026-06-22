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
  alpha,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { Place, Visibility, ExpandMore, NavigateNext } from '@mui/icons-material';
import SublocationProjectsModal from './SublocationProjectsModal';
import { getSublocationStats } from '../services/publicApi';
import { formatCurrency } from '../utils/formatters';

const GRADIENT = 'linear-gradient(135deg, #26a69a 0%, #00897b 100%)';

const SublocationSummaryTable = ({ finYearId, filters = {}, onDrillDown }) => {
  const [byWard, setByWard] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetchStats();
  }, [finYearId, filters]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await getSublocationStats(finYearId, filters);
      const grouped = (data || []).reduce((acc, row) => {
        const key = `${row.subcounty_name || 'Unassigned'} > ${row.ward_name || 'Unassigned'}`;
        if (!acc[key]) {
          acc[key] = {
            label: key,
            subcountyName: row.subcounty_name,
            wardName: row.ward_name,
            items: [],
            totalProjects: 0,
            totalBudget: 0
          };
        }
        acc[key].items.push(row);
        acc[key].totalProjects += row.project_count || 0;
        acc[key].totalBudget += parseFloat(row.total_budget) || 0;
        return acc;
      }, {});
      Object.values(grouped).forEach((g) => {
        g.items.sort((a, b) => (b.project_count || 0) - (a.project_count || 0));
      });
      setByWard(grouped);
      setError(null);
      const first = Object.keys(grouped)[0];
      if (first) setExpanded(first);
    } catch (err) {
      console.error('Error fetching sublocation stats:', err);
      setError('Failed to load sublocation statistics');
      setByWard({});
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  }

  const wards = Object.values(byWard);
  if (wards.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Place sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">No sublocation data available</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Projects need sublocation details in their location data to appear here.
        </Typography>
      </Paper>
    );
  }

  const grandTotals = wards.reduce(
    (acc, w) => ({
      sublocations: acc.sublocations + w.items.length,
      projects: acc.projects + w.totalProjects,
      budget: acc.budget + w.totalBudget
    }),
    { sublocations: 0, projects: 0, budget: 0 }
  );

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
          Sublocation-Level Project Distribution
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {grandTotals.sublocations} sublocations across {wards.length} wards · {grandTotals.projects} projects
        </Typography>
      </Box>

      {wards.map((ward) => (
        <Accordion
          key={ward.label}
          expanded={expanded === ward.label}
          onChange={(_, isExpanded) => setExpanded(isExpanded ? ward.label : null)}
          elevation={0}
          sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: '#00897b' }} />} sx={{ px: 2 }}>
            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', pr: 2 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">{ward.wardName} Ward</Typography>
                <Typography variant="caption" color="text.secondary">
                  {ward.subcountyName} · {ward.items.length} sublocations · {ward.totalProjects} projects
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight="bold" sx={{ color: '#00897b' }}>
                {formatCurrency(ward.totalBudget)}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: alpha('#00897b', 0.08) }}>
                    <TableCell sx={{ pl: 3 }}>Sublocation</TableCell>
                    <TableCell align="center">Projects</TableCell>
                    <TableCell align="right" sx={{ pr: 3 }}>Budget</TableCell>
                    <TableCell align="center">View</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ward.items.map((row, idx) => (
                    <TableRow key={idx} hover sx={{ cursor: 'pointer' }} onClick={() => { setSelected(row); setModalOpen(true); }}>
                      <TableCell sx={{ pl: 3, fontWeight: 600 }}>{row.sublocation_name}</TableCell>
                      <TableCell align="center">
                        <Chip label={row.project_count || 0} size="small" sx={{ background: GRADIENT, color: 'white', fontWeight: 'bold' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>{formatCurrency(row.total_budget || 0)}</TableCell>
                      <TableCell align="center">
                        <Box display="flex" justifyContent="center" gap={0.25}>
                          {onDrillDown && (
                            <Tooltip title="Explore villages in this sublocation">
                              <IconButton
                                size="small"
                                sx={{ color: '#00897b' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDrillDown(row);
                                }}
                              >
                                <NavigateNext fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="View projects">
                            <IconButton
                              size="small"
                              sx={{ color: '#00897b' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(row);
                                setModalOpen(true);
                              }}
                            >
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      ))}

      {selected && (
        <SublocationProjectsModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          sublocation={selected}
          finYearId={finYearId}
        />
      )}
    </>
  );
};

export default SublocationSummaryTable;
