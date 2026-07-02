import { useCallback, useEffect, useRef, useState } from 'react';
import engineerWorkspaceService from '../../api/engineerWorkspaceService';

export function useEngineerWorkspaceData({ initialSearch = '', autoLoad = true } = {}) {
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [search, setSearch] = useState(initialSearch);
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const load = useCallback(async (searchOverride) => {
    setLoading(true);
    setError('');
    try {
      const q = searchOverride !== undefined ? searchOverride : searchRef.current;
      const payload = await engineerWorkspaceService.getWorkspace({
        search: String(q || '').trim() || undefined,
        limit: 120,
      });
      setData(payload);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load engineer workspace');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load]);

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
  };
}
