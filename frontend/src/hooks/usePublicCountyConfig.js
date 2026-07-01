import { useEffect, useState } from 'react';
import { fetchCountyConfig } from '../services/countyConfigService';

const defaultBranding = {
  loginTitle: 'County Government of Machakos',
  loginSubtitle: 'Monitoring County Management and Evaluation',
  republicLine: 'REPUBLIC OF KENYA',
  hasLogo: false,
};

/**
 * Load public tenant branding (login page — outside CountyConfigProvider).
 */
export function usePublicCountyConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCountyConfig();
        if (!cancelled) setConfig(data);
      } catch {
        if (!cancelled) setConfig(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const branding = config?.branding || defaultBranding;
  const loginTitle = branding.loginTitle || config?.county?.displayName || config?.organization?.name || defaultBranding.loginTitle;
  const loginSubtitle = branding.loginSubtitle || branding.systemName || defaultBranding.loginSubtitle;
  const logoUrl = branding.hasLogo ? '/api/county-config/logo' : null;

  return {
    config,
    loading,
    branding,
    loginTitle,
    loginSubtitle,
    logoUrl,
    labels: config?.labels || {},
    organization: config?.organization || {},
  };
}

export default usePublicCountyConfig;
