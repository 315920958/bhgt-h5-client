export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://develop.server.bhgt.sixonehub.site/api';

type ApiEnvelope<T> = {
  auth?: string;
  errCode?: number;
  message?: string;
  MESSAGE_BODY?: T;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: number) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || body.errCode) throw new ApiError(body.message || `请求失败 (${response.status})`, response.status, body.errCode);
  return body;
}

export type Role = {
  id: string;
  nickname: string;
  avatar: string;
  gender: string;
  age: number;
  node?: { code?: string; name?: string; title?: string; text?: string; buttons?: Array<{ code?: string; text?: string }> } | null;
};

export type PlayerSession = { nickname: string; avatar: string; hasTapTapBinding: boolean };
