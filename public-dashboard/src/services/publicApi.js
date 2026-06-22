import axios from 'axios';

// Use relative path in production so nginx proxy handles it
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const publicApi = axios.create({
  baseURL: `${API_BASE_URL}/public`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getOverviewStats = async (finYearId = null, filters = {}) => {
  const params = finYearId ? { finYearId } : {};
  
  // Add filter parameters
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.status) params.status = filters.status;
  if (filters.projectSearch) params.search = filters.projectSearch;
  
  const response = await publicApi.get('/stats/overview', { params });
  return response.data;
};

export const getYearlyTrends = async (filters = {}) => {
  const params = {};
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.status) params.status = filters.status;
  if (filters.projectSearch) params.search = filters.projectSearch;

  const response = await publicApi.get('/stats/yearly-trends', { params });
  return response.data;
};

export const getDepartmentStats = async (finYearId = null, filters = {}) => {
  const params = finYearId ? { finYearId } : {};
  
  // Add filter parameters
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.projectSearch) params.search = filters.projectSearch;
  
  const response = await publicApi.get('/stats/by-department', { params });
  return response.data;
};

export const getSubCountyStats = async (finYearId = null, filters = {}) => {
  const params = finYearId ? { finYearId } : {};
  
  // Add filter parameters
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.projectSearch) params.search = filters.projectSearch;
  
  const response = await publicApi.get('/stats/by-subcounty', { params });
  return response.data;
};

export const getProjectTypeStats = async (finYearId = null) => {
  const params = finYearId ? { finYearId } : {};
  const response = await publicApi.get('/stats/by-project-type', { params });
  return response.data;
};

// Financial Years
export const getFinancialYears = async () => {
  const response = await publicApi.get('/financial-years');
  return response.data;
};

// Projects
export const getProjects = async (filters = {}) => {
  const response = await publicApi.get('/projects', { params: filters });
  return response.data;
};

export const getProjectDetails = async (projectId) => {
  const response = await publicApi.get(`/projects/${projectId}`);
  return response.data;
};

export const getProjectMap = async (projectId) => {
  try {
    const response = await publicApi.get(`/projects/${projectId}/map`);
    return response.data;
  } catch (error) {
    // If map endpoint returns 404, return null instead of throwing
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const getProjectsByDepartment = async (departmentId, finYearId = null) => {
  const params = { departmentId, limit: 500 };
  if (finYearId) params.finYearId = finYearId;
  const response = await publicApi.get('/projects', { params });
  return response.data.projects || [];
};

export const getProjectsBySubCounty = async (subCountyId, finYearId = null) => {
  const params = { subCountyId, limit: 500 };
  if (finYearId) params.finYearId = finYearId;
  const response = await publicApi.get('/projects', { params });
  return response.data.projects || [];
};

export const getProjectsByWard = async (wardId, finYearId = null, extra = {}) => {
  const params = { wardId, limit: 500, ...extra };
  if (finYearId) params.finYearId = finYearId;
  const response = await publicApi.get('/projects', { params });
  return response.data.projects || [];
};

export const getProjectsBySublocation = async (sublocationId, finYearId = null, extra = {}) => {
  const params = { sublocationId, limit: 500, ...extra };
  if (finYearId) params.finYearId = finYearId;
  const response = await publicApi.get('/projects', { params });
  return response.data.projects || [];
};

export const getProjectsByVillage = async (villageId, finYearId = null, extra = {}) => {
  const params = { villageId, limit: 500, ...extra };
  if (finYearId) params.finYearId = finYearId;
  const response = await publicApi.get('/projects', { params });
  return response.data.projects || [];
};

export const getProjectsByFinancialYear = async (finYearId) => {
  const params = { finYearId };
  const response = await publicApi.get('/projects', { params });
  return response.data.projects || [];
};

export const getWardStats = async (finYearId = null, filters = {}) => {
  const params = finYearId ? { finYearId } : {};
  
  // Add filter parameters
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.projectSearch) params.search = filters.projectSearch;
  
  const response = await publicApi.get('/stats/by-ward', { params });
  return response.data;
};

export const getSublocationStats = async (finYearId = null, filters = {}) => {
  const params = finYearId ? { finYearId } : {};
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.projectSearch) params.search = filters.projectSearch;
  const response = await publicApi.get('/stats/by-sublocation', { params });
  return response.data;
};

export const getVillageStats = async (finYearId = null, filters = {}) => {
  const params = finYearId ? { finYearId } : {};
  if (filters.department) params.departmentId = filters.department;
  if (filters.subcounty) params.subcountyId = filters.subcounty;
  if (filters.ward) params.wardId = filters.ward;
  if (filters.sublocation) params.sublocationId = filters.sublocation;
  if (filters.village) params.villageId = filters.village;
  if (filters.projectSearch) params.search = filters.projectSearch;
  const response = await publicApi.get('/stats/by-village', { params });
  return response.data;
};

// Metadata
export const getDepartments = async () => {
  const response = await publicApi.get('/metadata/departments');
  return response.data;
};

export const getSubCounties = async () => {
  const response = await publicApi.get('/metadata/subcounties');
  return response.data;
};

export const getWards = async (subCountyId = null) => {
  const params = {};
  if (subCountyId) params.subCountyId = subCountyId;
  const response = await publicApi.get('/metadata/wards', { params });
  return response.data;
};

export const getSublocations = async (wardId = null, subCountyId = null) => {
  const params = {};
  if (wardId) params.wardId = wardId;
  if (subCountyId) params.subCountyId = subCountyId;
  const response = await publicApi.get('/metadata/sublocations', { params });
  return response.data;
};

export const getVillages = async (sublocationId = null, wardId = null, subCountyId = null) => {
  const params = {};
  if (sublocationId) params.sublocationId = sublocationId;
  if (wardId) params.wardId = wardId;
  if (subCountyId) params.subCountyId = subCountyId;
  const response = await publicApi.get('/metadata/villages', { params });
  return response.data;
};

export const getDirectorates = async (departmentId = null) => {
  const params = {};
  if (departmentId) params.departmentId = departmentId;
  const response = await publicApi.get('/metadata/directorates', { params });
  return response.data;
};

export const getProjectTypes = async () => {
  const response = await publicApi.get('/metadata/project-types');
  return response.data;
};

// Feedback
export const submitFeedback = async (feedbackData) => {
  const response = await publicApi.post('/feedback', feedbackData);
  return response.data;
};

export const getFeedbackList = async (filters = {}) => {
  const response = await publicApi.get('/feedback', { params: filters });
  return response.data;
};

export const getFeedbackStats = async () => {
  const response = await publicApi.get('/feedback/stats');
  return response.data;
};

// Citizen Proposals
export const getCitizenProposals = async (filters = {}) => {
  try {
    const response = await publicApi.get('/citizen-proposals', { params: filters });
    return response.data;
  } catch (error) {
    console.error('API Error - getCitizenProposals:', error.response?.data || error.message);
    throw error;
  }
};

export const getCitizenProposal = async (id) => {
  try {
    const response = await publicApi.get(`/citizen-proposals/${id}`);
    return response.data;
  } catch (error) {
    console.error('API Error - getCitizenProposal:', error.response?.data || error.message);
    throw error;
  }
};

export const submitCitizenProposal = async (proposalData) => {
  try {
    const response = await publicApi.post('/citizen-proposals', proposalData);
    return response.data;
  } catch (error) {
    console.error('API Error - submitCitizenProposal:', error.response?.data || error.message);
    throw error;
  }
};

// Proposed Projects
export const getCountyProposedProjects = async (filters = {}) => {
  try {
    const response = await publicApi.get('/county-proposed-projects', { params: filters });
    return response.data;
  } catch (error) {
    console.error('API Error - getCountyProposedProjects:', error.response?.data || error.message);
    throw error;
  }
};

export const getCountyProposedProject = async (id) => {
  try {
    const response = await publicApi.get(`/county-proposed-projects/${id}`);
    return response.data;
  } catch (error) {
    console.error('API Error - getCountyProposedProject:', error.response?.data || error.message);
    throw error;
  }
};

// Project Announcements
export const getAnnouncements = async (filters = {}) => {
  try {
    const response = await publicApi.get('/announcements', { params: filters });
    return response.data;
  } catch (error) {
    console.error('API Error - getAnnouncements:', error.response?.data || error.message);
    throw error;
  }
};

export const getAnnouncement = async (id) => {
  try {
    const response = await publicApi.get(`/announcements/${id}`);
    return response.data;
  } catch (error) {
    console.error('API Error - getAnnouncement:', error.response?.data || error.message);
    throw error;
  }
};

export default publicApi;

