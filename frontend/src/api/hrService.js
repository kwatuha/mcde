// services/hrService.js
import axiosInstance from './axiosInstance';

// Helper to extract .data from the response
const processResponse = (response) => response.data;

const hrService = {
  // --- Employee Management ---
  getEmployees: () => axiosInstance.get('/hr/employees').then(processResponse),
  addEmployee: (data) => axiosInstance.post('/hr/employees', data).then(processResponse),
  updateEmployee: (id, data) => axiosInstance.put(`/hr/employees/${id}`, data).then(processResponse),
  deleteEmployee: (id) => axiosInstance.delete(`/hr/employees/${id}`).then(processResponse),
  getEmployee360View: (id) => axiosInstance.get(`/hr/employees/${id}/360`).then(processResponse),
  
  // NEW: Employee Export functions
  exportEmployeesToExcel: (headers) => 
    axiosInstance.post('/hr/export/employees-excel', { headers }, { responseType: 'blob' }).then(processResponse),
  exportEmployeesToPdf: (tableHtml) =>
    axiosInstance
      .post('/hr/export/employees-pdf', { tableHtml }, { responseType: 'blob', timeout: 120000 })
      .then(processResponse),

  // --- Performance Reviews ---
  addPerformanceReview: (data) => axiosInstance.post('/hr/employees/performance', data).then(processResponse),
  updatePerformanceReview: (id, data) => axiosInstance.put(`/hr/employees/performance/${id}`, data).then(processResponse),
  deletePerformanceReview: (id) => axiosInstance.delete(`/hr/employees/performance/${id}`).then(processResponse),

  // --- Leave Balance ---
  getLeaveBalance: (employeeId, year) => axiosInstance.get(`/hr/employees/${employeeId}/leave-balance?year=${year}`).then(processResponse),

  // --- Leave Types ---
  getLeaveTypes: () => axiosInstance.get('/hr/leave-types').then(processResponse),
  addLeaveType: (data) => axiosInstance.post('/hr/leave-types', data).then(processResponse),
  updateLeaveType: (id, data) => axiosInstance.put(`/hr/leave-types/${id}`, data).then(processResponse),
  deleteLeaveType: (id) => axiosInstance.delete(`/hr/leave-types/${id}`).then(processResponse),

  // NEW: --- Leave Entitlements ---
  getLeaveEntitlements: (employeeId) => axiosInstance.get(`/hr/employees/${employeeId}/leave-entitlements`).then(processResponse),
  addLeaveEntitlement: (data) => axiosInstance.post('/hr/leave-entitlements', data).then(processResponse),
  updateLeaveEntitlement: (id, data) => axiosInstance.put(`/hr/leave-entitlements/${id}`, data).then(processResponse),
  deleteLeaveEntitlement: (id) => axiosInstance.delete(`/hr/leave-entitlements/${id}`).then(processResponse),

  // --- Leave Applications ---
  getLeaveApplications: () => axiosInstance.get('/hr/leave-applications').then(processResponse),
  addLeaveApplication: (data) => axiosInstance.post('/hr/leave-applications', data).then(processResponse),
  updateLeaveStatus: (id, data) => axiosInstance.put(`/hr/leave-applications/${id}`, data).then(processResponse),
  updateLeaveApplication: (id, data) => axiosInstance.put(`/hr/leave-applications/${id}/edit`, data).then(processResponse),
  recordActualReturn: (id, data) => axiosInstance.put(`/hr/leave-applications/${id}/return`, data).then(processResponse),
  deleteLeaveApplication: (id) => axiosInstance.delete(`/hr/leave-applications/${id}`).then(processResponse),

  // --- Attendance Management ---
  getTodayAttendance: () => axiosInstance.get('/hr/attendance/today').then(processResponse),
  addAttendanceCheckIn: (data) => axiosInstance.post('/hr/attendance/check-in', data).then(processResponse),
  addAttendanceCheckOut: (id, data) => axiosInstance.put(`/hr/attendance/check-out/${id}`, data).then(processResponse),
    
  // --- All Other CRUD Methods ---
  addCompensation: (data) => axiosInstance.post('/hr/employee-compensation', data).then(processResponse),
  updateCompensation: (id, data) => axiosInstance.put(`/hr/employee-compensation/${id}`, data).then(processResponse),
  deleteCompensation: (id) => axiosInstance.delete(`/hr/employee-compensation/${id}`).then(processResponse),
  addTraining: (data) => axiosInstance.post('/hr/employee-training', data).then(processResponse),
  updateTraining: (id, data) => axiosInstance.put(`/hr/employee-training/${id}`, data).then(processResponse),
  deleteTraining: (id) => axiosInstance.delete(`/hr/employee-training/${id}`).then(processResponse),
  getJobGroups: () => axiosInstance.get('/hr/job-groups').then(processResponse),
  addJobGroup: (data) => axiosInstance.post('/hr/job-groups', data).then(processResponse),
  updateJobGroup: (id, data) => axiosInstance.put(`/hr/job-groups/${id}`, data).then(processResponse),
  deleteJobGroup: (id) => axiosInstance.delete(`/hr/job-groups/${id}`).then(processResponse),
  addPromotion: (data) => axiosInstance.post('/hr/employee-promotions', data).then(processResponse),
  updatePromotion: (id, data) => axiosInstance.put(`/hr/employee-promotions/${id}`, data).then(processResponse),
  deletePromotion: (id) => axiosInstance.delete(`/hr/employee-promotions/${id}`).then(processResponse),
  addDisciplinary: (data) => axiosInstance.post('/hr/employee-disciplinary', data).then(processResponse),
  updateDisciplinary: (id, data) => axiosInstance.put(`/hr/employee-disciplinary/${id}`, data).then(processResponse),
  deleteDisciplinary: (id) => axiosInstance.delete(`/hr/employee-disciplinary/${id}`).then(processResponse),
  addContract: (data) => axiosInstance.post('/hr/employee-contracts', data).then(processResponse),
  updateContract: (id, data) => axiosInstance.put(`/hr/employee-contracts/${id}`, data).then(processResponse),
  deleteContract: (id) => axiosInstance.delete(`/hr/employee-contracts/${id}`).then(processResponse),
  addRetirement: (data) => axiosInstance.post('/hr/employee-retirements', data).then(processResponse),
  updateRetirement: (id, data) => axiosInstance.put(`/hr/employee-retirements/${id}`, data).then(processResponse),
  deleteRetirement: (id) => axiosInstance.delete(`/hr/employee-retirements/${id}`).then(processResponse),
  addLoan: (data) => axiosInstance.post('/hr/employee-loans', data).then(processResponse),
  updateLoan: (id, data) => axiosInstance.put(`/hr/employee-loans/${id}`, data).then(processResponse),
  deleteLoan: (id) => axiosInstance.delete(`/hr/employee-loans/${id}`).then(processResponse),
  addPayroll: (data) => axiosInstance.post('/hr/monthly-payroll', data).then(processResponse),
  updatePayroll: (id, data) => axiosInstance.put(`/hr/monthly-payroll/${id}`, data).then(processResponse),
  deletePayroll: (id) => axiosInstance.delete(`/hr/monthly-payroll/${id}`).then(processResponse),
  addDependant: (data) => axiosInstance.post('/hr/employee-dependants', data).then(processResponse),
  updateDependant: (id, data) => axiosInstance.put(`/hr/employee-dependants/${id}`, data).then(processResponse),
  deleteDependant: (id) => axiosInstance.delete(`/hr/employee-dependants/${id}`).then(processResponse),
  addTermination: (data) => axiosInstance.post('/hr/employee-terminations', data).then(processResponse),
  updateTermination: (id, data) => axiosInstance.put(`/hr/employee-terminations/${id}`, data).then(processResponse),
  deleteTermination: (id) => axiosInstance.delete(`/hr/employee-terminations/${id}`).then(processResponse),
  addBankDetails: (data) => axiosInstance.post('/hr/employee-bank-details', data).then(processResponse),
  updateBankDetails: (id, data) => axiosInstance.put(`/hr/employee-bank-details/${id}`, data).then(processResponse),
  deleteBankDetails: (id) => axiosInstance.delete(`/hr/employee-bank-details/${id}`).then(processResponse),
  addMembership: (data) => axiosInstance.post('/hr/employee-memberships', data).then(processResponse),
  updateMembership: (id, data) => axiosInstance.put(`/hr/employee-memberships/${id}`, data).then(processResponse),
  deleteMembership: (id) => axiosInstance.delete(`/hr/employee-memberships/${id}`).then(processResponse),
  addBenefit: (data) => axiosInstance.post('/hr/employee-benefits', data).then(processResponse),
  updateBenefit: (id, data) => axiosInstance.put(`/hr/employee-benefits/${id}`, data).then(processResponse),
  deleteBenefit: (id) => axiosInstance.delete(`/hr/employee-benefits/${id}`).then(processResponse),
  addAssignedAsset: (data) => axiosInstance.post('/hr/assigned-assets', data).then(processResponse),
  updateAssignedAsset: (id, data) => axiosInstance.put(`/hr/assigned-assets/${id}`, data).then(processResponse),
  deleteAssignedAsset: (id) => axiosInstance.delete(`/hr/assigned-assets/${id}`).then(processResponse),
  addProjectAssignment: (data) => axiosInstance.post('/hr/project-assignments', data).then(processResponse),
  updateProjectAssignment: (id, data) => axiosInstance.put(`/hr/project-assignments/${id}`, data).then(processResponse),
  deleteProjectAssignment: (id) => axiosInstance.delete(`/hr/project-assignments/${id}`).then(processResponse),
  
  // NEW: Function to get leave balance for a specific employee and year
  getLeaveBalance: (employeeId, year) => axiosInstance.get(`/hr/employees/${employeeId}/leave-balance?year=${year}`).then(processResponse),
  
  // --- Public Holidays ---
  getPublicHolidays: () => axiosInstance.get('/hr/public-holidays').then(processResponse),
  addPublicHoliday: (data) => axiosInstance.post('/hr/public-holidays', data).then(processResponse),
  updatePublicHoliday: (id, data) => axiosInstance.put(`/hr/public-holidays/${id}`, data).then(processResponse),
  deletePublicHoliday: (id) => axiosInstance.delete(`/hr/public-holidays/${id}`).then(processResponse),
  
  calculateWorkingDays: (startDate, endDate) => axiosInstance.get(`/hr/calculate-working-days?startDate=${startDate}&endDate=${endDate}`).then(processResponse),
};

export default hrService;