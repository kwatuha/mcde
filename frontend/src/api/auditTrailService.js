import axiosInstance from './axiosInstance';

/**
 * @param {object} [params]
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 * @param {string} [params.action]
 * @param {string} [params.entityType]
 * @param {string} [params.entityId]
 * @param {string} [params.actorUsername]
 * @param {string} [params.from] - ISO date (YYYY-MM-DD)
 * @param {string} [params.to] - ISO date (YYYY-MM-DD)
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export async function listAuditTrail(params = {}) {
  const response = await axiosInstance.get('/audit-trail', { params });
  return response.data;
}

export default { listAuditTrail };
