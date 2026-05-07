// src/components/WardSummaryReport.jsx

import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, CircularProgress, Alert, useTheme } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { tokens } from '../pages/dashboard/theme';

import DonutChart from './charts/DonutChart';
import BarLineChart from './charts/BarLineChart';
import apiService from '../api';
import regionalService from '../api/regionalService';

const wardTableColumns = [
    { field: 'name', headerName: 'Ward Name', minWidth: 150, flex: 1.2 },
    { field: 'subcountyName', headerName: 'Subcounty', minWidth: 150, flex: 1 },
    { field: 'countyName', headerName: 'County', minWidth: 150, flex: 1 },
    { field: 'projectCount', headerName: 'Total Projects', minWidth: 100, type: 'number', flex: 0.8 },
    {
        field: 'totalBudget',
        headerName: 'Total Budget',
        minWidth: 150,
        type: 'number',
        flex: 1,
        valueFormatter: (value) => {
            if (value == null || value === '') {
                return '';
            }
            const num = Number(value);
            if (!Number.isFinite(num)) return '';
            return `KES ${num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    },
    {
        field: 'totalPaid',
        headerName: 'Total Paid',
        minWidth: 150,
        type: 'number',
        flex: 1,
        valueFormatter: (value) => {
            if (value == null || value === '') {
                return '';
            }
            const num = Number(value);
            if (!Number.isFinite(num)) return '';
            return `KES ${num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    },
];

const WardSummaryReport = ({ filters }) => {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // This console log will help us debug if the API call is being triggered
        console.log('Fetching Ward Summary Report with filters:', filters);

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const fetchedData = await apiService.reports.getWardSummaryReport(filters);
                setReportData(Array.isArray(fetchedData) ? fetchedData : []);
            } catch (err) {
                try {
                    const regional = await regionalService.getWardsData(filters);
                    const fallbackRows = Array.isArray(regional?.wards)
                        ? regional.wards.map((row) => ({
                            name: row?.wardName || row?.name || 'Unknown',
                            subcountyName: row?.subcountyName || row?.subCountyName || 'Unknown',
                            countyName: row?.countyName || 'Unknown',
                            projectCount: Number(row?.totalProjects || row?.projectCount || 0),
                            totalBudget: Number(row?.totalBudget || 0),
                            totalPaid: Number(row?.totalPaid || 0),
                          }))
                        : [];
                    setReportData(fallbackRows);
                } catch (fallbackErr) {
                    setError("Failed to load ward summary report data.");
                    console.error('Ward summary fetch failed:', err);
                    console.error('Ward fallback fetch failed:', fallbackErr);
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [filters]);

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="200px">
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading report data...</Typography>
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
    }

    if (reportData.length === 0) {
        return <Alert severity="info" sx={{ mt: 2 }}>No data found for the selected filters.</Alert>;
    }

    // Create a unique ID for each row
    const getRowId = (row) => `${row.name}-${row.subcountyName}-${row.countyName}-${row.projectCount}`;

    const donutChartData = reportData.map(item => ({
        name: item.name,
        value: item.projectCount,
    }));
    
    const barLineChartData = reportData.map(item => ({
        name: item.name,
        budget: parseFloat(item.totalBudget),
        paid: parseFloat(item.totalPaid),
    }));

    return (
        <Box>
            <Grid container spacing={4} justifyContent="center" sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <DonutChart title="# of Projects by Ward" data={donutChartData} />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <BarLineChart title="Budget & Payments by Ward" data={barLineChartData} />
                </Grid>
            </Grid>

            <Box 
                sx={{ 
                    height: 600, 
                    width: '100%', 
                    mt: 4,
                    "& .MuiDataGrid-root": {
                        border: "none",
                    },
                    "& .MuiDataGrid-cell": {
                        borderBottom: "none",
                    },
                    "& .MuiDataGrid-columnHeaders": {
                        backgroundColor: `${colors.blueAccent[700]} !important`,
                        borderBottom: "none",
                    },
                    "& .MuiDataGrid-virtualScroller": {
                        backgroundColor: colors.primary[400],
                    },
                    "& .MuiDataGrid-footerContainer": {
                        borderTop: "none",
                        backgroundColor: `${colors.blueAccent[700]} !important`,
                    },
                }}
            >
                <DataGrid
                    rows={reportData}
                    columns={wardTableColumns}
                    pageSizeOptions={[5, 10, 25]}
                    disableRowSelectionOnClick
                    getRowId={getRowId}
                    initialState={{
                        pagination: {
                            paginationModel: {
                                pageSize: 10,
                            },
                        },
                    }}
                />
            </Box>
        </Box>
    );
};

export default WardSummaryReport;