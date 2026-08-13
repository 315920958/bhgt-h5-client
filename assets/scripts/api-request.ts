import { reportClientDebug } from './client-debug';

export type ApiResponse = {
  status: number;
  statusCode: number;
  ok: boolean;
  json: <T = any>() => Promise<T>;
};

type TapRequest = {
  request?: (options: {
    url: string;
    method?: string;
    data?: any;
    header?: Record<string, string>;
    dataType?: string;
    responseType?: string;
    timeout?: number;
    success?: (response: { data: any; statusCode: number }) => void;
    fail?: (error: any) => void;
  }) => any;
};

function parseData<T>(data: any): T {
  if (typeof data === 'string') return JSON.parse(data) as T;
  return data as T;
}

function getApiBaseUrl(url: string, configuredBaseUrl?: string): string {
  return configuredBaseUrl || url.replace(/\/(?:auth|game)\/.*$/, '');
}

function getPath(url: string): string {
  const withoutQuery = url.split('?')[0];
  const schemeIndex = withoutQuery.indexOf('://');
  if (schemeIndex >= 0) {
    const pathIndex = withoutQuery.indexOf('/', schemeIndex + 3);
    return pathIndex >= 0 ? withoutQuery.slice(pathIndex) : '/';
  }
  return withoutQuery;
}

/** 浏览器使用 fetch；TapTap 小游戏容器使用宿主提供的 tap.request。 */
export async function apiRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; apiBaseUrl?: string } = {},
): Promise<ApiResponse> {
  const tap = (globalThis as typeof globalThis & { tap?: TapRequest }).tap;
  if (typeof tap?.request === 'function') {
    return new Promise((resolve, reject) => {
      tap.request({
        url,
        method: options.method || 'GET',
        data: options.body ? parseData(options.body) : undefined,
        header: options.headers,
        dataType: 'json',
        timeout: 10000,
        success: (response) => {
          const statusCode = response.statusCode || 200;
          if (statusCode < 200 || statusCode >= 300) {
            reportClientDebug(getApiBaseUrl(url, options.apiBaseUrl), {
              event: 'api-response-error',
              details: { path: getPath(url), method: options.method || 'GET', statusCode },
            });
          }
          resolve({
            status: statusCode,
            statusCode,
            ok: statusCode >= 200 && statusCode < 300,
            json: async <T>() => parseData<T>(response.data),
          });
        },
        fail: (error) => {
          reportClientDebug(getApiBaseUrl(url, options.apiBaseUrl), {
            event: 'api-request-failed',
            details: { path: getPath(url), method: options.method || 'GET', error: error?.errMsg || String(error) },
          });
          reject(error);
        },
      });
    });
  }

  if (typeof fetch !== 'function') {
    throw new Error('当前运行环境没有可用的网络请求能力');
  }
  let response: Response;
  try {
    response = await fetch(url, options as RequestInit);
  } catch (error) {
    reportClientDebug(getApiBaseUrl(url, options.apiBaseUrl), {
      event: 'api-request-failed',
      details: { path: getPath(url), method: options.method || 'GET', error: String(error) },
    });
    throw error;
  }
  return {
    status: response.status,
    statusCode: response.status,
    ok: response.ok,
    json: () => response.json(),
  };
}
