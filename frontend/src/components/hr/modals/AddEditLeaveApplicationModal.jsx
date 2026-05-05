import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Grid, TextField, FormControl, InputLabel, Select, MenuItem, Alert, Stack, Typography, Chip
} from '@mui/material';
import apiService from '../../../api';

export default function AddEditLeaveApplicationModal({
  isOpen,
  onClose,
  editedItem,
  employees,
  leaveTypes,
  leaveBalances,
  currentEmployeeInView,
  showNotification,
  refreshData,
  readOnly = false,
}) {
  const [formData, setFormData] = useState({});
  const [currentBalance, setCurrentBalance] = useState(null);
  const isEditMode = !!editedItem && !readOnly;

  useEffect(() => {
    if ((isEditMode || readOnly) && editedItem) {
      setFormData(editedItem);
    } else {
      setFormData({
        staffId: currentEmployeeInView ? currentEmployeeInView.staffId : '',
        leaveTypeId: '',
        startDate: '',
        endDate: '',
        numberOfDays: 0,
        reason: '',
        handoverStaffId: '',      // ADDED: Restored field
        handoverComments: ''  // ADDED: Restored field
      });
    }
  }, [isOpen, isEditMode, readOnly, editedItem, currentEmployeeInView]);

  useEffect(() => {
    if (readOnly) return;
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (end >= start) {
        const fetchWorkingDays = async () => {
          try {
            const response = await apiService.hr.calculateWorkingDays(formData.startDate, formData.endDate);
            setFormData(prev => ({ ...prev, numberOfDays: response.workingDays }));
          } catch (error) {
            console.error("Failed to calculate working days", error);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            setFormData(prev => ({ ...prev, numberOfDays: diffDays }));
          }
        };
        fetchWorkingDays();
      }
    }
  }, [readOnly, formData.startDate, formData.endDate]);
  
  useEffect(() => {
    if (formData.leaveTypeId && Array.isArray(leaveBalances)) {
      const balance = leaveBalances.find(b => String(b.leaveTypeId) === String(formData.leaveTypeId));
      setCurrentBalance(balance);
    } else {
      setCurrentBalance(null);
    }
  }, [formData.leaveTypeId, leaveBalances]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    if (!formData.staffId || !formData.leaveTypeId) {
        showNotification('Employee and Leave Type are required.', 'error');
        return;
    }
    
    const action = isEditMode ? 'updateLeaveApplication' : 'addLeaveApplication';
    const apiFunction = apiService.hr[action];

    if (!apiFunction) {
      showNotification(`API function for ${action} not found.`, 'error');
      return;
    }

    try {
      const toIntOrOmit = (v) => {
        if (v === '' || v === undefined || v === null) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const days =
        formData.numberOfDays === '' || formData.numberOfDays === undefined || formData.numberOfDays === null
          ? null
          : Number(formData.numberOfDays);
      const payload = {
        ...formData,
        staffId: toIntOrOmit(formData.staffId),
        leaveTypeId: toIntOrOmit(formData.leaveTypeId),
        handoverStaffId: toIntOrOmit(formData.handoverStaffId),
        numberOfDays: Number.isFinite(days) ? days : null,
        userId: 1,
      };
      if (isEditMode) {
        await apiFunction(editedItem.id, payload);
      } else {
        await apiFunction(payload);
      }
      await refreshData();
      showNotification(`Leave application ${isEditMode ? 'updated' : 'submitted'} successfully.`, 'success');
      onClose();
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        (typeof error.response?.data === 'string' ? error.response.data : null) ||
        error.message;
      showNotification(msg || 'Failed to submit leave application.', 'error');
    }
  };

  const renderLeaveTypeValue = (selectedId) => {
    if (!Array.isArray(leaveTypes)) return '';
    const type = leaveTypes.find(t => String(t.id) === String(selectedId));
    return type ? type.name : '';
  };
  
  const renderEmployeeValue = (selectedId) => {
    if (!Array.isArray(employees)) return '';
    const employee = employees.find(emp => String(emp.staffId) === String(selectedId));
    return employee ? `${employee.firstName} ${employee.lastName}` : '';
  };

  const statusColor =
    formData?.status === 'Approved'
      ? 'success'
      : formData?.status === 'Rejected'
        ? 'error'
        : formData?.status === 'Completed'
          ? 'primary'
          : 'warning';

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ backgroundColor: 'primary.main', color: 'white' }}>
        {readOnly ? 'Leave application details' : isEditMode ? 'Edit Leave Application' : 'Apply for Leave'}
      </DialogTitle>
      <DialogContent dividers>
        {readOnly && editedItem && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ pb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Chip size="small" label={editedItem.status || '—'} color={statusColor} sx={{ fontWeight: 600 }} />
            {editedItem.approvedStartDate && (
              <Typography variant="body2" color="text.secondary">
                Approved: {String(editedItem.approvedStartDate).slice(0, 10)} – {String(editedItem.approvedEndDate || '').slice(0, 10)}
              </Typography>
            )}
            {editedItem.actualReturnDate && (
              <Typography variant="body2" color="text.secondary">
                Returned: {String(editedItem.actualReturnDate).slice(0, 10)}
              </Typography>
            )}
          </Stack>
        )}
        <form onSubmit={handleSubmit} id="leave-app-form">
          <Grid container spacing={2} sx={{ pt: 1 }}>

            {!currentEmployeeInView && (
              <Grid xs={12}>
                <FormControl fullWidth required={!readOnly} disabled={readOnly} sx={{ minWidth: 200 }}>
                  <InputLabel>Select Employee</InputLabel>
                  <Select name="staffId" value={formData?.staffId || ''} onChange={handleFormChange} label="Select Employee" renderValue={renderEmployeeValue}>
                    {Array.isArray(employees) && employees.map((emp) => (
                      <MenuItem key={emp.staffId} value={String(emp.staffId)}>{emp.firstName} {emp.lastName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            <Grid xs={12} sm={6}>
                <FormControl fullWidth required={!readOnly} disabled={readOnly} sx={{ minWidth: 200 }}>
                  <InputLabel>Leave Type</InputLabel>
                  <Select name="leaveTypeId" value={formData?.leaveTypeId || ''} onChange={handleFormChange} label="Leave Type" renderValue={renderLeaveTypeValue}>
                    {Array.isArray(leaveTypes) && leaveTypes.map((type) => (
                      <MenuItem key={type.id} value={String(type.id)}>{type.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
            </Grid>
            <Grid xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                {!readOnly && currentBalance && (
                    <Alert severity="info" sx={{ width: '100%', mt: 0 }}>
                        Available Balance: <strong>{currentBalance.balance}</strong> days
                    </Alert>
                )}
            </Grid>
            <Grid xs={12} sm={4}>
              <TextField fullWidth name="startDate" label="Start Date" type="date" value={formData?.startDate?.slice(0, 10) || ''} onChange={handleFormChange} required={!readOnly} disabled={readOnly} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid xs={12} sm={4}>
              <TextField fullWidth name="endDate" label="End Date" type="date" value={formData?.endDate?.slice(0, 10) || ''} onChange={handleFormChange} required={!readOnly} disabled={readOnly} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid xs={12} sm={4}>
                <TextField
                    fullWidth
                    disabled
                    name="numberOfDays"
                    label="Working Days"
                    type="number"
                    value={formData?.numberOfDays || 0}
                    InputLabelProps={{ shrink: true }}
                />
            </Grid>
            <Grid xs={12}>
              <TextField fullWidth name="reason" label="Reason for Leave" multiline rows={2} value={formData?.reason || ''} onChange={handleFormChange} required={!readOnly} disabled={readOnly} />
            </Grid>
            
            {/* ADDED: Restored Handover fields */}
            <Grid xs={12} sm={6}>
                <FormControl fullWidth disabled={readOnly} sx={{ minWidth: 200 }}>
                  <InputLabel>Handover To (Optional)</InputLabel>
                  <Select name="handoverStaffId" value={formData?.handoverStaffId ?? ''} onChange={handleFormChange} label="Handover To (Optional)" renderValue={renderEmployeeValue}>
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {Array.isArray(employees) &&
                      employees.map((emp) => (
                        <MenuItem key={emp.staffId} value={String(emp.staffId)}>
                          {emp.firstName} {emp.lastName}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
            </Grid>
            <Grid xs={12}>
              <TextField fullWidth name="handoverComments" label="Handover Comments" multiline rows={2} value={formData?.handoverComments || ''} onChange={handleFormChange} disabled={readOnly} />
            </Grid>

          </Grid>
        </form>
      </DialogContent>
      <DialogActions>
            {readOnly ? (
              <Button onClick={onClose} color="primary" variant="contained">
                Close
              </Button>
            ) : (
              <>
                <Button onClick={onClose} color="primary" variant="outlined">Cancel</Button>
                <Button type="submit" form="leave-app-form" variant="contained" color="success">
                    {isEditMode ? 'Update' : 'Submit Application'}
                </Button>
              </>
            )}
      </DialogActions>
    </Dialog>
  );
}