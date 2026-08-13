import { sys } from 'cc';

const PLAYER_AUTH_STORAGE_KEY = 'bhgt.auth';

/**
 * 服务端签发的 AES-GCM 密文 token。浏览器映射到 localStorage，
 * TapTap 小游戏包则由 Cocos 的 sys.localStorage 映射到宿主本地存储。
 */
export function getPlayerToken(): string {
  const token = sys.localStorage.getItem(PLAYER_AUTH_STORAGE_KEY) || '';
  console.info('[BHGT][AuthStorage] token read', { present: Boolean(token) });
  return token;
}

export function setPlayerToken(token: string): void {
  sys.localStorage.setItem(PLAYER_AUTH_STORAGE_KEY, token);
  console.info('[BHGT][AuthStorage] token saved', { present: Boolean(token) });
}

export function clearPlayerToken(): void {
  sys.localStorage.removeItem(PLAYER_AUTH_STORAGE_KEY);
  console.info('[BHGT][AuthStorage] token cleared');
}
