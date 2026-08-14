export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://develop.server.bhgt.sixonehub.site/api';

let authToken = '';

/** 登录恢复、登录成功和退出时更新；后续请求自动携带身份。 */
export function setApiAuthToken(token: string): void { authToken = token; }

/** 统一页面飘字事件，由应用根部的 Toast 容器显示。 */
export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent('bhgt:toast', { detail: { message } }));
}

type ApiEnvelope<T> = {
  auth?: string;
  errCode?: number;
  message?: string;
  MESSAGE_BODY?: T;
};

export class ApiError extends Error {
  public toastReported = false;
  constructor(message: string, public readonly status?: number, public readonly code?: number) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE_URL}${path}`;
  const method = options.method || 'GET';
  console.info('[BHGT][API] request', { method, url: path });
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...options.headers },
    });
  } catch (error) {
    console.error('[BHGT][API] network failure', { method, url: path, error });
    const apiError = new ApiError('网络连接失败，请稍后重试');
    apiError.toastReported = true;
    showToast(apiError.message);
    throw apiError;
  }
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  console.info('[BHGT][API] response', { method, url: path, status: response.status, ok: response.ok, errCode: body.errCode });
  if (!response.ok || body.errCode) {
    console.error('[BHGT][API] request failed', { method, url: path, status: response.status, errCode: body.errCode, message: body.message });
    const apiError = new ApiError(body.message || `请求失败 (${response.status})`, response.status, body.errCode);
    apiError.toastReported = true;
    showToast(apiError.message);
    throw apiError;
  }
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
