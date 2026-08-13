type DebugPayload = {
  event: string;
  details?: Record<string, unknown>;
};

function safeDetails(details: Record<string, unknown> = {}): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (/token|auth|code|secret|password|avatar|dataurl|authorization/i.test(key)) continue;
    result[key] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  return result;
}

/** 仅用于 develop/online-test；失败时静默，不影响正常业务。 */
export function reportClientDebug(apiBaseUrl: string, payload: DebugPayload): void {
  console.info('[BHGT][ClientDebug] report', payload.event, safeDetails(payload.details));
  if (!apiBaseUrl) {
    console.warn('[BHGT][ClientDebug] skipped: apiBaseUrl is empty');
    return;
  }
  const body = JSON.stringify({
    event: payload.event,
    details: safeDetails(payload.details),
    clientTime: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : 'taptap-minigame',
  });
  const tap = (globalThis as typeof globalThis & { tap?: { request?: Function } }).tap;
  try {
    if (typeof tap?.request === 'function') {
      tap.request({
        url: `${apiBaseUrl}/auth/client-debug`,
        method: 'POST',
        data: JSON.parse(body),
        header: { 'Content-Type': 'application/json' },
        success: (response: { statusCode?: number }) => console.info('[BHGT][ClientDebug] uploaded', response?.statusCode),
        fail: (error: unknown) => console.warn('[BHGT][ClientDebug] upload failed', error),
      });
      return;
    }
    if (typeof fetch === 'function') {
      void fetch(`${apiBaseUrl}/auth/client-debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then((response) => console.info('[BHGT][ClientDebug] uploaded', response.status))
        .catch((error) => console.warn('[BHGT][ClientDebug] upload failed', error));
    }
  } catch {
    // 调试上报绝不能反过来影响登录流程。
  }
}
