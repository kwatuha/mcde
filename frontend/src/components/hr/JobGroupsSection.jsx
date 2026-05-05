import React, { useState } from 'react';
import {
    Box, Typography, Button, Stack, IconButton, Tooltip,
    Card, Chip, Menu, MenuItem, ListItemIcon, ListItemText
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { 
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
    MoreVert as MoreVertIcon, Work as WorkIcon,
    AttachMoney as AttachMoneyIcon, Description as DescriptionIcon
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import AddEditJobGroupModal from './modals/AddEditJobGroupModal';
import { useTheme } from '@mui/material';
import { tokens } from "../../pages/dashboard/theme";

export default function JobGroupsSection({ jobGroups, showNotification, refreshData, handleOpenDeleteConfirmModal }) {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const isDark = theme.palette.mode === 'dark';
    const { hasPrivilege } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editedItem, setEditedItem] = useState(null);
    const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);

    const handleOpenAddModal = () => {
        if (!hasPrivilege('job_group.create')) {
            showNotification('Permission denied.', 'error');
            return;
        }
        setEditedItem(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (item) => {
        if (!hasPrivilege('job_group.update')) {
            showNotification('Permission denied.', 'error');
            return;
        }
        setEditedItem(item);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditedItem(null);
    };

    const columns = [
        { 
            field: 'groupName', 
            headerName: 'Group Name', 
            flex: 1, 
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WorkIcon fontSize="small" sx={{ color: colors.blueAccent[300] }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: colors.grey[100] }}>
                        {params.value || 'N/A'}
                    </Typography>
                </Box>
            )
        },
        { 
            field: 'salaryScale', 
            headerName: 'Salary Scale', 
            flex: 1, 
            minWidth: 140,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AttachMoneyIcon fontSize="small" sx={{ color: colors.greenAccent[400] }} />
                    <Chip 
                        label={params.value || 'N/A'} 
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
            field: 'description', 
            headerName: 'Description', 
            flex: 2, 
            minWidth: 250,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DescriptionIcon fontSize="small" sx={{ color: colors.grey[400] }} />
                    <Typography 
                        variant="body2" 
                        sx={{ 
                            fontSize: '0.85rem',
                            color: colors.grey[300],
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                        }}
                        title={params.value}
                    >
                        {params.value || 'N/A'}
                    </Typography>
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
                        <WorkIcon sx={{ color: colors.blueAccent[300], fontSize: 28 }} />
                        <Typography 
                            variant="h5" 
                            component="h2" 
                            sx={{ 
                                fontWeight: 'bold',
                                color: colors.grey[100]
                            }}
                        >
                            Job Groups
                        </Typography>
                    </Box>
                    {hasPrivilege('job_group.create') && (
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
                            Add Job Group
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
                        rows={jobGroups}
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
                        {hasPrivilege('job_group.update') && (
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
                        {hasPrivilege('job_group.delete') && (
                            <MenuItem onClick={() => {
                                handleOpenDeleteConfirmModal(selectedRow.id, selectedRow.groupName, 'job_group');
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

            <AddEditJobGroupModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                editedItem={editedItem}
                showNotification={showNotification}
                refreshData={refreshData}
            />
        </Box>
    );
}
