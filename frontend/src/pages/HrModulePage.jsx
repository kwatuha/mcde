// src/pages/HrModule.jsx

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Snackbar, Alert, useTheme } from '@mui/material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';
import Employee360ViewSection from '../components/hr/Employee360ViewSection';
import EmployeeSection from '../components/hr/EmployeeSection';
import LeaveApplicationsSection from '../components/hr/LeaveApplicationsSection';
import LeaveTypesSection from '../components/hr/LeaveTypesSection';
import JobGroupsSection from '../components/hr/JobGroupsSection';
import AttendanceSection from '../components/hr/AttendanceSection';
import PublicHolidaysSection from '../components/hr/PublicHolidaysSection';
import ConfirmDeleteModal from '../components/hr/modals/ConfirmDeleteModal';
import ApproveLeaveModal from '../components/hr/modals/ApproveLeaveModal';
import RecordReturnModal from '../components/hr/modals/RecordReturnModal';
import AddEditEmployeeModal from '../components/hr/modals/AddEditEmployeeModal';
import AddEditLeaveTypeModal from '../components/hr/modals/AddEditLeaveTypeModal';
import AddEditLeaveApplicationModal from '../components/hr/modals/AddEditLeaveApplicationModal';
import AddEditJobGroupModal from '../components/hr/modals/AddEditJobGroupModal';
import { tokens } from "./dashboard/theme";

export default function HrModule() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === 'dark';
  const { hasPrivilege } = useAuth();
  const [searchParams] = useSearchParams();
  const CURRENT_USER_ID = 1;

  const [currentPage, setCurrentPage] = useState('employees');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [employee360View, setEmployee360View] = useState(null);
  const [currentEmployeeInView, setCurrentEmployeeInView] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveApplications, setLeaveApplications] = useState([]);
  const [jobGroups, setJobGroups] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);

  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [approvedDates, setApprovedDates] = useState({ startDate: '', endDate: '' });
  const [actualReturnDate, setActualReturnDate] = useState('');

  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isLeaveTypeModalOpen, setIsLeaveTypeModalOpen] = useState(false);
  const [isLeaveApplicationModalOpen, setIsLeaveApplicationModalOpen] = useState(false);
  const [isJobGroupModalOpen, setIsJobGroupModalOpen] = useState(false);
  const [editedItem, setEditedItem] = useState(null);
  const [publicHolidaysReloadSignal, setPublicHolidaysReloadSignal] = useState(0);

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const showNotification = (message, severity = 'info') => { setSnackbar({ open: true, message, severity }); };
  const handleCloseSnackbar = (event, reason) => { if (reason === 'clickaway') return; setSnackbar({ ...snackbar, open: false }); };
  
  const handleOpenDeleteConfirmModal = (id, name, type) => {
    const permissionKey = type.replace(/\./g, '_') + '.delete';
    if (!hasPrivilege(permissionKey) && !hasPrivilege(`${type}.delete`)) { 
      showNotification('Permission denied.', 'error'); 
      return; 
    }
    setItemToDelete({ id, name, type });
    setIsDeleteConfirmModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    const functionNameMap = {
        'holiday': 'deletePublicHoliday',
        'leave.entitlement': 'deleteLeaveEntitlement',
        'job_group': 'deleteJobGroup',
        'leave_type': 'deleteLeaveType'
    };
    let apiFunctionName = functionNameMap[itemToDelete.type];
    if (!apiFunctionName) {
        const formattedType = itemToDelete.type.replace(/\./g, '_').split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
        apiFunctionName = `delete${formattedType}`;
    }
    
    if (!apiService.hr[apiFunctionName]) { 
        showNotification(`API function '${apiFunctionName}' not found.`, 'error'); 
        return; 
    }
    
    setLoading(true);
    try {
      const apiFunction = apiService.hr[apiFunctionName];
      await apiFunction(itemToDelete.id);
      const deletedType = itemToDelete.type;
      showNotification(`${itemToDelete.name} deleted successfully.`, 'success');
      setIsDeleteConfirmModalOpen(false);
      setItemToDelete(null);

      if (currentPage === 'employee360') {
        fetchEmployee360View(currentEmployeeInView.staffId);
      } else if (deletedType === 'holiday') {
        setPublicHolidaysReloadSignal((n) => n + 1);
      } else {
        fetchData(currentPage);
      }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Failed to delete.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (page) => {
    setLoading(true);
    try {
      switch (page) {
        case 'leaveApplications':
          const leaveAppData = await apiService.hr.getLeaveApplications();
          setLeaveApplications(leaveAppData);
          break;
        case 'attendance':
          const attendanceRecordsData = await apiService.hr.getTodayAttendance();
          setAttendanceRecords(attendanceRecordsData);
          break;
        case 'employees':
        case 'jobGroups':
        case 'leaveTypes': {
            // Use allSettled so one failing endpoint (e.g. employees) still refreshes job groups / leave types after a save.
            const settled = await Promise.allSettled([
                apiService.hr.getEmployees(),
                apiService.hr.getLeaveTypes(),
                apiService.hr.getJobGroups(),
            ]);
            const labels = ['employees', 'leave types', 'job groups'];
            settled.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    if (i === 0) setEmployees(Array.isArray(r.value) ? r.value : []);
                    if (i === 1) setLeaveTypes(Array.isArray(r.value) ? r.value : []);
                    if (i === 2) setJobGroups(Array.isArray(r.value) ? r.value : []);
                } else {
                    console.error(`HR fetch failed (${labels[i]}):`, r.reason);
                }
            });
            const failed = settled.filter((r) => r.status === 'rejected');
            if (failed.length === settled.length) {
                const first = failed[0].reason;
                const detail =
                    first?.response?.data?.message ||
                    (typeof first?.response?.data === 'string' ? first.response.data : null) ||
                    first?.message;
                throw new Error(detail || 'All HR list requests failed');
            }
            if (failed.length > 0) {
                const failedNames = settled
                    .map((r, i) => (r.status === 'rejected' ? labels[i] : null))
                    .filter(Boolean);
                showNotification(`Could not load: ${failedNames.join(', ')}.`, 'warning');
            }
            break;
        }
        default:
          break;
      }
    } catch (error) {
      const detail =
        error.response?.data?.message ||
        (typeof error.response?.data === 'string' ? error.response.data : null) ||
        error.message;
      showNotification(`Failed to fetch data for ${page}. ${detail || ''}`.trim(), 'error');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    const view = searchParams.get('view') || 'employees';
    if (view === 'personnel') {
      setCurrentPage('leaveApplications');
    } else if (view === 'administration') {
      setCurrentPage('jobGroups');
    } else if (view === 'jobGroups') {
      setCurrentPage('jobGroups');
    } else if (view === 'leaveTypes') {
      setCurrentPage('leaveTypes');
    } else if (view === 'publicHolidays') {
      setCurrentPage('publicHolidays');
    } else {
      setCurrentPage('employees');
    }
  }, [searchParams]);

  const fetchEmployee360View = async (employeeId) => {
    setLoading(true);
    try {
      const [employee360Data, balanceData] = await Promise.all([
        apiService.hr.getEmployee360View(employeeId),
        apiService.hr.getLeaveBalance(employeeId, new Date().getFullYear())
      ]);
      
      setEmployee360View(employee360Data);
      setLeaveBalances(balanceData);
      setCurrentEmployeeInView(employee360Data.profile);
      setCurrentPage('employee360');
    } catch (error) {
      showNotification(error.response?.data?.message || 'Failed to fetch employee 360 view.', 'error');
      setEmployee360View(null);
      setCurrentEmployeeInView(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentPage === 'leaveApplications' || currentPage === 'attendance') {
      fetchData(currentPage);
    } else if (currentPage === 'employees' || currentPage === 'jobGroups' || currentPage === 'leaveTypes') {
      fetchData(currentPage);
    }
  }, [currentPage]);

  const handleUpdateLeaveStatus = async (status, applicationOverride = null) => {
    if (!hasPrivilege('leave.approve')) { showNotification('Permission denied to approve or reject leave.', 'error'); return; }
    const app = applicationOverride ?? selectedApplication;
    if (!app?.id) {
      showNotification('No leave application selected.', 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = { status, userId: CURRENT_USER_ID };
      if (status === 'Approved') { payload.approvedStartDate = approvedDates.startDate; payload.approvedEndDate = approvedDates.endDate; }
      await apiService.hr.updateLeaveStatus(app.id, payload);
      showNotification(`Leave application ${status.toLowerCase()} successfully.`, 'success');
      fetchData('leaveApplications');
      setIsApprovalModalOpen(false);
    } catch (error) { showNotification(error.response?.data?.message || 'Failed to update leave status.', 'error'); }
    finally { setLoading(false); }
  };

  const handleRecordReturn = async (e) => {
    e.preventDefault();
    if (!hasPrivilege('leave.complete')) { showNotification('Permission denied to record actual return.', 'error'); return; }
    setLoading(true);
    try { await apiService.hr.recordActualReturn(selectedApplication.id, { actualReturnDate, userId: CURRENT_USER_ID }); showNotification('Actual return date recorded successfully.', 'success'); setIsReturnModalOpen(false); fetchData('leaveApplications'); }
    catch (error) { showNotification(error.response?.data?.message || 'Failed to record actual return date.', 'error'); }
    finally { setLoading(false); }
  };
  
  const handleAttendance = async (staffId) => {
    if (!hasPrivilege('attendance.create')) { showNotification('Permission denied to record attendance.', 'error'); return; }
    if (!staffId) { showNotification('Please select a staff member.', 'warning'); return; }
    setLoading(true);
    try {
      const todayRecords = attendanceRecords.filter(rec => String(rec.staffId) === String(staffId));
      const latestRecord = todayRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (latestRecord && !latestRecord.checkOutTime) {
        await apiService.hr.addAttendanceCheckOut(latestRecord.id, { userId: CURRENT_USER_ID });
        showNotification('Check-out recorded successfully.', 'success');
      } else {
        await apiService.hr.addAttendanceCheckIn({ staffId: staffId, userId: CURRENT_USER_ID });
        showNotification('Check-in recorded successfully.', 'success');
      }
      fetchData('attendance');
    } catch (error) { showNotification(error.response?.data?.message || 'Failed to record attendance.', 'error'); }
    finally { setLoading(false); }
  };
  
  const handleOpenAddEmployeeModal = (item = null) => {
    if (jobGroups.length === 0) {
      showNotification("Please wait, loading job groups...", 'info');
      return;
    }
    setEditedItem(item);
    setIsEmployeeModalOpen(true);
  };
  
  const handleOpenEditEmployeeModal = (item) => {
    if (jobGroups.length === 0) {
      showNotification("Please wait, loading job groups...", 'info');
      return;
    }
    setEditedItem(item);
    setIsEmployeeModalOpen(true);
  };

  const handleCloseEmployeeModal = () => setIsEmployeeModalOpen(false);
  const handleOpenAddLeaveTypeModal = (item = null) => { setEditedItem(item); setIsLeaveTypeModalOpen(true); };
  const handleCloseLeaveTypeModal = () => setIsLeaveTypeModalOpen(false);
  const handleOpenAddLeaveApplicationModal = (item = null) => { setEditedItem(item); setIsLeaveApplicationModalOpen(true); };
  const handleCloseLeaveApplicationModal = () => setIsLeaveApplicationModalOpen(false);
  const handleOpenAddJobGroupModal = (item = null) => { setEditedItem(item); setIsJobGroupModalOpen(true); };
  const handleCloseJobGroupModal = () => setIsJobGroupModalOpen(false);

  const renderContent = () => {
    if (loading && employees.length === 0 && currentPage !== 'publicHolidays') {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="40vh">
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading data...</Typography>
        </Box>
      );
    }
    switch (currentPage) {
      case 'employees':
        return <EmployeeSection {...{ employees, showNotification, refreshData: () => fetchData('employees'), fetchEmployee360View, handleOpenDeleteConfirmModal, handleOpenAddEmployeeModal, handleOpenEditEmployeeModal }} />;
      case 'employee360':
        return <Employee360ViewSection {...{ employee360View, employees, leaveTypes, jobGroups, leaveBalances, hasPrivilege, showNotification, refreshEmployee360View: () => fetchEmployee360View(currentEmployeeInView.staffId), handleOpenDeleteConfirmModal }} />;
      case 'leaveApplications':
        return <LeaveApplicationsSection {...{ leaveApplications, employees, leaveTypes, showNotification, refreshData: () => fetchData('leaveApplications'), handleUpdateLeaveStatus, setSelectedApplication, setIsApprovalModalOpen, setIsReturnModalOpen, setApprovedDates, setActualReturnDate, handleOpenDeleteConfirmModal, handleOpenAddLeaveApplicationModal, handleOpenEditApplicationModal: handleOpenAddLeaveApplicationModal }} />;
      case 'attendance':
        return <AttendanceSection {...{ employees, attendanceRecords, handleAttendance, showNotification, refreshData: () => fetchData('attendance') }} />;
      case 'jobGroups':
        return (
          <JobGroupsSection
            {...{
              jobGroups,
              showNotification,
              refreshData: () => fetchData('jobGroups'),
              handleOpenDeleteConfirmModal,
              handleOpenAddJobGroupModal,
              handleOpenEditJobGroupModal: handleOpenAddJobGroupModal,
            }}
          />
        );
      case 'leaveTypes':
        return (
          <LeaveTypesSection
            {...{
              leaveTypes,
              showNotification,
              refreshData: () => fetchData('leaveTypes'),
              handleOpenDeleteConfirmModal,
              handleOpenAddLeaveTypeModal,
              handleOpenEditLeaveTypeModal: handleOpenAddLeaveTypeModal,
            }}
          />
        );
      case 'publicHolidays':
        return (
          <PublicHolidaysSection
            {...{ showNotification, handleOpenDeleteConfirmModal, reloadSignal: publicHolidaysReloadSignal }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ p: 3, pt: 2, background: colors.primary[400], minHeight: '100vh' }}>
      {/* Main container for all grid content with consistent styling and overflow fix */}
      <Box
        m="0"
        height="75vh"
        sx={{
          "& .MuiPaper-root": {
            border: "none",
          },
          "& .MuiTableContainer-root": {
            borderRadius: "8px",
            maxHeight: "calc(100vh - 200px)",
            boxShadow: theme.palette.mode === 'dark' ? '0px 4px 20px rgba(0, 0, 0, 0.5)' : '0px 4px 20px rgba(0, 0, 0, 0.1)',
            overflow: "hidden",
            overflowY: 'auto' // Fix for scrollbar
          },
          "& .MuiTable-root": {
            backgroundColor: colors.primary[400],
          },
          "& .MuiTableCell-root": {
            borderBottom: "none",
          },
          "& .MuiTableHead-root .MuiTableCell-root": {
            backgroundColor: colors.blueAccent[700],
            color: colors.white,
          },
          "& .MuiTableBody-root .MuiTableRow-root": {
              "&:hover": {
                  backgroundColor: isDark ? colors.primary[500] : theme.palette.action.hover,
              }
          },
          // Dropdown fix
          "& .MuiFormControl-root": {
            minWidth: '200px', // Ensures labels are always visible
          }
        }}
      >
        {renderContent()}
      </Box>
      
      <ConfirmDeleteModal isOpen={isDeleteConfirmModalOpen} onClose={() => setIsDeleteConfirmModalOpen(false)} itemToDelete={itemToDelete} onConfirm={handleDelete} />
      <ApproveLeaveModal isOpen={isApprovalModalOpen} onClose={() => setIsApprovalModalOpen(false)} selectedApplication={selectedApplication} approvedDates={approvedDates} setApprovedDates={setApprovedDates} onApprove={handleUpdateLeaveStatus} leaveBalances={leaveBalances} />
      <RecordReturnModal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} selectedApplication={selectedApplication} actualReturnDate={actualReturnDate} setActualReturnDate={setActualReturnDate} onRecordReturn={handleRecordReturn} />
      
      <AddEditEmployeeModal isOpen={isEmployeeModalOpen} onClose={handleCloseEmployeeModal} editedItem={editedItem} employees={employees} jobGroups={jobGroups} showNotification={showNotification} refreshData={() => fetchData('employees')} />
      
      <AddEditLeaveTypeModal isOpen={isLeaveTypeModalOpen} onClose={handleCloseLeaveTypeModal} editedItem={editedItem} showNotification={showNotification} refreshData={() => fetchData('leaveTypes')} />
      <AddEditLeaveApplicationModal isOpen={isLeaveApplicationModalOpen} onClose={handleCloseLeaveApplicationModal} editedItem={editedItem} employees={employees} leaveTypes={leaveTypes} leaveBalances={leaveBalances} showNotification={showNotification} refreshData={() => fetchData('leaveApplications')} />
      <AddEditJobGroupModal isOpen={isJobGroupModalOpen} onClose={handleCloseJobGroupModal} editedItem={editedItem} showNotification={showNotification} refreshData={() => fetchData('jobGroups')} />
      
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}