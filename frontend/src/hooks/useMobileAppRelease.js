import { useEffect, useState } from 'react';
import mobileAppService from '../api/mobileAppService';

export default function useMobileAppRelease(enabled = true) {
  const [loading, setLoading] = useState(Boolean(enabled));
  const [releaseInfo, setReleaseInfo] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setReleaseInfo(null);
      setLoading(false);
      return undefined;
    }

    let isMounted = true;
    setLoading(true);
    mobileAppService
      .getRelease()
      .then((data) => {
        if (isMounted) setReleaseInfo(data);
      })
      .catch(() => {
        if (isMounted) setReleaseInfo(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  return {
    loading,
    releaseInfo,
    available: Boolean(releaseInfo?.available && releaseInfo?.release),
    release: releaseInfo?.release || null,
    isNewForUser: Boolean(releaseInfo?.isNewForUser),
  };
}
