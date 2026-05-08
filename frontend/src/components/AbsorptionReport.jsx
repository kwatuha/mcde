import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Chip,
    IconButton,
    Tooltip,
    Fade,
    Slide,
    CircularProgress,
    Alert,
    useTheme,
    Card,
    CardContent,
    Divider,
    Grid,
    Stack,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField
} from '@mui/material';
import {
    PictureAsPdf as PdfIcon,
    TableChart as ExcelIcon,
    FilterList as FilterIcon,
    Refresh as RefreshIcon,
    PlayArrow as PlayIcon,
    MoreVert as MoreVertIcon
} from '@mui/icons-material';
import apiService from '../api';
import { formatCurrency } from '../utils/helpers';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const AbsorptionReport = () => {
    const theme = useTheme();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState([]);
    const [totals, setTotals] = useState({
        count: 0,
        averageCompletion: 0,
        totalBudget: 0,
        totalContractSum: 0,
        totalPaidAmount: 0,
        absorbedPercentage: 0
    });
    const [filters, setFilters] = useState({
        department: '',
        status: '',
        startDate: '',
        endDate: '',
        minAbsorption: '',
        maxAbsorption: ''
    });
    const [departments, setDepartments] = useState([]);
    const [exportingPDF, setExportingPDF] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const fetchData = async (activeFilters = filters) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiService.reports.getAbsorptionReport(activeFilters);
            setReportData(response.data || []);
            setTotals(response.summary || {
                count: 0,
                averageCompletion: 0,
                totalBudget: 0,
                totalContractSum: 0,
                totalPaidAmount: 0,
                absorbedPercentage: 0
            });
        } catch (err) {
            console.error('Error fetching absorption report:', err);
            setError('Failed to load absorption report data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        (async () => {
            try {
                const opts = await apiService.reports.getFilterOptions();
                const list = Array.isArray(opts?.departments) ? opts.departments : [];
                setDepartments(list.map((d) => d?.name).filter(Boolean));
            } catch {
                setDepartments([]);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatPercentage = (value) => {
        return `${value.toFixed(1)}%`;
    };

    const handleExportPDF = () => {
        setExportingPDF(true);
        try {
            const doc = new jsPDF('landscape', 'pt', 'a4');
            
            // Add title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Absorption Report', 40, 40);
            
            // Add subtitle
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text('Project budget absorption and financial performance analysis', 40, 60);
            
            // Add generation date
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 80);
            
            // Prepare table data
            const headers = [
                'Department',
                'Projects',
                'Ward',
                'Status',
                '% Complete',
                'Budget',
                'Contract Sum',
                'Paid Amount',
                'Absorption %'
            ];
            
            const data = reportData.map(row => [
                row.department,
                row.projectCount.toString(),
                row.ward || '-',
                row.status || '-',
                `${row.completionPercentage.toFixed(1)}%`,
                formatCurrency(row.budget),
                formatCurrency(row.contractSum),
                formatCurrency(row.paidAmount),
                `${row.absorptionPercentage.toFixed(1)}%`
            ]);
            
            // Add summary row
            data.push([
                'TOTAL',
                totals.count.toString(),
                '-',
                '-',
                `${totals.averageCompletion.toFixed(1)}%`,
                formatCurrency(totals.totalBudget),
                formatCurrency(totals.totalContractSum),
                formatCurrency(totals.totalPaidAmount),
                `${totals.absorbedPercentage.toFixed(1)}%`
            ]);
            
            // Create table
            doc.autoTable({
                head: [headers],
                body: data,
                startY: 100,
                styles: {
                    fontSize: 8,
                    cellPadding: 3,
                    overflow: 'linebreak',
                    halign: 'left'
                },
                headStyles: {
                    fillColor: [25, 118, 210],
                    textColor: 255,
                    fontStyle: 'bold'
                },
                columnStyles: {
                    4: { halign: 'right' }, // % Complete
                    5: { halign: 'right' }, // Budget
                    6: { halign: 'right' }, // Contract Sum
                    7: { halign: 'right' }, // Paid Amount
                    8: { halign: 'right' }  // Absorption %
                },
                margin: { top: 100, left: 40, right: 40 }
            });
            
            // Save the PDF
            doc.save(`absorption-report-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error exporting to PDF:', error);
            alert('Failed to export to PDF. Please try again.');
        } finally {
            setExportingPDF(false);
        }
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const { blob, fileName } = await apiService.reports.downloadAbsorptionReport(filters);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || `absorption-report-${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Failed to export to Excel. Please try again.');
        } finally {
            setExportingExcel(false);
        }
    };

    const handleRefresh = () => {
        fetchData();
    };

    const removeFilter = (filterKey) => {
        setFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[filterKey];
            return newFilters;
        });
    };

    if (isLoading) {
        return (
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '50vh' 
            }}>
                <CircularProgress size={60} />
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

    return (
        <Box sx={{ 
            p: { xs: 2, sm: 3 }, 
            maxWidth: '100%', 
            overflowX: 'hidden',
            background: '#f0f9ff',
            minHeight: '100vh'
        }}>
            {/* Header Section */}
            <Fade in timeout={800}>
                <Box sx={{ mb: 4, textAlign: 'center' }}>
                    <Typography 
                        variant="h4" 
                        component="h1" 
                        sx={{ 
                            fontWeight: 'bold',
                            color: '#1976d2',
                            mb: 1.5,
                            letterSpacing: '0.3px'
                        }}
                    >
                        Absorption Report
                    </Typography>
                    <Typography 
                        variant="subtitle1" 
                        color="text.secondary" 
                        sx={{ 
                            fontWeight: 400,
                            opacity: 0.8,
                            letterSpacing: '0.2px'
                        }}
                    >
                        Project budget absorption and financial performance analysis
                    </Typography>
                </Box>
            </Fade>

            {/* Export Controls */}
            <Slide direction="up" in timeout={1000}>
                <Box sx={{ mb: 3, display: 'flex', gap: 2, justifyContent: 'flex-start' }}>
                    <Button
                        variant="contained"
                        startIcon={exportingPDF ? <CircularProgress size={20} color="inherit" /> : <PdfIcon />}
                        onClick={handleExportPDF}
                        disabled={isLoading || reportData.length === 0 || exportingPDF || exportingExcel}
                        sx={{
                            backgroundColor: '#d32f2f',
                            '&:hover': {
                                backgroundColor: '#b71c1c',
                            },
                            '&:disabled': {
                                backgroundColor: '#ccc',
                                color: '#666'
                            },
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600
                        }}
                    >
                        {exportingPDF ? 'Generating PDF...' : 'Export to PDF'}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={exportingExcel ? <CircularProgress size={20} color="inherit" /> : <ExcelIcon />}
                        onClick={handleExportExcel}
                        disabled={isLoading || reportData.length === 0 || exportingPDF || exportingExcel}
                        sx={{
                            backgroundColor: '#2e7d32',
                            '&:hover': {
                                backgroundColor: '#1b5e20',
                            },
                            '&:disabled': {
                                backgroundColor: '#ccc',
                                color: '#666'
                            },
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600
                        }}
                    >
                        {exportingExcel ? 'Generating Excel...' : 'Export to Excel'}
                    </Button>
                </Box>
            </Slide>

            {/* Active Filters */}
            <Slide direction="up" in timeout={1200}>
                <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {Object.entries(filters).filter(([, value]) => String(value || '').trim() !== '').map(([key, value]) => (
                        <Chip
                            key={key}
                            label={`${key}: ${value}`}
                            onDelete={() => removeFilter(key)}
                            color="primary"
                            variant="outlined"
                            sx={{
                                borderRadius: '16px',
                                fontWeight: 500
                            }}
                        />
                    ))}
                </Box>
            </Slide>

            <Slide direction="up" in timeout={1100}>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={1.5}>
                        <Grid item xs={12} md={3}>
                            <FormControl size="small" fullWidth sx={{ minWidth: 180 }}>
                                <InputLabel>Department</InputLabel>
                                <Select
                                    label="Department"
                                    value={filters.department}
                                    onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
                                >
                                    <MenuItem value="">All</MenuItem>
                                    {departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <FormControl size="small" fullWidth sx={{ minWidth: 160 }}>
                                <InputLabel>Status</InputLabel>
                                <Select
                                    label="Status"
                                    value={filters.status}
                                    onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                                >
                                    <MenuItem value="">All</MenuItem>
                                    <MenuItem value="Not Started">Not Started</MenuItem>
                                    <MenuItem value="Initiated">Initiated</MenuItem>
                                    <MenuItem value="In Progress">In Progress</MenuItem>
                                    <MenuItem value="Completed">Completed</MenuItem>
                                    <MenuItem value="At Risk">At Risk</MenuItem>
                                    <MenuItem value="Delayed">Delayed</MenuItem>
                                    <MenuItem value="Stalled">Stalled</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <TextField size="small" type="date" fullWidth label="Start date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <TextField size="small" type="date" fullWidth label="End date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} md={1.5}>
                            <TextField size="small" type="number" fullWidth label="Min %" value={filters.minAbsorption} onChange={(e) => setFilters((p) => ({ ...p, minAbsorption: e.target.value }))} />
                        </Grid>
                        <Grid item xs={12} md={1.5}>
                            <TextField size="small" type="number" fullWidth label="Max %" value={filters.maxAbsorption} onChange={(e) => setFilters((p) => ({ ...p, maxAbsorption: e.target.value }))} />
                        </Grid>
                        <Grid item xs={12}>
                            <Stack direction="row" spacing={1}>
                                <Button variant="contained" onClick={() => fetchData(filters)} disabled={isLoading}>Apply Filters</Button>
                                <Button variant="outlined" onClick={() => {
                                    const reset = { department: '', status: '', startDate: '', endDate: '', minAbsorption: '', maxAbsorption: '' };
                                    setFilters(reset);
                                    fetchData(reset);
                                }} disabled={isLoading}>Reset</Button>
                            </Stack>
                        </Grid>
                    </Grid>
                </Paper>
            </Slide>

            {/* Main Report Table */}
            <Slide direction="up" in timeout={1400}>
                <Card sx={{ 
                    borderRadius: '8px',
                    background: '#ffffff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    border: '1px solid #e0e0e0',
                    overflow: 'visible',
                    position: 'relative'
                }}>
                    <TableContainer 
                        component={Paper} 
                        elevation={0} 
                        sx={{ 
                            borderRadius: '8px',
                            maxHeight: '70vh',
                            overflow: 'auto',
                            position: 'relative',
                            '& .MuiTableHead-root': {
                                position: 'sticky',
                                top: 0,
                                zIndex: 10,
                                backgroundColor: '#1976d2'
                            }
                        }}
                    >
                        <Table sx={{ minWidth: 1200 }} stickyHeader>
                            <TableHead>
                                <TableRow sx={{ 
                                    backgroundColor: '#1976d2',
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 1,
                                    '& .MuiTableCell-head': {
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '0.875rem',
                                        textTransform: 'none',
                                        letterSpacing: '0.3px',
                                        padding: '12px 8px',
                                        borderBottom: 'none',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 1
                                    }
                                }}>
                                    <TableCell sx={{ 
                                        width: '25%',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            Project
                                            <IconButton size="small" sx={{ color: 'white' }}>
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '10%',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            Ward
                                            <IconButton size="small" sx={{ color: 'white' }}>
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '10%',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            Status
                                            <IconButton size="small" sx={{ color: 'white' }}>
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '10%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        % Comple...
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '15%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Budget
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '15%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Contract Sum
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '15%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Paid Amount
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '10%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Absorption ...
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {reportData.map((row) => (
                                    <TableRow 
                                        key={row.id}
                                        sx={{ 
                                            '&:hover': {
                                                backgroundColor: '#f5f5f5',
                                            },
                                            '&:last-child td': {
                                                borderBottom: 0
                                            },
                                            '& .MuiTableCell-root': {
                                                padding: '12px 8px',
                                                borderBottom: '1px solid #e0e0e0',
                                                fontSize: '0.875rem'
                                            }
                                        }}
                                    >
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <PlayIcon sx={{ color: theme.palette.primary.main, fontSize: '1rem' }} />
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    Dept.: {row.department} ({row.projectCount})
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {row.ward || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {row.status || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {formatPercentage(row.completionPercentage)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {formatCurrency(row.budget)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {formatCurrency(row.contractSum)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {formatCurrency(row.paidAmount)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {formatPercentage(row.absorptionPercentage)}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                
                                {/* Summary Row */}
                                <TableRow sx={{ 
                                    backgroundColor: '#f8f9fa',
                                    '& .MuiTableCell-root': {
                                        fontWeight: 'bold',
                                        borderTop: '2px solid #1976d2',
                                        padding: '16px 8px',
                                        fontSize: '0.875rem',
                                        borderBottom: 'none'
                                    }
                                }}>
                                    <TableCell colSpan={3}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            Count: {totals.count}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            {formatPercentage(totals.averageCompletion)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            Total: {formatCurrency(totals.totalBudget)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            Total: {formatCurrency(totals.totalContractSum)} ({formatPercentage(totals.totalContractSum / totals.totalBudget * 100)} of Budget)
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            Total: {formatCurrency(totals.totalPaidAmount)} ({formatPercentage(totals.totalPaidAmount / totals.totalContractSum * 100)} of Contract Amt)
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            Absorbed: {formatPercentage(totals.absorbedPercentage)}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Card>
            </Slide>
        </Box>
    );
};

export default AbsorptionReport;
