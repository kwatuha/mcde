// src/configs/projectTableConfig.js
const projectTableColumns = [
  { id: 'rowNumber', label: '#', minWidth: 30, width: 40, show: true, sortable: false, sticky: 'left' },
  { id: 'id', label: 'ID', minWidth: 20, show: false, sortable: true },
  { id: 'projectName', label: 'Project Name', minWidth: 200, width: 250, show: true, sticky: 'left', sortable: true },
  { id: 'status', label: 'Status', minWidth: 160, show: true, sortable: true },
  { id: 'directorate', label: 'Directorate', minWidth: 150, show: false, sortable: true },
  { id: 'startDate', label: 'Start Date', minWidth: 120, show: false, sortable: true }, // Added sortable
  { id: 'endDate', label: 'End Date', minWidth: 120, show: false, sortable: true },     // Added sortable
  { id: 'costOfProject', label: 'Budget', minWidth: 150, width: 150, show: false, sortable: true },   // Added sortable
  { id: 'Contracted', label: 'Contracted', minWidth: 150, show: true, sortable: true },   // Added sortable
  { id: 'paidOut', label: 'Disbursed', minWidth: 100, show: false, sortable: true },     // Added sortable
  { id: 'overallProgress', label: 'Progress', minWidth: 160, width: 160, show: true, sortable: true },
  { id: 'coverageCount', label: 'Sites', minWidth: 120, width: 120, show: true, sortable: true }, // Site count badge
  { id: 'jobsCount', label: 'Jobs', minWidth: 120, width: 120, show: true, sortable: true }, // Jobs opportunities created
  { id: 'countyNames', label: 'County', minWidth: 150, show: true, sortable: false }, // From project_sites - Default visible
  { id: 'constituencyNames', label: 'Constituency', minWidth: 150, show: true, sortable: false }, // From project_sites - Default visible
  { id: 'wardNames', label: 'Ward', minWidth: 150, show: true, sortable: false }, // From project_sites - Default visible
  { id: 'departmentName', label: 'Department', minWidth: 145, show: false, sortable: true }, // Optional - hidden by default
  { id: 'financialYearName', label: 'Fin. Year', minWidth: 125, show: false, sortable: true },
  { id: 'programName', label: 'Program', minWidth: 150, show: false, sortable: true },
  { id: 'subProgramName', label: 'Sub-Program', minWidth: 150, show: false, sortable: true },
  { id: 'subcountyNames', label: 'Sub-County', minWidth: 160, show: false, sortable: false }, // Legacy - kept for backward compatibility 
  { id: 'principalInvestigator', label: 'Project Manager', minWidth: 150, show: true, sortable: true },
  { id: 'actions', label: 'Actions', minWidth: 50, width: 50, show: true, sticky: 'right', sortable: false },
];

export default projectTableColumns;