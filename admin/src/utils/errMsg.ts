import axios from 'axios';

/** The server's `message`, else a fallback. Replaces `catch (e: any)`. */
export function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(e)) {
    const m = (e.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof m === 'string' && m) return m;
    if (!e.response) return 'Network error — is the API reachable?';
  }
  return fallback;
}

export function errStatus(e: unknown): number | undefined {
  return axios.isAxiosError(e) ? e.response?.status : undefined;
}

export function errData<T = Record<string, unknown>>(e: unknown): T | undefined {
  return axios.isAxiosError(e) ? (e.response?.data as T | undefined) : undefined;
}
