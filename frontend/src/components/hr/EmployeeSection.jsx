import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, Stack, IconButton, CircularProgress, Tooltip, Chip, Card, Menu, MenuItem, ListItemIcon, ListItemText
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as VisibilityIcon, FileDownload as FileDownloadIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../api';
import { useTheme } from '@mui/material';
import { tokens } from "../../pages/dashboard/theme";

export default function EmployeeSection({
    employees,
    handleOpenDeleteConfirmModal,
    fetchEmployee360View,
    showNotification,
    refreshData,
    handleOpenAddEmployeeModal,
    handleOpenEditEmployeeModal
}) {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const { hasPrivilege } = useAuth();
    
    // Export loading states
    const [exportingExcel, setExportingExcel] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    
    // Context menu state
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const dataGridRef = useRef(null);
    
    // Debug: Log employees data structure
    React.useEffect(() => {
        if (employees && employees.length > 0) {
            const firstEmp = employees[0];
            console.log('=== EmployeeSection: DEBUG DATA STRUCTURE ===');
            console.log('Total employees:', employees.length);
            console.log('First employee object:', firstEmp);
            console.log('All keys in first employee:', Object.keys(firstEmp));
            console.log('Sample values:', {
                staffId: firstEmp.staffId,
                firstName: firstEmp.firstName,
                lastName: firstEmp.lastName,
                email: firstEmp.email,
                phoneNumber: firstEmp.phoneNumber,
                department: firstEmp.department,
                title: firstEmp.title,
                employmentType: firstEmp.employmentType,
                startDate: firstEmp.startDate,
                employmentStatus: firstEmp.employmentStatus,
            });
            console.log('=== END DEBUG ===');
        } else {
            console.warn('EmployeeSection: No employees data received', employees);
        }
    }, [employees]);

    // Define columns for the DataGrid - more compact
    const columns = [
        { 
            field: 'fullName', 
            headerName: 'Name', 
            flex: 1, 
            minWidth: 150,
            renderCell: (params) => {
                const row = params.row || {};
                const firstName = row.firstName || '';
                const lastName = row.lastName || '';
                const fullName = `${firstName} ${lastName}`.trim();
                return (
                    <Typography variant="body2" sx={{ fontWeight: 500, color: colors.grey[100] }}>
                        {fullName || 'N/A'}
                    </Typography>
                );
            }
        },
        { 
            field: 'email', 
            headerName: 'Email', 
            flex: 1, 
            minWidth: 150,
            renderCell: (params) => {
                const email = params.row?.email || 'N/A';
                return (
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[300] }}>
                        {email}
                    </Typography>
                );
            }
        },
        { 
            field: 'phoneNumber', 
            headerName: 'Phone', 
            flex: 0.7, 
            minWidth: 100,
            renderCell: (params) => {
                const phone = params.row?.phoneNumber || 'N/A';
                return (
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[300] }}>
                        {phone}
                    </Typography>
                );
            }
        },
        { 
            field: 'department', 
            headerName: 'Department', 
            flex: 1, 
            minWidth: 120,
            renderCell: (params) => {
                const dept = params.row?.department || 'N/A';
                return (
                    <Chip 
                        label={dept} 
                        size="small" 
                        sx={{ 
                            height: 24,
                            fontSize: '0.75rem',
                            backgroundColor: colors.blueAccent[800],
                            color: colors.grey[100],
                            fontWeight: 500
                        }} 
                    />
                );
            }
        },
        { 
            field: 'jobTitle', 
            headerName: 'Job Title', 
            flex: 1, 
            minWidth: 120,
            renderCell: (params) => {
                const title = params.row?.title || 'N/A';
                return (
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[300] }}>
                        {title}
                    </Typography>
                );
            }
        },
        { 
            field: 'employmentType', 
            headerName: 'Type', 
            flex: 0.6, 
            minWidth: 80,
            renderCell: (params) => {
                const type = params.row?.employmentType || 'N/A';
                return (
                    <Chip 
                        label={type} 
                        size="small" 
                        sx={{ 
                            height: 22,
                            fontSize: '0.7rem',
                            backgroundColor: colors.greenAccent[800],
                            color: colors.grey[100]
                        }} 
                    />
                );
            }
        },
        { 
            field: 'startDate', 
            headerName: 'Start Date', 
            flex: 0.7, 
            minWidth: 100,
            renderCell: (params) => {
                const startDate = params.row?.startDate;
                if (!startDate) {
                    return <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[300] }}>N/A</Typography>;
                }
                try {
                    const dateStr = new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    return (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[300] }}>
                            {dateStr}
                        </Typography>
                    );
                } catch (e) {
                    return <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.grey[300] }}>N/A</Typography>;
                }
            }
        },
        { 
            field: 'employmentStatus', 
            headerName: 'Status', 
            flex: 0.6, 
            minWidth: 80,
            renderCell: (params) => {
                const status = params.row?.employmentStatus || 'N/A';
                const statusColors = {
                    'Active': { bg: colors.greenAccent[700], color: colors.grey[100] },
                    'Inactive': { bg: colors.grey[700], color: colors.grey[100] },
                    'Terminated': { bg: colors.redAccent[700], color: colors.grey[100] },
                    'On Leave': { bg: colors.blueAccent[700], color: colors.grey[100] },
                };
                const colorScheme = statusColors[status] || { bg: colors.grey[700], color: colors.grey[100] };
                return (
                    <Chip 
                        label={status} 
                        size="small" 
                        sx={{ 
                            height: 22,
                            fontSize: '0.7rem',
                            backgroundColor: colorScheme.bg,
                            color: colorScheme.color,
                            fontWeight: 500
                        }} 
                    />
                );
            }
        },
        {
            field: 'actions',
            headerName: 'Actions',
            sortable: false,
            filterable: false,
            align: 'center',
            headerAlign: 'center',
            flex: 0.6,
            minWidth: 100,
            renderCell: (params) => {
                if (!params || !params.row) return null;
                const row = params.row;
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                        {hasPrivilege('employee.read_360') && (
                            <Tooltip title="View Details">
                                <IconButton 
                                    size="small"
                                    sx={{ 
                                        color: colors.blueAccent[300],
                                        '&:hover': { backgroundColor: colors.blueAccent[800] },
                                        padding: '4px'
                                    }}
                                    onClick={() => fetchEmployee360View(row.staffId)}
                                >
                                    <VisibilityIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        {hasPrivilege('employee.update') && (
                            <Tooltip title="Edit">
                                <IconButton 
                                    size="small"
                                    sx={{ 
                                        color: colors.greenAccent[300],
                                        '&:hover': { backgroundColor: colors.greenAccent[800] },
                                        padding: '4px'
                                    }}
                                    onClick={() => handleOpenEditEmployeeModal(row)}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        {hasPrivilege('employee.delete') && (
                            <Tooltip title="Delete">
                                <IconButton 
                                    size="small"
                                    sx={{ 
                                        color: colors.redAccent[300],
                                        '&:hover': { backgroundColor: colors.redAccent[800] },
                                        padding: '4px'
                                    }}
                                    onClick={() => handleOpenDeleteConfirmModal(row.staffId, `${row.firstName || ''} ${row.lastName || ''}`.trim(), 'employee')}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                );
            },
        },
    ];

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const excelHeadersMapping = columns.reduce((acc, col) => {
                // Map DataGrid fields to their header labels for Excel export
                if (col.field !== 'actions' && col.field !== 'jobTitle' && col.field !== 'manager') {
                    acc[col.field] = col.headerName;
                }
                return acc;
            }, {});

            const data = await apiService.hr.exportEmployeesToExcel(excelHeadersMapping);
            const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'employees_export.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showNotification('Employee data exported to Excel.', 'success');
        } catch (err) {
            console.error('Error exporting to Excel:', err);
            showNotification('Failed to export employee data to Excel.', 'error');
        } finally {
            setExportingExcel(false);
        }
    };

    // Context menu handlers
    const handleRowContextMenu = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const rowElement = event.target.closest('.MuiDataGrid-row');
        if (!rowElement) return;
        
        // Get row ID from data-id attribute
        const rowId = rowElement.getAttribute('data-id') || 
                     rowElement.getAttribute('data-row-id') ||
                     rowElement.id?.replace('MuiDataGrid-row-', '');
        
        if (!rowId) return;
        
        // Find the corresponding employee
        const employee = employees.find(emp => {
            const id = emp.staffId?.toString();
            return id === rowId || id === rowId.toString();
        });
        
        if (employee) {
            setContextMenu({
                mouseX: event.clientX + 2,
                mouseY: event.clientY - 6,
            });
            setSelectedEmployee(employee);
        }
    }, [employees]);

    useEffect(() => {
        const gridContainer = dataGridRef.current;
        if (!gridContainer) return;

        const handleContextMenu = (event) => {
            const rowElement = event.target.closest('.MuiDataGrid-row');
            if (rowElement && !event.target.closest('.MuiDataGrid-columnHeader')) {
                handleRowContextMenu(event);
            }
        };

        gridContainer.addEventListener('contextmenu', handleContextMenu);
        return () => {
            gridContainer.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [handleRowContextMenu]);

    const handleContextMenuClose = useCallback(() => {
        setContextMenu(null);
        setSelectedEmployee(null);
    }, []);

    const escapeHtml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return 'N/A';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const handleExportPdf = async () => {
        setExportingPdf(true);
        try {
            const allEmployees = Array.isArray(employees) ? employees : [];
            if (allEmployees.length === 0) {
                showNotification('No employees to export.', 'warning');
                return;
            }

            const tableColumnsForPdf = columns.filter(col => col.field !== 'actions');

            let tableHtml = `
              <style>
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt; }
                th, td { border: 1px solid #EEEEEE; padding: 8px; text-align: left; }
                th { background-color: #ADD8E6; color: #0A2342; font-weight: bold; }
                tr:nth-child(even) { background-color: #F9F9F9; }
              </style>
              <table>
                <thead>
                  <tr>
                    ${tableColumnsForPdf.map(col => `<th>${escapeHtml(col.headerName)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${allEmployees.map(employee => `
                    <tr>
                      ${tableColumnsForPdf.map(col => {
                          let value = 'N/A';
                          if (col.field === 'fullName') {
                              const firstName = employee.firstName || '';
                              const lastName = employee.lastName || '';
                              value = `${firstName} ${lastName}`.trim() || 'N/A';
                          } else if (col.field === 'jobTitle') {
                              value = employee.title || 'N/A';
                          } else if (col.field === 'department') {
                              value = employee.department || 'N/A';
                          } else if (col.field === 'startDate') {
                              if (employee.startDate) {
                                  try {
                                      value = new Date(employee.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                  } catch (e) {
                                      value = 'N/A';
                                  }
                              }
                          } else if (col.field === 'email') {
                              value = employee.email || 'N/A';
                          } else if (col.field === 'phoneNumber') {
                              value = employee.phoneNumber || 'N/A';
                          } else if (col.field === 'employmentType') {
                              value = employee.employmentType || 'N/A';
                          } else if (col.field === 'employmentStatus') {
                              value = employee.employmentStatus || 'N/A';
                          } else {
                              value = employee[col.field] !== null && employee[col.field] !== undefined ? String(employee[col.field]) : 'N/A';
                          }
                          return `<td>${escapeHtml(value)}</td>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;

            const data = await apiService.hr.exportEmployeesToPdf(tableHtml);
            const blob = new Blob([data], { type: 'application/pdf' });
            if (blob.size < 64) {
                const text = await blob.text();
                let msg = 'Server did not return a valid PDF.';
                try {
                    const j = JSON.parse(text);
                    if (j.message) msg = j.message;
                } catch {
                    if (text) msg = text;
                }
                showNotification(msg, 'error');
                return;
            }
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'employees_report.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showNotification('Employee data exported to PDF.', 'success');
        } catch (err) {
            console.error('Error exporting to PDF:', err);
            let detail = err.message;
            const body = err.response?.data;
            if (body instanceof Blob) {
                try {
                    const t = await body.text();
                    try {
                        const j = JSON.parse(t);
                        if (j.message) detail = j.message;
                    } catch {
                        if (t) detail = t;
                    }
                } catch {
                    /* keep err.message */
                }
            } else if (body?.message) {
                detail = body.message;
            } else if (typeof body === 'string') {
                detail = body;
            }
            showNotification(detail || 'Failed to export employee data to PDF.', 'error');
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <Box sx={{ p: 2 }}>
            {/* Compact Header */}
            <Card 
                elevation={0}
                sx={{ 
                    mb: 2, 
                    p: 1.5,
                    backgroundColor: colors.primary[400],
                    borderRadius: 2,
                    border: `1px solid ${colors.blueAccent[700]}`
                }}
            >
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography 
                            variant="h6" 
                            component="h2" 
                            sx={{ 
                                fontWeight: 600,
                                color: colors.grey[100],
                                fontSize: '1.1rem'
                            }}
                        >
                            All Employees
                        </Typography>
                        <Chip 
                            label={`${employees.length} Total`}
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: '0.75rem',
                                backgroundColor: colors.blueAccent[800],
                                color: colors.grey[100],
                                fontWeight: 500
                            }}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        {hasPrivilege('employee.create') && (
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => handleOpenAddEmployeeModal()}
                                sx={{ 
                                    minWidth: 'auto',
                                    px: 1.5,
                                    py: 0.75,
                                    fontSize: '0.8rem',
                                    backgroundColor: colors.greenAccent[600],
                                    '&:hover': { backgroundColor: colors.greenAccent[700] }
                                }}
                            >
                                Add Employee
                            </Button>
                        )}
                        <Tooltip title="Export to Excel">
                            <IconButton
                                size="small"
                                onClick={handleExportExcel}
                                disabled={employees.length === 0 || exportingExcel}
                                sx={{
                                    color: colors.greenAccent[300],
                                    backgroundColor: colors.greenAccent[800],
                                    '&:hover': { backgroundColor: colors.greenAccent[700] },
                                    '&:disabled': { opacity: 0.5 }
                                }}
                            >
                                {exportingExcel ? <CircularProgress size={18} color="inherit" /> : <FileDownloadIcon fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Export to PDF">
                            <IconButton
                                size="small"
                                onClick={handleExportPdf}
                                disabled={employees.length === 0 || exportingPdf}
                                sx={{
                                    color: colors.redAccent[300],
                                    backgroundColor: colors.redAccent[800],
                                    '&:hover': { backgroundColor: colors.redAccent[700] },
                                    '&:disabled': { opacity: 0.5 }
                                }}
                            >
                                {exportingPdf ? <CircularProgress size={18} color="inherit" /> : <PictureAsPdfIcon fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Stack>
            </Card>


            {/* Compact DataGrid */}
            <Card 
                elevation={0}
                sx={{
                    backgroundColor: colors.primary[400],
                    borderRadius: 2,
                    border: `1px solid ${colors.blueAccent[700]}`,
                    overflow: 'hidden'
                }}
            >
                <Box
                    ref={dataGridRef}
                    sx={{
                        height: 'calc(100vh - 280px)',
                        minHeight: 500,
                        "& .MuiDataGrid-root": {
                            border: "none",
                            fontSize: '0.875rem',
                        },
                        "& .MuiDataGrid-cell": {
                            borderBottom: `1px solid ${colors.blueAccent[700]}`,
                            padding: '6px 8px',
                        },
                        "& .MuiDataGrid-row": {
                            minHeight: '48px !important',
                            maxHeight: '48px !important',
                            '&:hover': {
                                backgroundColor: `${colors.blueAccent[800]} !important`,
                                cursor: 'pointer'
                            },
                            '&.Mui-selected': {
                                backgroundColor: `${colors.blueAccent[900]} !important`,
                                '&:hover': {
                                    backgroundColor: `${colors.blueAccent[800]} !important`,
                                }
                            }
                        },
                        "& .MuiDataGrid-columnHeaders": {
                            backgroundColor: `${colors.blueAccent[800]} !important`,
                            borderBottom: `2px solid ${colors.blueAccent[700]}`,
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: colors.grey[100],
                            minHeight: '42px !important',
                            maxHeight: '42px !important',
                            '& .MuiDataGrid-columnHeaderTitle': {
                                fontWeight: 600,
                                fontSize: '0.8rem'
                            }
                        },
                        "& .MuiDataGrid-virtualScroller": {
                            backgroundColor: colors.primary[400],
                        },
                        "& .MuiDataGrid-footerContainer": {
                            borderTop: `1px solid ${colors.blueAccent[700]}`,
                            backgroundColor: `${colors.blueAccent[800]} !important`,
                            minHeight: '48px !important',
                            maxHeight: '48px !important',
                        },
                        "& .MuiCheckbox-root": {
                            color: `${colors.greenAccent[300]} !important`,
                        },
                        "& .MuiDataGrid-iconButtonContainer": {
                            visibility: 'visible',
                            color: colors.grey[100]
                        },
                        "& .MuiDataGrid-sortIcon": {
                            color: colors.grey[100]
                        },
                        "& .MuiDataGrid-menuIcon": {
                            color: colors.grey[100]
                        },
                    }}
                >
                    <DataGrid
                        rows={employees || []}
                        columns={columns}
                        getRowId={(row) => {
                            const id = row?.staffId ?? row?.staff_id ?? row?.id;
                            if (id == null || id === '') {
                                console.warn('EmployeeSection: Row missing staff id', row);
                                return ['missing', row.email, row.firstName, row.lastName].filter(Boolean).join('-') || 'missing-row';
                            }
                            return id;
                        }}
                        loading={false}
                        onRowClick={(params) => {
                            console.log('EmployeeSection: Row clicked:', params.row);
                        }}
                        disableRowSelectionOnClick={false}
                        pageSizeOptions={[10, 25, 50, 100]}
                        initialState={{
                            pagination: {
                                paginationModel: { pageSize: 25 }
                            }
                        }}
                        sx={{
                            '& .MuiDataGrid-cell:focus': {
                                outline: 'none',
                            },
                            '& .MuiDataGrid-cell:focus-within': {
                                outline: 'none',
                            },
                        }}
                    />
                </Box>
            </Card>

            {/* Context Menu for Row Actions */}
            <Menu
                open={contextMenu !== null}
                onClose={handleContextMenuClose}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                {selectedEmployee && (
                    <>
                        {hasPrivilege('employee.read_360') && (
                            <MenuItem onClick={() => {
                                fetchEmployee360View(selectedEmployee.staffId);
                                handleContextMenuClose();
                            }}>
                                <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>View 360 Details</ListItemText>
                            </MenuItem>
                        )}
                        {hasPrivilege('employee.update') && (
                            <MenuItem onClick={() => {
                                handleOpenEditEmployeeModal(selectedEmployee);
                                handleContextMenuClose();
                            }}>
                                <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Edit Employee</ListItemText>
                            </MenuItem>
                        )}
                        {hasPrivilege('employee.delete') && (
                            <MenuItem onClick={() => {
                                const fullName = `${selectedEmployee.firstName || ''} ${selectedEmployee.lastName || ''}`.trim();
                                handleOpenDeleteConfirmModal(selectedEmployee.staffId, fullName, 'employee');
                                handleContextMenuClose();
                            }}>
                                <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Delete Employee</ListItemText>
                            </MenuItem>
                        )}
                    </>
                )}
            </Menu>
        </Box>
    );
}
