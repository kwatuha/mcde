import { AxiosError } from 'axios';

/** Extract a human-readable message from an API or network error. */
export function extractApiError(error: unknown): string {
  const err = error as AxiosError<{
    message?: string;
    error?: string;
    msg?: string;
    details?: string;
    missing?: string[];
  }>;
  const data = err?.response?.data;
  const status = err?.response?.status;

  if (data?.missing?.length) {
    const base = data.message || data.error || 'Required checklist items are missing.';
    return `${base}\n• ${data.missing.slice(0, 6).join('\n• ')}`;
  }

  const serverMsg =
    data?.message ||
    data?.error ||
    data?.msg ||
    (typeof data === 'string' ? data : null);

  if (serverMsg && data?.details && !String(serverMsg).includes(data.details)) {
    return `${serverMsg}\n${data.details}`;
  }
  if (serverMsg) return serverMsg;
  if (data?.details) return data.details;

  if (status === 401) return 'Session expired. Sign in again.';
  if (err?.message?.includes('Network Error')) {
    return 'Cannot reach the server. Check mobile data or Wi‑Fi.';
  }
  if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return 'Request timed out. Try again on a stronger connection.';
  }
  return err?.message || 'Request failed.';
}

/**
 * True only for transient connectivity failures — safe to queue for later sync.
 * Server errors (5xx) and validation/auth errors (4xx) are NOT queued.
 */
export function shouldQueueOffline(error: unknown): boolean {
  const err = error as AxiosError;
  const status = err?.response?.status;

  if (!err?.response) {
    return true;
  }
  if (status === 502 || status === 503 || status === 504) {
    return true;
  }
  return false;
}
