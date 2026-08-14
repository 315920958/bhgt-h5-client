/// <reference types="vite/client" />

declare global {
  interface Window {
    tap?: {
      login?: () => Promise<{ code?: string }>;
      getSetting?: (options: { success?: (result: { authSetting?: Record<string, boolean> }) => void; fail?: (error: unknown) => void }) => void;
      getUserInfo?: (options: { success?: (result: { userInfo?: { nickName?: string; avatarUrl?: string } }) => void; fail?: (error: unknown) => void }) => void;
      createUserInfoButton?: (options: {
        type: 'text'; text: string; style: Record<string, string | number>;
      }) => {
        onTap: (callback: (result: { userInfo?: { nickName?: string; avatarUrl?: string }; errMsg?: string }) => void) => void;
        destroy?: () => void;
      };
    };
  }
}

export {};
