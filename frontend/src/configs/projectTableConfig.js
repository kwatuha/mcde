// src/configs/projectTableConfig.js
// Default visible columns: Project Name, Status, Budget, Progress, Sites, Jobs, Actions (fits without horizontal scroll)
const projectTableColumns = [
  { id: 'rowNumber', label: '#', minWidth: 30, width: 40, show: false, sortable: false, sticky: 'left' },
  { id: 'id', label: 'ID', minWidth: 20, show: false, sortable: true },
  { id: 'projectName', label: 'Project Name', minWidth: 260, width: 320, show: true, sticky: 'left', sortable: true },
  { id: 'projectType', label: 'Project Type', minWidth: 170, width: 190, show: true, sortable: true },
  { id: 'status', label: 'Status', minWidth: 120, width: 130, show: true, sortable: true },
  { id: 'directorate', label: 'Directorate', minWidth: 150, show: false, sortable: true },
  { id: 'startDate', label: 'Start Date', minWidth: 120, show: false, sortable: true },
  { id: 'endDate', label: 'End Date', minWidth: 120, show: false, sortable: true },
  { id: 'costOfProject', label: 'Budget', minWidth: 110, width: 120, show: true, sortable: true },
  { id: 'Contracted', label: 'Contracted', minWidth: 150, show: false, sortable: true },
  { id: 'paidOut', label: 'Paid', minWidth: 100, show: false, sortable: true },
  { id: 'tenderContractNo', label: 'Tender No', minWidth: 130, show: true, sortable: true },
  { id: 'cidpLink', label: 'CIDP Link', minWidth: 240, width: 280, show: true, sortable: true },
  { id: 'overallProgress', label: 'Progress', minWidth: 120, width: 130, show: true, sortable: true },
  { id: 'coverageCount', label: 'Sites', minWidth: 70, width: 80, show: true, sortable: true },
  { id: 'jobsCount', label: 'Jobs', minWidth: 70, width: 80, show: true, sortable: true },
  { id: 'countyNames', label: 'County', minWidth: 150, show: false, sortable: false },
  { id: 'constituencyNames', label: 'Sub-county', minWidth: 150, show: false, sortable: false },
  { id: 'wardNames', label: 'Ward', minWidth: 150, show: false, sortable: false },
  { id: 'sublocationName', label: 'Sublocation', minWidth: 170, show: true, sortable: false },
  { id: 'villageName', label: 'Village', minWidth: 170, show: true, sortable: false },
  { id: 'departmentName', label: 'Department', minWidth: 145, show: false, sortable: true },
  { id: 'financialYearName', label: 'Fin. Year', minWidth: 125, show: false, sortable: true },
  { id: 'programName', label: 'Programme', minWidth: 150, show: false, sortable: true },
  { id: 'subProgramName', label: 'Sub-programme', minWidth: 150, show: false, sortable: true },
  { id: 'subcountyNames', label: 'Sub-County', minWidth: 160, show: true, sortable: false },
  { id: 'principalInvestigator', label: 'Project Manager', minWidth: 150, show: false, sortable: true },
  { id: 'actions', label: 'Actions', minWidth: 72, width: 80, show: true, sticky: 'right', sortable: false },
];

export default projectTableColumns;