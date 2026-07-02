import { useCallback, useEffect, useRef, useState } from 'react';
import coFinanceWorkspaceService from '../../api/coFinanceWorkspaceService';

export function useCoFinanceWorkspaceData({
  initialSearch = '',
  autoLoad = true,
  include = 'all',
} = {}) {
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [search, setSearch] = useState(initialSearch);
  const searchRef = useRef(search);
  const includeRef = useRef(include);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    includeRef.current = include;
  }, [include]);

  const load = useCallback(async (searchOverride) => {
    setLoading(true);
    setError('');
    try {
      const q = searchOverride !== undefined ? searchOverride : searchRef.current;
      const payload = await coFinanceWorkspaceService.getWorkspace({
        search: String(q || '').trim() || undefined,
        limit: 120,
        include: includeRef.current,
      });
      setData(payload);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load co-finance workspace');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load, include]);

  return {
    loading,
    error,
    data,
    load,
    search,
    setSearch,
    projects: data?.projects || [],
    paymentRequests: data?.paymentRequests || [],
    certificates: data?.certificates || [],
    summary: data?.summary || {},
    pendingCerts: data?.pendingWorkflow?.certificates || [],
    pendingPayments: data?.pendingWorkflow?.paymentRequests || [],
    pendingAll: data?.pendingWorkflow?.all || [],
  };
}
