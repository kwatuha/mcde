import axiosInstance from './axiosInstance';

function resolveApiBaseUrl() {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
      ? import.meta.env.VITE_API_URL
      : '/api';
  const trimmed = String(base).replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${window.location.origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

const mobileAppService = {
  getRelease: async () => {
    const response = await axiosInstance.get('/mobile-app/release');
    return response.data;
  },

  /** Stream download via browser (avoids axios 60s timeout on large APKs). */
  downloadApk: async (fallbackFileName = 'machakos-collector.apk') => {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      throw new Error('Please sign in again to download the app.');
    }
    const url = `${resolveApiBaseUrl()}/mobile-app/download?access_token=${encodeURIComponent(token)}`;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fallbackFileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { fileName: fallbackFileName };
  },

  uploadRelease: async (file, meta) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', (meta?.version || '').trim());
    if (meta?.releaseNotes != null && String(meta.releaseNotes).trim()) {
      formData.append('releaseNotes', String(meta.releaseNotes).trim());
    }
    const response = await axiosInstance.post('/mobile-app/upload', formData);
    return response.data;
  },

  dismissRelease: async () => {
    const response = await axiosInstance.post('/mobile-app/release/dismiss');
    return response.data;
  },

  getUsageReport: async () => {
    const response = await axiosInstance.get('/mobile-app/usage');
    return response.data;
  },
};

export default mobileAppService;
