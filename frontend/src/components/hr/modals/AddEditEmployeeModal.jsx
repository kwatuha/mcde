import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ContactMailOutlinedIcon from '@mui/icons-material/ContactMailOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import apiService from '../../../api';

const sectionTitleSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  fontWeight: 600,
  fontSize: '0.8125rem',
  letterSpacing: '0.02em',
  color: 'text.secondary',
  textTransform: 'uppercase',
  mb: 1,
  mt: 0,
};

const fieldProps = { size: 'small', fullWidth: true, margin: 'dense' };
const selectFormProps = { fullWidth: true, size: 'small', margin: 'dense', sx: { minWidth: 220 } };

const emptyEmployeeForm = {
  firstName: '',
  lastName: '',
  employeeNumber: '',
  email: '',
  phoneNumber: '',
  departmentId: '',
  jobGroupId: '',
  gender: '',
  nationalId: '',
  employmentStatus: 'Active',
  dateEmployed: '',
  designation: '',
  nationality: '',
  employmentType: 'Full-time',
  managerId: '',
  role: '',
};

function normalizeEmployeeFormData(employee = {}) {
  return {
    ...emptyEmployeeForm,
    ...employee,
    employeeNumber: employee.employeeNumber || employee.employee_number || '',
    dateEmployed: employee.dateEmployed || employee.date_employed || employee.startDate || employee.start_date || '',
    designation: employee.designation || employee.role || '',
  };
}

function SectionHeader({ icon: Icon, label, sx = {} }) {
  return (
    <Typography component="div" sx={{ ...sectionTitleSx, ...sx }}>
      {Icon ? <Icon sx={{ fontSize: 18, opacity: 0.85 }} /> : null}
      {label}
    </Typography>
  );
}

export default function AddEditEmployeeModal({
  isOpen,
  onClose,
  editedItem,
  employees,
  jobGroups,
  showNotification,
  refreshData,
}) {
  const [formData, setFormData] = useState({});
  const [departments, setDepartments] = useState([]);
  const isEditMode = !!editedItem;

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const data = await apiService.metadata.departments.getAllDepartments();
        setDepartments(Array.isArray(data) ? data : []);
      } catch {
        showNotification('Could not load departments.', 'error');
      }
    };

    if (isOpen) {
      fetchDepartments();
      setFormData(
        isEditMode
          ? normalizeEmployeeFormData(editedItem)
          : emptyEmployeeForm
      );
    }
  }, [isOpen, isEditMode, editedItem, showNotification]);

  useEffect(() => {
    if (isEditMode && editedItem) {
      setFormData(normalizeEmployeeFormData(editedItem));
    }
  }, [isEditMode, editedItem]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const apiFunction = isEditMode ? apiService.hr.updateEmployee : apiService.hr.addEmployee;

    if (!apiFunction) {
      showNotification('Employee API is not available.', 'error');
      return;
    }
    try {
      const toIntOrOmit = (v) => {
        if (v === '' || v === undefined || v === null) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const payload = {
        ...formData,
        userId: 1,
        startDate: formData.dateEmployed || formData.startDate,
        role: formData.designation || formData.role,
        departmentId: toIntOrOmit(formData.departmentId),
        jobGroupId: toIntOrOmit(formData.jobGroupId),
        managerId: toIntOrOmit(formData.managerId),
      };
      delete payload.dateOfBirth;
      delete payload.date_of_birth;
      delete payload.kraPin;
      delete payload.kra_pin;
      if (isEditMode) {
        const staffId = editedItem.staffId ?? editedItem.staff_id ?? editedItem.id;
        if (!staffId) {
          throw new Error('Employee ID is missing. Please refresh and try again.');
        }
        await apiFunction(staffId, payload);
      } else {
        await apiFunction(payload);
      }
      await refreshData();
      showNotification(`Employee ${isEditMode ? 'updated' : 'added'} successfully.`, 'success');
      onClose();
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        (typeof error.response?.data === 'string' ? error.response.data : null) ||
        error.message;
      showNotification(msg || `Failed to ${isEditMode ? 'update' : 'add'} employee.`, 'error');
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      scroll="paper"
      aria-labelledby="employee-dialog-title"
    >
      <DialogTitle id="employee-dialog-title" sx={{ pb: 0.5 }}>
        {isEditMode ? 'Edit employee' : 'Add new employee'}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
          Required fields are marked. Other details can be added later.
        </Typography>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          pt: 1.5,
          px: { xs: 2, sm: 2.5 },
          maxHeight: { xs: '80vh', md: 'calc(100vh - 140px)' },
          overflowY: 'auto',
        }}
      >
        <form onSubmit={handleSubmit} id="employee-form">
          <Grid container spacing={2}>
            {/* Personal — left column on large screens */}
            <Grid xs={12} lg={7}>
              <Box
                sx={{
                  height: '100%',
                  p: { xs: 0, sm: 1.5 },
                  borderRadius: 1,
                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'grey.50'),
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <SectionHeader icon={PersonOutlineIcon} label="Personal" />
                <Grid container spacing={1.25} columns={12}>
                  <Grid xs={12} sm={4}>
                    <TextField
                      {...fieldProps}
                      autoFocus
                      name="firstName"
                      label="First name"
                      value={formData.firstName || ''}
                      onChange={handleFormChange}
                      required
                    />
                  </Grid>
                  <Grid xs={12} sm={4}>
                    <TextField
                      {...fieldProps}
                      name="lastName"
                      label="Last name"
                      value={formData.lastName || ''}
                      onChange={handleFormChange}
                      required
                    />
                  </Grid>
                  <Grid xs={12} sm={4}>
                    <TextField
                      {...fieldProps}
                      name="employeeNumber"
                      label="Employee number"
                      value={formData.employeeNumber || ''}
                      onChange={handleFormChange}
                    />
                  </Grid>
                  <Grid xs={12} sm={4}>
                    <FormControl {...selectFormProps} required>
                      <InputLabel>Gender</InputLabel>
                      <Select
                        name="gender"
                        value={formData.gender || ''}
                        label="Gender"
                        onChange={handleFormChange}
                      >
                        <MenuItem value="Male">Male</MenuItem>
                        <MenuItem value="Female">Female</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} sm={4}>
                    <TextField
                      {...fieldProps}
                      name="nationality"
                      label="Nationality"
                      value={formData.nationality || ''}
                      onChange={handleFormChange}
                    />
                  </Grid>
                  <Grid xs={12} sm={4}>
                    <TextField
                      {...fieldProps}
                      name="nationalId"
                      label="National ID"
                      value={formData.nationalId || ''}
                      onChange={handleFormChange}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* Contact — right column */}
            <Grid xs={12} lg={5}>
              <Box
                sx={{
                  height: '100%',
                  p: { xs: 0, sm: 1.5 },
                  borderRadius: 1,
                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'grey.50'),
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <SectionHeader icon={ContactMailOutlinedIcon} label="Contact" />
                <Grid container spacing={1.25} columns={12}>
                  <Grid xs={12} sm={6}>
                    <TextField
                      {...fieldProps}
                      name="email"
                      label="Email"
                      type="email"
                      value={formData.email || ''}
                      onChange={handleFormChange}
                      required
                    />
                  </Grid>
                  <Grid xs={12} sm={6}>
                    <TextField
                      {...fieldProps}
                      name="phoneNumber"
                      label="Phone"
                      value={formData.phoneNumber || ''}
                      onChange={handleFormChange}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            <Grid xs={12}>
              <Divider sx={{ my: 0.5 }} />
            </Grid>

            {/* Employment — full width, dense grid */}
            <Grid xs={12}>
              <Box
                sx={{
                  p: { xs: 0, sm: 1.5 },
                  borderRadius: 1,
                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'grey.50'),
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <SectionHeader icon={WorkOutlineIcon} label="Employment" />
                <Grid container spacing={1.25} columns={12}>
                  <Grid xs={12} sm={6} md={3}>
                    <FormControl {...selectFormProps} required>
                      <InputLabel>Department</InputLabel>
                      <Select
                        name="departmentId"
                        value={formData.departmentId ?? ''}
                        label="Department"
                        onChange={handleFormChange}
                      >
                        {Array.isArray(departments) &&
                          departments.map((dept) => {
                            const deptPk = dept.departmentId ?? dept.department_id;
                            return (
                              <MenuItem key={deptPk} value={deptPk}>
                                {dept.name}
                              </MenuItem>
                            );
                          })}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} sm={6} md={3}>
                    {Array.isArray(jobGroups) && jobGroups.length > 0 ? (
                      <FormControl {...selectFormProps} required>
                        <InputLabel>Job group / title</InputLabel>
                        <Select
                          name="jobGroupId"
                          value={formData.jobGroupId ?? ''}
                          label="Job group / title"
                          onChange={handleFormChange}
                        >
                          {jobGroups.map((group) => (
                            <MenuItem key={group.id} value={group.id}>
                              {group.groupName}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        {...fieldProps}
                        name="jobGroupId"
                        label="Job group (optional)"
                        value=""
                        disabled
                        helperText="Add job groups under Administration, or leave blank."
                      />
                    )}
                  </Grid>
                  <Grid xs={12} sm={6} md={2}>
                    <FormControl {...selectFormProps} required>
                      <InputLabel>Type</InputLabel>
                      <Select
                        name="employmentType"
                        value={formData.employmentType || ''}
                        label="Type"
                        onChange={handleFormChange}
                      >
                        <MenuItem value="Full-time">Full-time</MenuItem>
                        <MenuItem value="Part-time">Part-time</MenuItem>
                        <MenuItem value="Contract">Contract</MenuItem>
                        <MenuItem value="Intern">Intern</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} sm={6} md={2}>
                    <FormControl {...selectFormProps} required>
                      <InputLabel>Status</InputLabel>
                      <Select
                        name="employmentStatus"
                        value={formData.employmentStatus || ''}
                        label="Status"
                        onChange={handleFormChange}
                      >
                        <MenuItem value="Active">Active</MenuItem>
                        <MenuItem value="On Leave">On leave</MenuItem>
                        <MenuItem value="Terminated">Terminated</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} sm={6} md={2}>
                    <TextField
                      {...fieldProps}
                      name="dateEmployed"
                      label="Date employed"
                      type="date"
                      value={formData.dateEmployed?.slice(0, 10) || ''}
                      onChange={handleFormChange}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid xs={12} sm={6} md={4}>
                    <FormControl {...selectFormProps}>
                      <InputLabel>Manager</InputLabel>
                      <Select
                        name="managerId"
                        value={formData.managerId ?? ''}
                        label="Manager"
                        onChange={handleFormChange}
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        {Array.isArray(employees) &&
                          employees.map((emp) => (
                            <MenuItem key={emp.staffId} value={emp.staffId}>
                              {emp.firstName} {emp.lastName}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} sm={6} md={8}>
                    <TextField
                      {...fieldProps}
                      name="designation"
                      label="Designation"
                      placeholder="e.g. Senior analyst"
                      value={formData.designation || ''}
                      onChange={handleFormChange}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>
          </Grid>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} color="inherit" variant="outlined" size="medium">
          Cancel
        </Button>
        <Button type="submit" form="employee-form" variant="contained" color="primary" size="medium">
          {isEditMode ? 'Save changes' : 'Save employee'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
