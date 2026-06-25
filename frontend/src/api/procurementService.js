import axiosInstance from './axiosInstance';

const procurementService = {
  /** Active stages by default; pass `{ all: true }` for catalog admin (includes inactive). */
  listStages: async (params = {}) => {
    const { data } = await axiosInstance.get('/procurement/stages', { params });
    return data;
  },
  createStage: async (payload) => {
    const { data } = await axiosInstance.post('/procurement/stages', payload);
    return data;
  },
  updateStage: async (id, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/stages/${id}`, payload);
    return data;
  },
  deleteStage: async (id) => {
    await axiosInstance.delete(`/procurement/stages/${id}`);
  },
  getUnderProcurementProjects: async () => {
    const { data } = await axiosInstance.get('/procurement/projects');
    return data;
  },
  /** Projects whose procurement finished (contract handoff); workflow & assessments remain on the project for audit. */
  getCompletedProcurementsHistory: async () => {
    const { data } = await axiosInstance.get('/procurement/projects/completed-history');
    return data;
  },
  getWorkflowHistory: async (projectId) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/workflow`);
    return data;
  },
  previewProjectScope: async (projectId) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/prepare-scope/preview`);
    return data;
  },
  prepareProjectScope: async (projectId, payload = {}) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/prepare-scope`, payload);
    return data;
  },
  getProjectScopeStatus: async (projectId) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/scope-status`);
    return data;
  },
  downloadScopeImportTemplate: async () => {
    const { data, headers } = await axiosInstance.get('/procurement/scope/import-template', {
      responseType: 'blob',
    });
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || 'project_scope_import_template.xlsx' };
  },
  previewScopeImport: async (projectId, file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.scaleToBudget) formData.append('scaleToBudget', 'true');
    const { data } = await axiosInstance.post(
      `/procurement/projects/${projectId}/scope/import/preview`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },
  confirmScopeImport: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/scope/import/confirm`, payload);
    return data;
  },
  lockProjectScope: async (projectId, payload = {}) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/scope/lock`, payload);
    return data;
  },
  listProjectQuotations: async (projectId) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/quotations`);
    return data;
  },
  getScopeComparison: async (projectId, params = {}) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/scope-comparison`, { params });
    return data;
  },
  createQuotationFromPlanned: async (projectId, payload = {}) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/quotations`, {
      fromPlanned: true,
      ...payload,
    });
    return data;
  },
  downloadQuotationImportTemplate: async () => {
    const { data, headers } = await axiosInstance.get('/procurement/quotations/import-template', {
      responseType: 'blob',
    });
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || 'contracted_quotation_import_template.xlsx' };
  },
  exportPlannedBqForQuoting: async (projectId) => {
    const { data, headers } = await axiosInstance.get(`/procurement/projects/${projectId}/quotations/export-planned`, {
      responseType: 'blob',
    });
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || `quote_template_project_${projectId}.xlsx` };
  },
  getQuotationEntrySheet: async (projectId) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/quotations/entry-sheet`);
    return data;
  },
  confirmQuotationEntry: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/quotations/entry/confirm`, payload);
    return data;
  },
  previewQuotationImport: async (projectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await axiosInstance.post(
      `/procurement/projects/${projectId}/quotations/import/preview`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },
  confirmQuotationImport: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/quotations/import/confirm`, payload);
    return data;
  },
  updateQuotation: async (projectId, quotationId, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/projects/${projectId}/quotations/${quotationId}`, payload);
    return data;
  },
  addWorkflowStep: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/workflow`, payload);
    return data;
  },
  updateWorkflowStep: async (projectId, workflowId, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/projects/${projectId}/workflow/${workflowId}`, payload);
    return data;
  },
  deleteWorkflowStep: async (projectId, workflowId) => {
    await axiosInstance.delete(`/procurement/projects/${projectId}/workflow/${workflowId}`);
  },
  getAttachments: async (projectId, params = {}) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/attachments`, { params });
    return data;
  },
  uploadAttachment: async (projectId, formData) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  getChecklist: async (projectId, params = {}) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/checklist`, { params });
    return data;
  },
  addChecklistItem: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/checklist`, payload);
    return data;
  },
  updateChecklistItem: async (projectId, itemId, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/projects/${projectId}/checklist/${itemId}`, payload);
    return data;
  },
  listTemplates: async (params = {}) => {
    const { data } = await axiosInstance.get('/procurement/templates', { params });
    return data;
  },
  createTemplate: async (payload) => {
    const { data } = await axiosInstance.post('/procurement/templates', payload);
    return data;
  },
  updateTemplate: async (id, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/templates/${id}`, payload);
    return data;
  },
  listStageSubjects: async (projectId, stage, params = {}) => {
    const { data } = await axiosInstance.get(
      `/procurement/projects/${projectId}/stages/${encodeURIComponent(stage)}/subjects`,
      { params }
    );
    return data;
  },
  createStageSubject: async (projectId, stage, payload) => {
    const { data } = await axiosInstance.post(
      `/procurement/projects/${projectId}/stages/${encodeURIComponent(stage)}/subjects`,
      payload
    );
    return data;
  },
  updateSubject: async (subjectId, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/subjects/${subjectId}`, payload);
    return data;
  },
  deleteSubject: async (subjectId) => {
    await axiosInstance.delete(`/procurement/subjects/${subjectId}`);
  },
  getSubjectAssessment: async (subjectId) => {
    const { data } = await axiosInstance.get(`/procurement/subjects/${subjectId}/assessment`);
    return data;
  },
  saveSubjectAssessment: async (subjectId, payload) => {
    const { data } = await axiosInstance.put(`/procurement/subjects/${subjectId}/assessment`, payload);
    return data;
  },
  exportBidderEvaluation: async (projectId, stage, format = 'xlsx') => {
    const { data, headers } = await axiosInstance.get(
      `/procurement/projects/${projectId}/stages/${encodeURIComponent(stage)}/evaluation-export`,
      { params: { format }, responseType: 'blob' }
    );
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || `bidder-evaluation.${format}` };
  },
  /** Excel workbook export. */
  exportComprehensiveWorkbook: async (params = {}) => {
    const { data, headers } = await axiosInstance.get('/procurement/export/comprehensive', {
      params,
      responseType: 'blob',
    });
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || 'procurement-comprehensive.xlsx' };
  },
  /** In-app workbook view: same HTML as `format=html` on the export URL, returned as a string. */
  getComprehensiveWorkbookHtml: async (params = {}) => {
    const { data } = await axiosInstance.get('/procurement/export/comprehensive', {
      params: { ...params, format: 'html' },
      responseType: 'text',
    });
    return data;
  },
  getOverview: async () => {
    const { data } = await axiosInstance.get('/procurement/overview');
    return data;
  },
};

export default procurementService;
