// src/components/YearlyTrendsReport.jsx

import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, CircularProgress, Alert, useTheme } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { tokens } from '../pages/dashboard/theme';

import BarLineChart from './charts/BarLineChart';
import apiService from '../api';

const yearlyTrendsTableColumns = [
    { field: 'name', headerName: 'Financial Year', minWidth: 150, flex: 1.2 },
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

const YearlyTrendsReport = ({ filters }) => {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const fetchedData = await apiService.reports.getYearlyTrendsReport(filters);
                setReportData(fetchedData);
            } catch (err) {
                setError("Failed to load yearly trends report data.");
                console.error(err);
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

    // Process the data for the chart
    const chartData = reportData.map(item => ({
        name: item.name,
        budget: parseFloat(item.totalBudget),
        paid: parseFloat(item.totalPaid),
    }));

    // Create a unique ID for each row
    const getRowId = (row) => `${row.name}-${row.projectCount}-${row.totalBudget}`;

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>Budget & Payments by Financial Year</Typography>
                <BarLineChart data={chartData} />
            </Box>

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
                    columns={yearlyTrendsTableColumns}
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

export default YearlyTrendsReport;