import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Stack, IconButton, CircularProgress, Tooltip, Paper,Grid,Autocomplete,TextField,
    Card, Chip, Menu, MenuItem, ListItemIcon, ListItemText
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { 
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
    MoreVert as MoreVertIcon, EventNote as EventNoteIcon,
    CalendarToday as CalendarTodayIcon, AttachMoney as AttachMoneyIcon
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../api';
import AddEditLeaveEntitlementModal from './modals/AddEditLeaveEntitlementModal';
import { useTheme } from '@mui/material';
import { tokens } from "../../pages/dashboard/theme";

export default function LeaveEntitlementsSection({ employees, leaveTypes, showNotification, handleOpenDeleteConfirmModal }) {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const isDark = theme.palette.mode === 'dark';
    const { hasPrivilege } = useAuth();

    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [entitlements, setEntitlements] = useState([]);
    const [loading, setLoading] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editedItem, setEditedItem] = useState(null);
    const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);

    const fetchEntitlements = async () => {
        if (!selectedEmployee) return;
        setLoading(true);
        try {
            const data = await apiService.hr.getLeaveEntitlements(selectedEmployee.staffId);
            setEntitlements(data);
        } catch (error) {
            showNotification('Failed to fetch leave entitlements.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntitlements();
    }, [selectedEmployee]);

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

    const columns = [
        { 
            field: 'leaveTypeName', 
            headerName: 'Leave Type', 
            flex: 1, 
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EventNoteIcon fontSize="small" sx={{ color: colors.blueAccent[300] }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: colors.grey[100] }}>
                        {params.value || 'N/A'}
                    </Typography>
                </Box>
            )
        },
        { 
            field: 'year', 
            headerName: 'Year', 
            flex: 1, 
            minWidth: 120,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => (
                <Chip 
                    label={params.value || 'N/A'} 
                    size="small" 
                    sx={{ 
                        fontSize: '0.75rem',
                        backgroundColor: colors.blueAccent[600],
                        color: 'white',
                        fontWeight: 500,
                        height: '24px'
                    }} 
                />
            )
        },
        { 
            field: 'allocatedDays', 
            headerName: 'Days', 
            flex: 0.8, 
            minWidth: 100,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                    <CalendarTodayIcon fontSize="small" sx={{ color: colors.greenAccent[400] }} />
                    <Chip 
                        label={params.value || 0} 
                        size="small" 
                        sx={{ 
                            fontSize: '0.75rem',
                            backgroundColor: colors.greenAccent[600],
                            color: 'white',
                            fontWeight: 600,
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
                        <AttachMoneyIcon sx={{ color: colors.blueAccent[300], fontSize: 28 }} />
                        <Typography 
                            variant="h5" 
                            component="h2" 
                            sx={{ 
                                fontWeight: 'bold',
                                color: colors.grey[100]
                            }}
                        >
                            Leave Entitlements
                        </Typography>
                    </Box>
                </Box>

                <Paper 
                    elevation={0}
                    sx={{ 
                        p: 2, 
                        mb: 3,
                        backgroundColor: isDark ? colors.primary[500] : theme.palette.background.paper,
                        borderRadius: '6px',
                        border: `1px solid ${isDark ? colors.grey[700] : theme.palette.divider}`,
                    }}
                >
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={8}>
                            <Autocomplete
                                options={employees || []}
                                getOptionLabel={(option) => `${option.firstName} ${option.lastName} (${option.staffId})`}
                                value={selectedEmployee}
                                onChange={(event, newValue) => setSelectedEmployee(newValue)}
                                renderInput={(params) => (
                                    <TextField 
                                        {...params} 
                                        label="Select Employee to Manage" 
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                backgroundColor: isDark ? colors.primary[400] : theme.palette.common.white,
                                                '& fieldset': {
                                                    borderColor: isDark ? colors.grey[700] : theme.palette.divider,
                                                },
                                            },
                                            '& .MuiInputLabel-root': {
                                                color: isDark ? colors.grey[300] : theme.palette.text.secondary,
                                            },
                                            '& .MuiInputLabel-root.Mui-focused': {
                                                color: isDark ? colors.grey[100] : theme.palette.primary.main,
                                            },
                                        }}
                                    />
                                )}
                                sx={{ minWidth: 300 }}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            {selectedEmployee && hasPrivilege('leave.entitlement.create') && (
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
                                    Add Entitlement
                                </Button>
                            )}
                        </Grid>
                    </Grid>
                </Paper>

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
                    <DataGrid
                        rows={entitlements}
                        columns={columns}
                        getRowId={(row) => row.id}
                        loading={loading}
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
                        {hasPrivilege('leave.entitlement.update') && (
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
                        {hasPrivilege('leave.entitlement.delete') && (
                            <MenuItem onClick={() => {
                                handleOpenDeleteConfirmModal(selectedRow.id, `Entitlement for ${selectedRow.leaveTypeName}`, 'leave.entitlement');
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

            {isModalOpen && (
                <AddEditLeaveEntitlementModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    editedItem={editedItem}
                    currentEmployeeId={selectedEmployee?.staffId}
                    leaveTypes={leaveTypes}
                    showNotification={showNotification}
                    refreshData={fetchEntitlements}
                />
            )}
        </Box>
    );
}
