export type PlatformLoginResult =
  | { platform: 'taptap-minigame'; code: string }
  | { platform: 'taptap-device-code'; auth: string; nickname: string; avatar: string };

import { apiRequest } from './api-request';
import { reportClientDebug } from './client-debug';

export type DeviceQrCode = {
  size: number;
  rows: string[];
  expiresIn: number;
};

export interface PlatformAuthOptions {
  apiBaseUrl: string;
  onDeviceQrCode?: (qr: DeviceQrCode) => void;
  onDeviceWaiting?: () => void;
}

export interface PlatformAuth {
  login(options: PlatformAuthOptions): Promise<PlatformLoginResult>;
}

type TapRuntime = {
  login?: () => Promise<{ code?: string }>;
  getSetting?: (options: {
    success?: (result: { authSetting?: Record<string, boolean> }) => void;
    fail?: (error: unknown) => void;
  }) => void;
  getUserInfo?: (options: {
    withCredentials?: boolean;
    lang?: string;
    success?: (result: {
      userInfo?: {
        nickName?: string;
        avatarUrl?: string;
        language?: string;
      };
    }) => void;
    fail?: (error: unknown) => void;
  }) => void;
};

/**
 * 仅用于真机联调确认宿主身份能力，不输出签名或加密数据。
 * 用户未授权 scope.userInfo 时只记录授权状态，不影响 tap.login 主流程。
 */
function logTapTapUserProfile(tap: TapRuntime): void {
  if (typeof tap.getSetting !== 'function') {
    console.warn('[BHGT][Auth] TapTap user profile diagnostic unavailable', {
      getSettingType: typeof tap.getSetting,
      getUserInfoType: typeof tap.getUserInfo,
    });
    return;
  }

  tap.getSetting({
    success: (setting) => {
      const authorized = setting.authSetting?.['scope.userInfo'] === true;
      console.info('[BHGT][Auth] TapTap user profile permission', {
        scopeUserInfo: authorized,
        getUserInfoType: typeof tap.getUserInfo,
      });
      if (!authorized || typeof tap.getUserInfo !== 'function') {
        console.warn('[BHGT][Auth] TapTap nickname/avatar unavailable: scope.userInfo is not authorized');
        return;
      }

      tap.getUserInfo({
        withCredentials: false,
        lang: 'zh_CN',
        success: (result) => {
          const profile = result.userInfo;
          console.info('[BHGT][Auth] TapTap user profile received', {
            nickname: profile?.nickName || '',
            avatarUrl: profile?.avatarUrl || '',
            language: profile?.language || '',
          });
        },
        fail: (error) => {
          console.warn('[BHGT][Auth] TapTap getUserInfo failed', error);
        },
      });
    },
    fail: (error) => {
      console.warn('[BHGT][Auth] TapTap getSetting failed', error);
    },
  });
}

/** TapTap 小游戏容器：使用宿主注入的真实 tap.login。 */
export class TapTapMiniGameAuth implements PlatformAuth {
  async login(): Promise<PlatformLoginResult> {
    const tap = (globalThis as typeof globalThis & { tap?: TapRuntime }).tap;
    console.info('[BHGT][Auth] TapTapMiniGameAuth.login entered', {
      tapPresent: Boolean(tap),
      loginType: typeof tap?.login,
      requestType: typeof (tap as TapRuntime & { request?: unknown })?.request,
    });
    if (typeof tap?.login !== 'function') {
      throw new Error('当前运行环境没有 TapTap 小游戏登录能力');
    }
    console.info('[BHGT][Auth] calling real tap.login()');
    const result = await tap.login();
    console.info('[BHGT][Auth] tap.login() resolved', {
      hasCode: Boolean(result?.code),
      code: result?.code || '',
      codeLength: result?.code?.length || 0,
      warning: '一次性登录凭证，仅用于当前真机联调，请勿公开',
    });
    if (!result?.code) throw new Error('TapTap 登录没有返回 code');
    logTapTapUserProfile(tap);
    return { platform: 'taptap-minigame', code: result.code };
  }
}

/** 普通浏览器：使用 TapTap 官方 OAuth2 设备码扫码登录，不生成模拟身份。 */
export class TapTapDeviceCodeAuth implements PlatformAuth {
  async login(options: PlatformAuthOptions): Promise<PlatformLoginResult> {
    console.info('[BHGT][Auth] requesting real TapTap device code');
    console.info('[BHGT][Auth] device login endpoint', { apiBaseUrl: options.apiBaseUrl });
    const startResponse = await apiRequest(`${options.apiBaseUrl}/auth/taptap-device/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const startBody = await startResponse.json() as {
      MESSAGE_BODY?: {
        loginId: string;
        expiresIn: number;
        interval: number;
        qrSize: number;
        qrRows: string[];
      };
      message?: string;
    };
    const start = startBody.MESSAGE_BODY;
    if (!startResponse.ok || !start?.loginId || !start.qrRows?.length) {
      throw new Error(startBody.message || '无法生成 TapTap 登录二维码');
    }

    options.onDeviceQrCode?.({
      size: start.qrSize,
      rows: start.qrRows,
      expiresIn: start.expiresIn,
    });
    options.onDeviceWaiting?.();

    const deadline = Date.now() + start.expiresIn * 1000;
    let waitSeconds = Math.max(2, start.interval || 2);
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitSeconds * 1000));
      const pollResponse = await apiRequest(`${options.apiBaseUrl}/auth/taptap-device/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: start.loginId }),
      });
      const pollBody = await pollResponse.json() as {
        auth?: string;
        MESSAGE_BODY?: {
          status?: 'pending' | 'complete';
          retryAfter?: number;
          nickname?: string;
          avatar?: string;
        };
        message?: string;
      };
      if (!pollResponse.ok) throw new Error(pollBody.message || 'TapTap 扫码登录失败');
      if (pollBody.MESSAGE_BODY?.status === 'complete' && pollBody.auth) {
        console.info('[BHGT][Auth] TapTap device authorization complete');
        return {
          platform: 'taptap-device-code',
          auth: pollBody.auth,
          nickname: pollBody.MESSAGE_BODY.nickname || 'TapTap 玩家',
          avatar: pollBody.MESSAGE_BODY.avatar || '',
        };
      }
      waitSeconds = Math.max(2, pollBody.MESSAGE_BODY?.retryAfter || start.interval || 2);
    }
    throw new Error('TapTap 登录二维码已过期，请重新点击登录');
  }
}

export function createPlatformAuth(): PlatformAuth {
  const tap = (globalThis as typeof globalThis & { tap?: TapRuntime }).tap;
  console.info('[BHGT][Auth] runtime detection', {
    tapType: typeof tap,
    tapLoginType: typeof tap?.login,
  });
  return typeof tap?.login === 'function'
    ? new TapTapMiniGameAuth()
    : new TapTapDeviceCodeAuth();
}
