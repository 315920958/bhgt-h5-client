import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, api, ApiError, setApiAuthToken, showToast, type PlayerSession, type Role } from './api';

const TOKEN_KEY = 'bhgt.player.token';
type AuthMode = 'container' | 'device';
type LoginResult = { auth: string; nickname: string; avatar: string };
type TapUserInfo = { nickName?: string; avatarUrl?: string };
type TapUserInfoButton = {
  onTap: (callback: (result: { userInfo?: TapUserInfo; errMsg?: string }) => void) => void;
  destroy?: () => void;
};

function getStoredToken(): string { return localStorage.getItem(TOKEN_KEY) || ''; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '发生未知错误'; }
function reportError(error: unknown): void {
  if (!(error instanceof ApiError && error.toastReported)) showToast(errorMessage(error));
}

async function deviceCodeLogin(
  onStatus: (text: string) => void,
  onQrCode: (rows: string[]) => void,
): Promise<LoginResult> {
  console.info('[BHGT][Auth] device-code login entered');
  const start = await api<{ loginId: string; expiresIn: number; interval: number; qrcode_url?: string; qrRows?: string[] }>('/auth/taptap-device/start', { method: 'POST' });
  const payload = start.MESSAGE_BODY;
  if (!payload?.loginId) throw new Error('无法创建 TapTap 扫码登录');
  if (!payload.qrRows?.length) throw new Error('TapTap 未返回登录二维码');
  onQrCode(payload.qrRows);
  console.info('[BHGT][Auth] device-code QR received', { loginIdPresent: true, expiresIn: payload.expiresIn, qrRows: payload.qrRows.length });
  onStatus('浏览器环境：请使用 TapTap App 扫码确认登录');
  const deadline = Date.now() + payload.expiresIn * 1000;
  const interval = Math.max(2, payload.interval || 2);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    const result = await api<{ status?: 'pending' | 'complete'; nickname?: string; avatar?: string }>('/auth/taptap-device/status', {
      method: 'POST', body: JSON.stringify({ loginId: payload.loginId }),
    });
    if (result.MESSAGE_BODY?.status === 'complete' && result.auth) {
      console.info('[BHGT][Auth] device-code authorization complete');
      return { auth: result.auth, nickname: result.MESSAGE_BODY.nickname || 'TapTap 玩家', avatar: result.MESSAGE_BODY.avatar || '' };
    }
  }
  throw new Error('二维码已过期，请重新点击登录');
}

async function containerLogin(): Promise<LoginResult> {
  console.info('[BHGT][Auth] container login entered', { tapType: typeof window.tap, tapLoginType: typeof window.tap?.login });
  console.info('[BHGT][Auth] calling tap.login()');
  const loginResult = await window.tap?.login?.();
  const code = loginResult?.code;
  console.info('[BHGT][Auth] tap.login() resolved', {
    hasCode: Boolean(code),
    code: code || '',
    codeLength: code?.length || 0,
    warning: '一次性登录凭证，仅用于当前真机联调，请勿公开',
  });
  if (!code) throw new Error('TapTap 容器没有返回登录 code');
  console.info('[BHGT][Auth] sending one-time code to backend', { endpoint: '/auth/taptap-h5-login' });
  const result = await api<{ nickname?: string; avatar?: string }>('/auth/taptap-h5-login', {
    method: 'POST', body: JSON.stringify({ code }),
  });
  if (!result.auth) throw new Error(result.message || 'TapTap 服务端认证失败');
  console.info('[BHGT][Auth] backend TapTap authentication complete', {
    nickname: result.MESSAGE_BODY?.nickname || '',
    avatarPresent: Boolean(result.MESSAGE_BODY?.avatar),
  });
  return { auth: result.auth, nickname: result.MESSAGE_BODY?.nickname || 'TapTap 玩家', avatar: result.MESSAGE_BODY?.avatar || '' };
}

export default function App() {
  const [token, setToken] = useState(getStoredToken);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState('正在检查登录状态...');
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other');
  const [qrRows, setQrRows] = useState<string[]>([]);
  const [profileAuthorization, setProfileAuthorization] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const tapProfileButtonTarget = useRef<HTMLDivElement | null>(null);
  const authMode: AuthMode = typeof window.tap?.login === 'function' ? 'container' : 'device';
  const diagnostic = useMemo(() => ({ tap: typeof window.tap, login: typeof window.tap?.login, mode: authMode }), [authMode]);

  useEffect(() => {
    console.info('[BHGT][Auth] runtime diagnostics', diagnostic);
  }, [diagnostic]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message || '操作失败，请稍后重试';
      const id = Date.now() + Math.random();
      setToasts((items) => [...items, { id, message }].slice(-3));
      window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
    };
    window.addEventListener('bhgt:toast', onToast);
    return () => window.removeEventListener('bhgt:toast', onToast);
  }, []);

  useEffect(() => { setApiAuthToken(token); }, [token]);

  const loadPlayer = async (activeToken: string) => {
    setApiAuthToken(activeToken);
    const [sessionResult, roleResult] = await Promise.all([
      api<PlayerSession>('/auth/session'),
      api<{ hasRole: boolean; role: Role | null }>('/game/role'),
    ]);
    const nextSession = sessionResult.MESSAGE_BODY;
    if (!nextSession?.hasTapTapBinding) throw new Error('本地登录态不包含 TapTap 身份');
    setSession(nextSession);
    setRole(roleResult.MESSAGE_BODY?.role || null);
    setNickname(roleResult.MESSAGE_BODY?.role?.nickname || nextSession.nickname || '');
    setStatus(roleResult.MESSAGE_BODY?.hasRole ? '登录成功，可以进入游戏' : '登录成功，请创建角色');
  };

  useEffect(() => {
    if (!token) { setStatus('请选择 TapTap 登录进入游戏'); return; }
    loadPlayer(token).catch((error) => {
      if (error instanceof ApiError && [10002, 10003].includes(error.code || 0)) {
        localStorage.removeItem(TOKEN_KEY); setApiAuthToken(''); setToken('');
      }
      setStatus(`恢复登录失败：${errorMessage(error)}`);
    });
  }, []);

  useEffect(() => {
    if (!token || role || !session || session.avatar || authMode !== 'container') return;
    const tap = window.tap;
    let destroyed = false;
    let nativeButton: TapUserInfoButton | undefined;

    const persistProfile = async (profile: TapUserInfo) => {
      const nicknameFromTapTap = String(profile.nickName || '').trim();
      const avatarFromTapTap = String(profile.avatarUrl || '').trim();
      if (!nicknameFromTapTap && !avatarFromTapTap) throw new Error('TapTap 未返回昵称或头像');
      const result = await api<{ nickname?: string; avatar?: string }>('/auth/taptap-profile', {
        method: 'POST', body: JSON.stringify({ nickname: nicknameFromTapTap, avatar: avatarFromTapTap }),
      });
      const nextNickname = result.MESSAGE_BODY?.nickname || nicknameFromTapTap || session.nickname;
      const nextAvatar = result.MESSAGE_BODY?.avatar || avatarFromTapTap;
      setSession((current) => current ? { ...current, nickname: nextNickname, avatar: nextAvatar } : current);
      setNickname(nextNickname);
      setProfileAuthorization('已使用 TapTap 昵称与头像');
      setStatus('已取得 TapTap 公开资料，请确认道号并创建角色');
      console.info('[BHGT][Auth] TapTap public profile authorized', { nicknamePresent: Boolean(nextNickname), avatarPresent: Boolean(nextAvatar) });
    };

    const installNativeButton = () => {
      const target = tapProfileButtonTarget.current;
      if (!target || !tap?.createUserInfoButton) {
        console.warn('[BHGT][Auth] tap.createUserInfoButton unavailable', { targetPresent: Boolean(target), apiType: typeof tap?.createUserInfoButton });
        setProfileAuthorization('当前容器未提供头像昵称授权；你仍可直接创建角色');
        return;
      }
      const rect = target.getBoundingClientRect();
      console.info('[BHGT][Auth] creating TapTap public profile button', { width: Math.round(rect.width), height: Math.round(rect.height) });
      nativeButton = tap.createUserInfoButton({
        type: 'text', text: '授权 TapTap 资料',
        style: {
          left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height),
          lineHeight: Math.round(rect.height), backgroundColor: '#31bfac', color: '#ffffff', textAlign: 'center', fontSize: 14, borderRadius: 10,
        },
      });
      nativeButton.onTap(async (result) => {
        if (destroyed) return;
        console.info('[BHGT][Auth] TapTap public profile button tapped', { hasUserInfo: Boolean(result.userInfo), errMsg: result.errMsg || '' });
        try {
          if (!result.userInfo) throw new Error(result.errMsg || '未授权 TapTap 公开资料');
          await persistProfile(result.userInfo);
        } catch (error) {
          console.warn('[BHGT][Auth] TapTap public profile authorization not completed', error);
          reportError(error);
          setProfileAuthorization('未授权头像昵称；你仍可直接创建角色');
        }
      });
      setProfileAuthorization('点击按钮后可授权昵称与头像');
    };

    // 不预先读取用户资料。只有玩家点击此原生按钮时，TapTap 才会弹出授权并返回昵称头像。
    window.setTimeout(installNativeButton, 0);

    return () => { destroyed = true; nativeButton?.destroy?.(); };
  }, [authMode, role, session, token]);

  const login = async () => {
    setBusy(true);
    try {
      console.info('[BHGT][Auth] login clicked', { mode: authMode, diagnostic });
      setStatus(authMode === 'container' ? '正在调用 TapTap 容器登录...' : '正在创建扫码登录...');
      const result = authMode === 'container' ? await containerLogin() : await deviceCodeLogin(setStatus, setQrRows);
      localStorage.setItem(TOKEN_KEY, result.auth);
      setToken(result.auth);
      setQrRows([]);
      await loadPlayer(result.auth);
    } catch (error) {
      console.error('[BHGT][Auth] login flow failed', error);
      reportError(error);
      setStatus(`登录失败：${errorMessage(error)}`);
    } finally { setBusy(false); }
  };

  const createRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !nickname.trim()) return;
    setBusy(true); setStatus('正在创建角色...');
    try {
      const result = await api<{ role: Role }>('/game/start', {
        method: 'POST', body: JSON.stringify({ nickname: nickname.trim(), gender, avatar: session?.avatar || '' }),
      });
      setRole(result.MESSAGE_BODY?.role || null);
      setStatus('角色创建成功，已进入第一个节点');
    } catch (error) { reportError(error); setStatus(`创建角色失败：${errorMessage(error)}`); }
    finally { setBusy(false); }
  };

  const logout = () => { localStorage.removeItem(TOKEN_KEY); setApiAuthToken(''); setToken(''); setRole(null); setSession(null); setStatus('已退出登录'); };

  return <main className="app-shell">
    <div aria-live="polite" style={{ position: 'fixed', zIndex: 10000, left: '50%', top: 18, width: 'min(86vw, 360px)', transform: 'translateX(-50%)', display: 'grid', gap: 8, pointerEvents: 'none' }}>{toasts.map((toast) => <div key={toast.id} style={{ padding: '11px 15px', borderRadius: 10, background: 'rgba(12, 17, 24, .94)', border: '1px solid #4c6472', color: '#f7edcd', boxShadow: '0 8px 26px #0008', textAlign: 'center', fontSize: 14, lineHeight: 1.45 }}>{toast.message}</div>)}</div>
    <section className="card">
      <h1>百世千岁</h1><p className="subtitle">一念入局，百世修行</p><p className="description">一段从选择开始的修行旅途</p>
      {session && <div className="profile">{session.avatar ? <img src={session.avatar} alt="TapTap 头像" /> : <span>{session.nickname.slice(0, 1)}</span>}<div><strong>{session.nickname}</strong><small>TapTap 已登录</small></div><button className="secondary" onClick={logout}>退出</button></div>}
      {!token && <button className="primary" disabled={busy} onClick={login}>{busy ? '认证中...' : 'TapTap 登录'}</button>}
      <p className="status">{status}</p>
      {qrRows.length > 0 && <div className="qr" aria-label="TapTap 登录二维码">{qrRows.map((row, y) => <div className="qr-row" key={y}>{[...row].map((cell, x) => <i className={cell === '1' ? 'dark' : ''} key={x} />)}</div>)}</div>}
      {!token && <p className="hint">{authMode === 'container' ? '检测到 TapTap 容器，将调用 tap.login()' : '普通浏览器将使用 TapTap 扫码登录'}</p>}
      {token && !role && <form onSubmit={createRole} className="create"><h2>创建角色</h2>{authMode === 'container' && session && !session.avatar && <><div className="tap-profile-target" ref={tapProfileButtonTarget}>授权 TapTap 资料</div><p className="profile-hint">{profileAuthorization || '等待玩家主动授权…'}<br />授权是可选的；不同意也可以自定义道号。</p></>}<label>道号<input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="请输入你的名字" /></label><div className="gender">{([['male', '男'], ['female', '女'], ['other', '保密']] as const).map(([value, label]) => <button type="button" className={gender === value ? 'chosen' : ''} onClick={() => setGender(value)} key={value}>{label}</button>)}</div><button className="primary" disabled={busy}>开始新游戏</button></form>}
      {role && <section className="node"><p className="eyebrow">{role.node?.code || '当前节点'}</p><h2>{role.node?.title || role.node?.name || '修行开始'}</h2><p>{role.node?.text || '第一个节点正在等待你的选择。'}</p>{(role.node?.buttons || []).map((item, index) => <button className="choice" key={item.code || index}>{item.text || `选项 ${index + 1}`}</button>)}</section>}
      <p className="api">API：{API_BASE_URL}</p>
    </section>
  </main>;
}
