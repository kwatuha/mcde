import axiosInstance from './axiosInstance';
import { getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

/**
 * @file API service for Reporting dashboard calls.
 * @description This service handles data fetching for the comprehensive reports.
 */

const reportsService = {
  /** @returns {Promise<Array>} */
  listReportLibraryUploads: async () => {
    const response = await axiosInstance.get('/report-library');
    return response.data;
  },

  uploadReportLibraryFile: async (file, meta) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', (meta?.title || '').trim());
    if (meta?.description != null && String(meta.description).trim()) {
      formData.append('description', String(meta.description).trim());
    }
    const response = await axiosInstance.post('/report-library/upload', formData);
    return response.data;
  },

  downloadReportLibraryFile: async (id, fallbackFileName = 'report') => {
    const response = await axiosInstance.get(`/report-library/${id}/download`, {
      responseType: 'blob',
    });
    let fileName = fallbackFileName;
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const utf8 = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
      if (utf8?.[1]) {
        try {
          fileName = decodeURIComponent(utf8[1]);
        } catch {
          fileName = fallbackFileName;
        }
      } else {
        const plain = cd.match(/filename="?([^";\n]+)"?/i);
        if (plain?.[1]) fileName = plain[1].replace(/"/g, '');
      }
    }
    return { blob: response.data, fileName };
  },

  updateReportLibrary: async (id, body) => {
    const response = await axiosInstance.patch(`/report-library/${id}`, {
      title: (body.title || '').trim(),
      description:
        body.description === undefined || body.description === null
          ? null
          : String(body.description),
    });
    return response.data;
  },

  deleteReportLibrary: async (id) => {
    await axiosInstance.delete(`/report-library/${id}`);
  },

  replaceReportLibraryFile: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axiosInstance.post(`/report-library/${id}/file`, formData);
    return response.data;
  },

  // --- Department Summary Report Calls ---
  getDepartmentSummaryReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/department-summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch department summary report:", error);
      throw error;
    }
  },

  // --- Project Summary Report Calls ---
  getProjectStatusSummary: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/project-status-summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project status summary:", error);
      throw error;
    }
  },
  getProjectCategorySummary: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/project-category-summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project category summary:", error);
      throw error;
    }
  },

  // --- NEW: Functions to support updated ProjectSummaryReport.jsx ---
  getProjectCostByDepartment: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/project-cost-by-department', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project cost by department:", error);
      throw error;
    }
  },
  getProjectsOverTime: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/projects-over-time', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch projects over time:", error);
      throw error;
    }
  },
  
  // New function to fetch projects at risk budget
  getProjectsAtRiskBudget: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/projects-at-risk-budget', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch projects at risk budget:", error);
      throw error;
    }
  },

  // New function to fetch project status trends over time
  getProjectStatusOverTime: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/project-status-over-time', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch project status over time:", error);
      throw error;
    }
  },

  // --- Project List & Location Reports ---
  getDetailedProjectList: async (filters = {}) => {
    try {
      console.log('reportsService.getDetailedProjectList called with filters:', filters);
      console.log('Full URL will be:', `${axiosInstance.defaults.baseURL}/reports/project-list-detailed`);
      console.log('Query params:', filters);
      
      const response = await axiosInstance.get('/reports/project-list-detailed', { params: filters });
      console.log('API response received:', response.data);
      console.log('Response length:', response.data?.length);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch detailed project list:", error);
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  },
  getSubcountySummaryReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/subcounty-summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch subcounty summary report:", error);
      throw error;
    }
  },
  getWardSummaryReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/ward-summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch ward summary report:", error);
      throw error;
    }
  },

  // --- Other Reports ---
  getYearlyTrendsReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/yearly-trends', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch yearly trends report:", error);
      throw error;
    }
  },

  getYearlyLocationTrendsReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/yearly-location-trends', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch yearly location trends report:", error);
      throw error;
    }
  },

  getStatusReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/status-report', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch status report:", error);
      throw error;
    }
  },

  getSummaryKpis: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/summary-kpis', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch summary KPIs:", error);
      throw error;
    }
  },
  getProjectsByStatusAndYear: async (filters = {}) => {
  try {
    const response = await axiosInstance.get('/reports/projects-by-status-and-year', { params: filters });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch projects by status and year:", error);
    throw error;
  }
},
  getFinancialStatusByProjectStatus: async (filters = {}) => {
  try {
    const response = await axiosInstance.get('/reports/financial-status-by-project-status', { params: filters });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch financial status by project status:", error);
    throw error;
  }
},

  // --- Department Projects ---
  getProjectsByDepartment: async (departmentName) => {
    try {
      const response = await axiosInstance.get('/reports/projects-by-department', { 
        params: { departmentName } 
      });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch projects by department:", error);
      throw error;
    }
  },

  // --- Filter Options ---
  getFilterOptions: async () => {
    try {
      const response = await axiosInstance.get('/reports/filter-options');
      return response.data;
    } catch (error) {
      console.error("Failed to fetch filter options:", error);
      throw error;
    }
  },

  getCountyOperationsFilterOptions: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/county-operations/filter-options', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch county operations filter options:', error);
      throw error;
    }
  },

  getCountyOperationsReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/county-operations/summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch county operations report:', error);
      throw error;
    }
  },

  // --- Annual Trends ---
  getAnnualTrends: async (filters = {}) => {
    try {
      // Support optional startYear and endYear parameters
      const params = {};
      if (filters.startYear) params.startYear = filters.startYear;
      if (filters.endYear) params.endYear = filters.endYear;
      
      const response = await axiosInstance.get('/reports/annual-trends', { params });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch annual trends:", error);
      throw error;
    }
  },

  // --- Absorption Report ---
  getAbsorptionReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/absorption-report', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch absorption report:", error);
      throw error;
    }
  },
  downloadAbsorptionReport: async (filters = {}) => {
    const response = await axiosInstance.get('/reports/absorption-report/export', {
      params: filters,
      responseType: 'blob',
    });
    let fileName = 'absorption-report.xlsx';
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const m = cd.match(/filename="?([^";\n]+)"?/i);
      if (m?.[1]) fileName = m[1].replace(/"/g, '');
    }
    return { blob: response.data, fileName };
  },

  // --- Performance Management Report ---
  getPerformanceManagementReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/performance-management-report', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch performance management report:", error);
      throw error;
    }
  },

  // --- CAPR Report ---
  getCAPRReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/capr-report', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch CAPR report:", error);
      throw error;
    }
  },

  // --- Quarterly Implementation Report ---
  getQuarterlyImplementationReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/quarterly-implementation-report', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch quarterly implementation report:", error);
      throw error;
    }
  },

  // --- Pending Bills Report ---
  getPendingBillsReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/pending-bills', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch pending bills report:', error);
      throw error;
    }
  },
  downloadPendingBillsReport: async (filters = {}) => {
    const response = await axiosInstance.get('/reports/pending-bills/export', {
      params: filters,
      responseType: 'blob',
    });
    let fileName = 'pending-bills-report.xlsx';
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const match = cd.match(/filename="?([^";\n]+)"?/i);
      if (match?.[1]) fileName = match[1].replace(/"/g, '');
    }
    return { blob: response.data, fileName };
  },

  getBudgetJustificationReport: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/reports/budget-justification', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch budget justification report:', error);
      throw error;
    }
  },
  downloadBudgetJustificationReport: async (filters = {}) => {
    const response = await axiosInstance.get('/reports/budget-justification/download', {
      params: filters,
      responseType: 'blob',
    });
    let fileName = 'budget-justification.pdf';
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const m = cd.match(/filename="?([^";\n]+)"?/i);
      if (m?.[1]) fileName = m[1].replace(/"/g, '');
    }
    return { blob: response.data, fileName };
  },
  downloadBudgetJustificationTemplate: async (filters = {}) => reportsService.downloadBudgetJustificationReport(filters),
  getAPRFinancialYears: async () => {
    const response = await axiosInstance.get('/reports/apr/financial-years');
    return response.data;
  },
  downloadAPRReport: async (financialYear) => {
    const logoDataUrl = await getCountyLogoDataUrl();
    const response = await axiosInstance.post('/reports/apr/download', {
      financialYear,
      logoDataUrl,
    }, {
      responseType: 'blob',
    });
    let fileName = `machakos-apr-${String(financialYear || 'report').replace(/[^a-zA-Z0-9_-]/g, '-')}.docx`;
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const utf8 = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
      if (utf8?.[1]) {
        try {
          fileName = decodeURIComponent(utf8[1]);
        } catch {
          // Keep the default fallback filename if the header cannot be decoded.
        }
      } else {
        const m = cd.match(/filename="?([^";\n]+)"?/i);
        if (m?.[1]) fileName = m[1].replace(/"/g, '');
      }
    }
    return { blob: response.data, fileName };
  },
  getReportingTemplateOptions: async () => {
    const response = await axiosInstance.get('/reports/reporting-template/options');
    return response.data;
  },
  downloadReportingTemplate: async (filters = {}) => {
    const logoDataUrl = await getCountyLogoDataUrl();
    const response = await axiosInstance.post('/reports/reporting-template/download', {
      ...filters,
      logoDataUrl,
    }, {
      responseType: 'blob',
    });
    let fileName = 'machakos-reporting-template.docx';
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const utf8 = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
      if (utf8?.[1]) {
        try {
          fileName = decodeURIComponent(utf8[1]);
        } catch {
          // Keep fallback filename.
        }
      } else {
        const m = cd.match(/filename="?([^";\n]+)"?/i);
        if (m?.[1]) fileName = m[1].replace(/"/g, '');
      }
    }
    return { blob: response.data, fileName };
  },
  getProjectFinanceOverview: async (filters = {}) => {
    const response = await axiosInstance.get('/reports/project-finance-overview', { params: filters });
    return response.data;
  },
  getPartnerContributions: async () => {
    const response = await axiosInstance.get('/reports/partner-contributions');
    return response.data;
  },
  getProjectsByFundingSource: async (filters = {}) => {
    const response = await axiosInstance.get('/reports/projects-by-funding-source', { params: filters });
    return response.data;
  },
  getPaymentList: async (filters = {}) => {
    const response = await axiosInstance.get('/reports/payment-list', { params: filters });
    return response.data;
  },
  downloadProjectFinancialStatement: async (projectId) => {
    const response = await axiosInstance.get('/reports/project-financial-statement/export', {
      params: { projectId },
      responseType: 'blob',
    });
    let fileName = 'project-financial-statement.xlsx';
    const cd = response.headers?.['content-disposition'];
    if (cd) {
      const m = cd.match(/filename="?([^";\n]+)"?/i);
      if (m?.[1]) fileName = m[1].replace(/"/g, '');
    }
    return { blob: response.data, fileName };
  },
};

export default reportsService;
//css-970p60-MuiGrid-root