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
import { Home, Visibility, ExpandMore } from '@mui/icons-material';
import VillageProjectsModal from './VillageProjectsModal';
import { getVillageStats } from '../services/publicApi';
import { formatCurrency } from '../utils/formatters';

const GRADIENT = 'linear-gradient(135deg, #ffb74d 0%, #f57c00 100%)';

const VillageSummaryTable = ({ finYearId, filters = {} }) => {
  const [bySublocation, setBySublocation] = useState({});
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
      const data = await getVillageStats(finYearId, filters);
      const grouped = (data || []).reduce((acc, row) => {
        const key = `${row.subcounty_name || 'Unassigned'} > ${row.ward_name || 'Unassigned'} > ${row.sublocation_name || 'Unassigned'}`;
        if (!acc[key]) {
          acc[key] = {
            label: key,
            subcountyName: row.subcounty_name,
            wardName: row.ward_name,
            sublocationName: row.sublocation_name,
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
      setBySublocation(grouped);
      setError(null);
      const first = Object.keys(grouped)[0];
      if (first) setExpanded(first);
    } catch (err) {
      console.error('Error fetching village stats:', err);
      setError('Failed to load village statistics');
      setBySublocation({});
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

  const groups = Object.values(bySublocation);
  if (groups.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Home sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">No village data available</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Projects need village details in their location data to appear here.
        </Typography>
      </Paper>
    );
  }

  const grandTotals = groups.reduce(
    (acc, g) => ({
      villages: acc.villages + g.items.length,
      projects: acc.projects + g.totalProjects,
      budget: acc.budget + g.totalBudget
    }),
    { villages: 0, projects: 0, budget: 0 }
  );

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
          Village-Level Project Distribution
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {grandTotals.villages} villages across {groups.length} sublocations · {grandTotals.projects} projects
        </Typography>
      </Box>

      {groups.map((group) => (
        <Accordion
          key={group.label}
          expanded={expanded === group.label}
          onChange={(_, isExpanded) => setExpanded(isExpanded ? group.label : null)}
          elevation={0}
          sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: '#f57c00' }} />} sx={{ px: 2 }}>
            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', pr: 2 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">{group.sublocationName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {group.wardName} Ward · {group.subcountyName} · {group.items.length} villages · {group.totalProjects} projects
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight="bold" sx={{ color: '#f57c00' }}>
                {formatCurrency(group.totalBudget)}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: alpha('#f57c00', 0.08) }}>
                    <TableCell sx={{ pl: 3 }}>Village</TableCell>
                    <TableCell align="center">Projects</TableCell>
                    <TableCell align="right" sx={{ pr: 3 }}>Budget</TableCell>
                    <TableCell align="center">View</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.items.map((row, idx) => (
                    <TableRow key={idx} hover sx={{ cursor: 'pointer' }} onClick={() => { setSelected(row); setModalOpen(true); }}>
                      <TableCell sx={{ pl: 3, fontWeight: 600 }}>{row.village_name}</TableCell>
                      <TableCell align="center">
                        <Chip label={row.project_count || 0} size="small" sx={{ background: GRADIENT, color: 'white', fontWeight: 'bold' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>{formatCurrency(row.total_budget || 0)}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="View projects">
                          <IconButton size="small" sx={{ color: '#f57c00' }} onClick={(e) => { e.stopPropagation(); setSelected(row); setModalOpen(true); }}>
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
        <VillageProjectsModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          village={selected}
          finYearId={finYearId}
        />
      )}
    </>
  );
};

export default VillageSummaryTable;
