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
    Fade,
    Slide,
    CircularProgress,
    Alert,
    Card,
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
    TableChart as ExcelIcon
} from '@mui/icons-material';
import apiService from '../api';
import { formatCurrency } from '../utils/helpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';
import * as XLSX from 'xlsx';

const AbsorptionReport = () => {
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
        return `${Number(value || 0).toFixed(1)}%`;
    };

    const handleExportPDF = async () => {
        setExportingPDF(true);
        try {
            const doc = new jsPDF('landscape', 'pt', 'a4');
            const logoDataUrl = await getCountyLogoDataUrl();
            let y = drawCountyOfficialHeader(doc, {
                unit: 'pt',
                logoDataUrl,
                title: 'Absorption Report',
                departmentName: filters.department || '',
            });

            const activeFilters = Object.entries(filters)
                .filter(([, value]) => String(value || '').trim() !== '')
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            doc.setFontSize(9);
            doc.text(`Generated: ${new Date().toLocaleString()} | Filters: ${activeFilters || 'All scoped records'}`, 40, y);
            y += 16;

            const headers = [
                'Department',
                'Sub-county',
                'Status',
                'Projects',
                '% Complete',
                'Budget',
                'Contract Sum',
                'Paid Amount',
                'Absorption %'
            ];
            
            const data = reportData.map(row => [
                row.department || 'Unassigned',
                row.subCounty || 'Countywide/Unassigned',
                row.status || 'Unspecified',
                String(row.projectCount || 0),
                `${Number(row.completionPercentage || 0).toFixed(1)}%`,
                formatCurrency(row.budget),
                formatCurrency(row.contractSum),
                formatCurrency(row.paidAmount),
                `${Number(row.absorptionPercentage || 0).toFixed(1)}%`
            ]);
            
            // Add summary row
            data.push([
                'TOTAL',
                '',
                '',
                String(totals.count || 0),
                `${Number(totals.averageCompletion || 0).toFixed(1)}%`,
                formatCurrency(totals.totalBudget),
                formatCurrency(totals.totalContractSum),
                formatCurrency(totals.totalPaidAmount),
                `${Number(totals.absorbedPercentage || 0).toFixed(1)}%`
            ]);
            
            // Create table
            autoTable(doc, {
                head: [headers],
                body: data,
                startY: y,
                styles: {
                    fontSize: 7,
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
                    3: { halign: 'right' },
                    4: { halign: 'right' },
                    5: { halign: 'right' },
                    6: { halign: 'right' },
                    7: { halign: 'right' },
                    8: { halign: 'right' }
                },
                margin: { top: 40, left: 40, right: 40 }
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
            const activeFilters = Object.entries(filters)
                .filter(([, value]) => String(value || '').trim() !== '')
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            const rows = [
                ['Absorption Report'],
                [`Generated: ${new Date().toLocaleString()}`],
                [`Filters: ${activeFilters || 'All scoped records'}`],
                [],
                ['Department', 'Sub-county', 'Status', 'Projects', '% Complete', 'Budget', 'Contract Sum', 'Paid Amount', 'Absorption %'],
                ...reportData.map((row) => [
                    row.department || 'Unassigned',
                    row.subCounty || 'Countywide/Unassigned',
                    row.status || 'Unspecified',
                    Number(row.projectCount || 0),
                    Number(row.completionPercentage || 0),
                    Number(row.budget || 0),
                    Number(row.contractSum || 0),
                    Number(row.paidAmount || 0),
                    Number(row.absorptionPercentage || 0),
                ]),
                [
                    'TOTAL',
                    '',
                    '',
                    Number(totals.count || 0),
                    Number(totals.averageCompletion || 0),
                    Number(totals.totalBudget || 0),
                    Number(totals.totalContractSum || 0),
                    Number(totals.totalPaidAmount || 0),
                    Number(totals.absorbedPercentage || 0),
                ],
            ];
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 34 },
                { wch: 22 },
                { wch: 18 },
                { wch: 10 },
                { wch: 12 },
                { wch: 16 },
                { wch: 16 },
                { wch: 16 },
                { wch: 14 },
            ];
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Absorption Report');
            XLSX.writeFile(workbook, `absorption-report-${new Date().toISOString().split('T')[0]}.xlsx`);
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
            {/* Header and filters */}
            <Fade in timeout={800}>
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 2.25, md: 3 },
                        mb: 3,
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: '#ffffff',
                        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
                    }}
                >
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'stretch', md: 'flex-start' }}
                        spacing={2.5}
                        sx={{ mb: 2.5 }}
                    >
                        <Box sx={{ flex: 1, minWidth: 0, pr: { md: 2 } }}>
                            <Typography
                                variant="h5"
                                component="h1"
                                sx={{
                                    fontWeight: 800,
                                    color: '#1976d2',
                                    mb: 0.5,
                                    letterSpacing: '0.2px',
                                }}
                            >
                                Absorption Report
                            </Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ maxWidth: 760, lineHeight: 1.6 }}
                            >
                                Project budget absorption and financial performance analysis.
                            </Typography>
                        </Box>
                        <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            flexWrap={{ xs: 'wrap', md: 'nowrap' }}
                            justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
                            sx={{ flexShrink: 0, minWidth: { md: 300 } }}
                        >
                            <Button
                                variant="contained"
                                startIcon={exportingPDF ? <CircularProgress size={20} color="inherit" /> : <PdfIcon />}
                                onClick={handleExportPDF}
                                disabled={isLoading || reportData.length === 0 || exportingPDF || exportingExcel}
                                sx={{
                                    backgroundColor: '#d32f2f',
                                    '&:hover': { backgroundColor: '#b71c1c' },
                                    '&:disabled': { backgroundColor: '#ccc', color: '#666' },
                                    borderRadius: '8px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    minWidth: 132,
                                }}
                            >
                                {exportingPDF ? 'Generating...' : 'PDF'}
                            </Button>
                            <Button
                                variant="contained"
                                startIcon={exportingExcel ? <CircularProgress size={20} color="inherit" /> : <ExcelIcon />}
                                onClick={handleExportExcel}
                                disabled={isLoading || reportData.length === 0 || exportingPDF || exportingExcel}
                                sx={{
                                    backgroundColor: '#2e7d32',
                                    '&:hover': { backgroundColor: '#1b5e20' },
                                    '&:disabled': { backgroundColor: '#ccc', color: '#666' },
                                    borderRadius: '8px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    minWidth: 132,
                                }}
                            >
                                {exportingExcel ? 'Generating...' : 'Excel'}
                            </Button>
                        </Stack>
                    </Stack>

                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6} md={4} lg={3}>
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
                        <Grid item xs={12} sm={6} md={3} lg={2}>
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
                        <Grid item xs={12} sm={6} md={3} lg={2}>
                            <TextField size="small" type="date" fullWidth label="Start date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3} lg={2}>
                            <TextField size="small" type="date" fullWidth label="End date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3} lg={1.5}>
                            <TextField size="small" type="number" fullWidth label="Min %" value={filters.minAbsorption} onChange={(e) => setFilters((p) => ({ ...p, minAbsorption: e.target.value }))} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3} lg={1.5}>
                            <TextField size="small" type="number" fullWidth label="Max %" value={filters.maxAbsorption} onChange={(e) => setFilters((p) => ({ ...p, maxAbsorption: e.target.value }))} />
                        </Grid>
                        <Grid item xs={12}>
                            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Button variant="contained" onClick={() => fetchData(filters)} disabled={isLoading} sx={{ minWidth: 132 }}>Apply filters</Button>
                                <Button variant="outlined" onClick={() => {
                                    const reset = { department: '', status: '', startDate: '', endDate: '', minAbsorption: '', maxAbsorption: '' };
                                    setFilters(reset);
                                    fetchData(reset);
                                }} disabled={isLoading}>Reset</Button>
                            </Stack>
                        </Grid>
                    </Grid>

                    {Object.entries(filters).some(([, value]) => String(value || '').trim() !== '') && (
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                            {Object.entries(filters).filter(([, value]) => String(value || '').trim() !== '').map(([key, value]) => (
                                <Chip
                                    key={key}
                                    label={`${key}: ${value}`}
                                    onDelete={() => removeFilter(key)}
                                    color="primary"
                                    variant="outlined"
                                    sx={{ borderRadius: '16px', fontWeight: 500 }}
                                />
                            ))}
                        </Stack>
                    )}
                </Paper>
            </Fade>

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
                        <Table sx={{ minWidth: 1150 }} stickyHeader>
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
                                    <TableCell sx={{ width: '22%', backgroundColor: '#1976d2', position: 'sticky', top: 0, zIndex: 2 }}>
                                        Department
                                    </TableCell>
                                    <TableCell sx={{ width: '14%', backgroundColor: '#1976d2', position: 'sticky', top: 0, zIndex: 2 }}>
                                        Sub-county
                                    </TableCell>
                                    <TableCell sx={{ width: '12%', backgroundColor: '#1976d2', position: 'sticky', top: 0, zIndex: 2 }}>
                                        Status
                                    </TableCell>
                                    <TableCell sx={{ width: '8%', textAlign: 'right', backgroundColor: '#1976d2', position: 'sticky', top: 0, zIndex: 2 }}>
                                        Projects
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '9%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        % Complete
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '12%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Budget
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '12%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Contract Sum
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '12%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Paid Amount
                                    </TableCell>
                                    <TableCell sx={{ 
                                        width: '9%', 
                                        textAlign: 'right',
                                        backgroundColor: '#1976d2',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2
                                    }}>
                                        Absorption %
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
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                {row.department || 'Unassigned'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {row.subCounty || 'Countywide/Unassigned'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {row.status || 'Unspecified'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {row.projectCount || 0}
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
                                            TOTAL
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                            {totals.count}
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
