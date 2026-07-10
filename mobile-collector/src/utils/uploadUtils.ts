import { Platform } from 'react-native';
import { AxiosError } from 'axios';

/** Normalize camera/gallery URIs for React Native multipart uploads. */
export function normalizeUploadUri(uri: string): string {
  const trimmed = String(uri || '').trim();
  if (!trimmed) return trimmed;
  if (Platform.OS === 'ios' && trimmed.startsWith('file://')) {
    return trimmed;
  }
  return trimmed;
}

export function toUploadHttpError(
  status: number,
  data: Record<string, unknown> | null,
  fallback: string
): AxiosError {
  const err = new Error(fallback) as AxiosError;
  err.response = {
    status,
    data: data || { message: fallback },
    headers: {},
    config: {},
    statusText: String(status),
  };
  return err;
}

export function toNetworkError(message = 'Network Error'): AxiosError {
  const err = new Error(message) as AxiosError;
  return err;
}

export async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = await response.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
