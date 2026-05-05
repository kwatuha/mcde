import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Stack, IconButton, CircularProgress, Tooltip,
    Card, Chip, Menu, MenuItem, ListItemIcon, ListItemText
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { 
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
    MoreVert as MoreVertIcon, Celebration as CelebrationIcon,
    CalendarToday as CalendarTodayIcon
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../api';
import AddEditPublicHolidayModal from './modals/AddEditPublicHolidayModal';
import { useTheme } from '@mui/material';
import { tokens } from "../../pages/dashboard/theme";

export default function PublicHolidaysSection({ showNotification, handleOpenDeleteConfirmModal, reloadSignal = 0 }) {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const isDark = theme.palette.mode === 'dark';
    const { hasPrivilege } = useAuth();
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editedItem, setEditedItem] = useState(null);
    const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await apiService.hr.getPublicHolidays();
            setHolidays(data);
        } catch (error) {
            showNotification('Failed to fetch public holidays.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (reloadSignal > 0) {
            fetchData();
        }
    }, [reloadSignal]);

    const handleOpenAddModal = () => {
        setEditedItem(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (item) => {
        setEditedItem(item);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditedItem(null);
    };

    // Date formatting helper
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
        } catch (e) {
            return 'N/A';
        }
    };

    const columns = [
        { 
            field: 'holidayName', 
            headerName: 'Holiday Name', 
            flex: 1, 
            minWidth: 250,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CelebrationIcon fontSize="small" sx={{ color: colors.blueAccent[300] }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: colors.grey[100] }}>
                        {params.value || 'N/A'}
                    </Typography>
                </Box>
            )
        },
        { 
            field: 'holidayDate', 
            headerName: 'Date', 
            flex: 1, 
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CalendarTodayIcon fontSize="small" sx={{ color: colors.greenAccent[400] }} />
                    <Chip 
                        label={formatDate(params.row?.holidayDate)} 
                        size="small" 
                        sx={{ 
                            fontSize: '0.75rem',
                            backgroundColor: colors.greenAccent[600],
                            color: 'white',
                            fontWeight: 500,
                            height: '24px'
                        }} 
                    />
                </Box>
            )
        },
        {
            field: 'actions',
            headerName: 'Actions',
            sortable: false,
            filterable: false,
            align: 'center',
            headerAlign: 'center',
            width: 60,
            minWidth: 60,
            renderCell: (params) => (
                <Tooltip title="Actions">
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            setSelectedRow(params.row);
                            setRowActionMenuAnchor(e.currentTarget);
                        }}
                        sx={{ color: colors.blueAccent[300] }}
                    >
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            ),
            renderHeader: () => (
                <Tooltip title="Actions">
                    <IconButton
                        size="small"
                        sx={{ 
                            color: 'inherit',
                            padding: '4px',
                            '&:hover': {
                                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                            }
                        }}
                    >
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            ),
        },
    ];
    return (
        <Box>
            <Card 
                sx={{ 
                    p: 2, 
                    backgroundColor: colors.primary[400],
                    borderRadius: '8px',
                    boxShadow: theme.palette.mode === 'dark' ? '0 4px 6px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CelebrationIcon sx={{ color: colors.blueAccent[300], fontSize: 28 }} />
                        <Typography 
                            variant="h5" 
                            component="h2" 
                            sx={{ 
                                fontWeight: 'bold',
                                color: colors.grey[100]
                            }}
                        >
                            Public Holidays
                        </Typography>
                    </Box>
                    {hasPrivilege('holiday.create') && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleOpenAddModal}
                            sx={{ 
                                backgroundColor: colors.blueAccent[500],
                                '&:hover': {
                                    backgroundColor: colors.blueAccent[600],
                                },
                                fontWeight: 600,
                                textTransform: 'none',
                                borderRadius: '6px',
                                px: 2
                            }}
                        >
                            Add Holiday
                        </Button>
                    )}
                </Box>

                <Box
                    height="75vh"
                    sx={{
                        "& .MuiDataGrid-root": {
                            border: "none",
                        },
                        "& .MuiDataGrid-cell": {
                            borderBottom: `1px solid ${colors.grey[700]}`,
                            py: 1,
                        },
                        "& .MuiDataGrid-columnHeaders": {
                            backgroundColor: `${colors.blueAccent[700]} !important`,
                            borderBottom: "none",
                            fontSize: '0.85rem',
                            fontWeight: 600,
                        },
                        "& .MuiDataGrid-virtualScroller": {
                            backgroundColor: colors.primary[400],
                        },
                        "& .MuiDataGrid-footerContainer": {
                            borderTop: "none",
                            backgroundColor: `${colors.blueAccent[700]} !important`,
                        },
                        "& .MuiDataGrid-row:hover": {
                            backgroundColor: isDark
                                ? `${colors.primary[500]} !important`
                                : `${theme.palette.action.hover} !important`,
                        },
                        "& .MuiCheckbox-root": {
                            color: `${colors.greenAccent[200]} !important`,
                        },
                    }}
                >
                    {loading ? (
                        <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                            <CircularProgress sx={{ color: colors.blueAccent[300] }} />
                        </Box>
                    ) : (
                        <DataGrid
                            rows={holidays}
                            columns={columns}
                            getRowId={(row) => row.id}
                            pageSizeOptions={[10, 25, 50, 100]}
                            initialState={{
                                pagination: {
                                    paginationModel: { pageSize: 25 },
                                },
                            }}
                            sx={{
                                '& .MuiDataGrid-cell': {
                                    fontSize: '0.85rem',
                                },
                            }}
                        />
                    )}
                </Box>
            </Card>

            {/* Row Action Menu */}
            <Menu
                anchorEl={rowActionMenuAnchor}
                open={Boolean(rowActionMenuAnchor)}
                onClose={() => {
                    setRowActionMenuAnchor(null);
                    setSelectedRow(null);
                }}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                {selectedRow && (
                    <>
                        {hasPrivilege('holiday.update') && (
                            <MenuItem onClick={() => {
                                handleOpenEditModal(selectedRow);
                                setRowActionMenuAnchor(null);
                                setSelectedRow(null);
                            }}>
                                <ListItemIcon>
                                    <EditIcon fontSize="small" color="primary" />
                                </ListItemIcon>
                                <ListItemText>Edit</ListItemText>
                            </MenuItem>
                        )}
                        {hasPrivilege('holiday.delete') && (
                            <MenuItem onClick={() => {
                                handleOpenDeleteConfirmModal(selectedRow.id, selectedRow.holidayName, 'holiday');
                                setRowActionMenuAnchor(null);
                                setSelectedRow(null);
                            }}>
                                <ListItemIcon>
                                    <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
                                </ListItemIcon>
                                <ListItemText>Delete</ListItemText>
                            </MenuItem>
                        )}
                    </>
                )}
            </Menu>

            <AddEditPublicHolidayModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                editedItem={editedItem}
                showNotification={showNotification}
                refreshData={fetchData}
            />
        </Box>
    );
}