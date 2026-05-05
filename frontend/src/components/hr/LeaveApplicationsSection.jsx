import React, { useState } from 'react';
import {
    Box, Typography, Button, Stack, IconButton, Tooltip,
    Card, Chip, Menu, MenuItem, ListItemIcon, ListItemText, Divider
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { 
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, 
    Visibility as VisibilityIcon, MoreVert as MoreVertIcon,
    CheckCircle as CheckCircleIcon, Cancel as CancelIcon,
    AssignmentReturn as AssignmentReturnIcon,
    Event as EventIcon, Person as PersonIcon, CalendarToday as CalendarTodayIcon
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import AddEditLeaveApplicationModal from './modals/AddEditLeaveApplicationModal';
import { useTheme } from '@mui/material';
import { tokens } from "../../pages/dashboard/theme";

export default function LeaveApplicationsSection({
    leaveApplications,
    employees,
    leaveTypes,
    handleUpdateLeaveStatus,
    setSelectedApplication,
    setIsApprovalModalOpen,
    setIsReturnModalOpen,
    setApprovedDates,
    setActualReturnDate,
    handleOpenDeleteConfirmModal,
    showNotification,
    refreshData
}) {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const isDark = theme.palette.mode === 'dark';
    const { hasPrivilege } = useAuth();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [editedItem, setEditedItem] = useState(null);
    const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);

    const handleOpenAddModal = () => {
        if (!hasPrivilege('leave.apply')) {
            showNotification('Permission denied.', 'error');
            return;
        }
        setEditedItem(null);
        setIsAddModalOpen(true);
    };

    const handleOpenEditModal = (item) => {
        if (!hasPrivilege('leave.update')) {
            showNotification('Permission denied.', 'error');
            return;
        }
        setEditedItem(item);
        setIsEditModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setIsEditModalOpen(false);
        setIsViewModalOpen(false);
        setEditedItem(null);
    };

    const handleOpenViewModal = (item) => {
        setEditedItem(item);
        setIsViewModalOpen(true);
    };

    const showApprovalModal = (app) => {
        setSelectedApplication(app);
        setIsApprovalModalOpen(true);
        setApprovedDates({ startDate: app.startDate, endDate: app.endDate });
    };

    const showReturnModal = (app) => {
        setSelectedApplication(app);
        setIsReturnModalOpen(true);
        setActualReturnDate('');
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

    const formatDateRange = (startDate, endDate) => {
        if (!startDate || !endDate) return 'N/A';
        return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    };

    const columns = [
        { 
            field: 'employeeName', 
            headerName: 'Employee', 
            flex: 1, 
            minWidth: 140,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon fontSize="small" sx={{ color: colors.blueAccent[300] }} />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {params?.row?.firstName && params?.row?.lastName 
                            ? `${params.row.firstName} ${params.row.lastName}` 
                            : 'N/A'}
                    </Typography>
                </Box>
            )
        },
        { 
            field: 'leaveTypeName', 
            headerName: 'Leave Type', 
            flex: 1, 
            minWidth: 120,
            renderCell: (params) => (
                <Chip 
                    label={params.value || 'N/A'} 
                    size="small" 
                    sx={{ 
                        fontSize: '0.75rem',
                        backgroundColor: colors.blueAccent[600],
                        color: 'white',
                        fontWeight: 500
                    }} 
                />
            )
        },
        { 
            field: 'requestedDates', 
            headerName: 'Requested Dates', 
            flex: 1, 
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CalendarTodayIcon fontSize="small" sx={{ color: colors.grey[400] }} />
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {formatDateRange(params?.row?.startDate, params?.row?.endDate)}
                    </Typography>
                </Box>
            )
        },
        { 
            field: 'numberOfDays', 
            headerName: 'Days', 
            flex: 0.8, 
            minWidth: 80,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => (
                <Chip 
                    label={params.value || 0} 
                    size="small" 
                    sx={{ 
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: colors.greenAccent[600],
                        color: 'white'
                    }} 
                />
            )
        },
        { 
            field: 'approvedDates', 
            headerName: 'Approved Dates', 
            flex: 1, 
            minWidth: 180,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[400] }}>
                    {params?.row?.approvedStartDate 
                        ? formatDateRange(params.row.approvedStartDate, params.row.approvedEndDate)
                        : 'N/A'}
                </Typography>
            )
        },
        { 
            field: 'actualReturnDate', 
            headerName: 'Return Date', 
            flex: 1, 
            minWidth: 120,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {params?.row?.actualReturnDate ? formatDate(params.row.actualReturnDate) : 'N/A'}
                </Typography>
            )
        },
        { 
            field: 'handoverName', 
            headerName: 'Handover', 
            flex: 1, 
            minWidth: 130,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {params?.row?.handoverFirstName && params?.row?.handoverLastName
                        ? `${params.row.handoverFirstName} ${params.row.handoverLastName}`
                        : 'N/A'}
                </Typography>
            )
        },
        {
            field: 'status',
            headerName: 'Status',
            flex: 1,
            minWidth: 120,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                const status = params.value;
                const statusConfig = {
                    'Pending': { color: 'warning', icon: <EventIcon fontSize="small" /> },
                    'Approved': { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
                    'Completed': { color: 'primary', icon: <CheckCircleIcon fontSize="small" /> },
                    'Rejected': { color: 'error', icon: <CancelIcon fontSize="small" /> }
                };
                const config = statusConfig[status] || { color: 'default', icon: null };
                
                return (
                    <Chip
                        icon={config.icon}
                        label={status}
                        size="small"
                        color={config.color}
                        sx={{
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            height: '24px'
                        }}
                    />
                );
            },
        },
        {
            field: 'actions',
            headerName: 'Actions',
            sortable: false,
            filterable: false,
            align: 'center',
            headerAlign: 'center',
            width: 100,
            minWidth: 100,
            renderCell: (params) => (
                <Stack direction="row" spacing={0} alignItems="center" justifyContent="center">
                    {hasPrivilege('leave.read_all') && (
                        <Tooltip title="View details">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenViewModal(params.row);
                                }}
                                sx={{ color: colors.blueAccent[300] }}
                            >
                                <VisibilityIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title="More actions">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRow(params.row);
                                setRowActionMenuAnchor(e.currentTarget);
                            }}
                            sx={{ color: colors.blueAccent[300] }}
                        >
                            <MoreVertIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            ),
            renderHeader: () => (
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Actions
                </Typography>
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
                        <EventIcon sx={{ color: colors.blueAccent[300], fontSize: 28 }} />
                        <Typography 
                            variant="h5" 
                            component="h2" 
                            sx={{ 
                                fontWeight: 'bold',
                                color: colors.grey[100]
                            }}
                        >
                            Leave Applications
                        </Typography>
                    </Box>
                    {hasPrivilege('leave.apply') && (
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
                            Apply for Leave
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
                    <DataGrid
                        rows={leaveApplications}
                        columns={columns}
                        getRowId={(row) => row.id}
                        loading={false}
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
                        {hasPrivilege('leave.read_all') && (
                            <>
                                <MenuItem onClick={() => {
                                    handleOpenViewModal(selectedRow);
                                    setRowActionMenuAnchor(null);
                                    setSelectedRow(null);
                                }}>
                                    <ListItemIcon>
                                        <VisibilityIcon fontSize="small" color="info" />
                                    </ListItemIcon>
                                    <ListItemText>View details</ListItemText>
                                </MenuItem>
                                {(
                                    (selectedRow.status === 'Pending' && hasPrivilege('leave.approve')) ||
                                    (selectedRow.status === 'Pending' && hasPrivilege('leave.update')) ||
                                    (selectedRow.status === 'Approved' &&
                                        !selectedRow.actualReturnDate &&
                                        hasPrivilege('leave.complete')) ||
                                    ((selectedRow.status === 'Pending' || selectedRow.status === 'Rejected') &&
                                        hasPrivilege('leave.delete'))
                                ) ? (
                                    <Divider sx={{ my: 0.5 }} />
                                ) : null}
                            </>
                        )}
                        {selectedRow.status === 'Pending' && hasPrivilege('leave.approve') && (
                            <>
                                <MenuItem onClick={() => {
                                    showApprovalModal(selectedRow);
                                    setRowActionMenuAnchor(null);
                                    setSelectedRow(null);
                                }}>
                                    <ListItemIcon>
                                        <CheckCircleIcon fontSize="small" color="success" />
                                    </ListItemIcon>
                                    <ListItemText>Approve</ListItemText>
                                </MenuItem>
                                <MenuItem onClick={() => {
                                    handleUpdateLeaveStatus('Rejected', selectedRow);
                                    setRowActionMenuAnchor(null);
                                    setSelectedRow(null);
                                }}>
                                    <ListItemIcon>
                                        <CancelIcon fontSize="small" color="error" />
                                    </ListItemIcon>
                                    <ListItemText>Reject</ListItemText>
                                </MenuItem>
                            </>
                        )}
                        {selectedRow.status === 'Approved' && !selectedRow.actualReturnDate && hasPrivilege('leave.complete') && (
                            <MenuItem onClick={() => {
                                showReturnModal(selectedRow);
                                setRowActionMenuAnchor(null);
                                setSelectedRow(null);
                            }}>
                                <ListItemIcon>
                                    <AssignmentReturnIcon fontSize="small" color="primary" />
                                </ListItemIcon>
                                <ListItemText>Record Return</ListItemText>
                            </MenuItem>
                        )}
                        {selectedRow.status === 'Pending' && hasPrivilege('leave.update') && (
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
                        {(selectedRow.status === 'Pending' || selectedRow.status === 'Rejected') && hasPrivilege('leave.delete') && (
                            <MenuItem onClick={() => {
                                handleOpenDeleteConfirmModal(
                                    selectedRow.id, 
                                    `Leave Application for ${selectedRow.firstName} ${selectedRow.lastName}`, 
                                    'leave.application'
                                );
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

            <AddEditLeaveApplicationModal
                isOpen={isAddModalOpen || isEditModalOpen || isViewModalOpen}
                onClose={handleCloseModal}
                editedItem={editedItem}
                employees={employees}
                leaveTypes={leaveTypes}
                showNotification={showNotification}
                refreshData={refreshData}
                readOnly={isViewModalOpen}
            />
        </Box>
    );
}
