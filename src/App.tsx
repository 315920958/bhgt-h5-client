import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, api, ApiError, type PlayerSession, type Role } from './api';

const TOKEN_KEY = 'bhgt.player.token';
type AuthMode = 'container' | 'device';
type LoginResult = { auth: string; nickname: string; avatar: string };
type TapUserInfo = { nickName?: string; avatarUrl?: string };
type TapUserInfoButton = {
  onTap: (callback: (result: { userInfo?: TapUserInfo; errMsg?: string }) => void) => void;
  destroy?: () => void;
};

function getStoredToken(): string { return localStorage.getItem(TOKEN_KEY) || ''; }
function authHeader(token: string): HeadersInit { return { Authorization: `Bearer ${token}` }; }

function getTapUserInfoPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.tap?.getSetting) return resolve(false);
    window.tap.getSetting({
      success: (result) => resolve(Boolean(result.authSetting?.['scope.userInfo'])),
      fail: () => resolve(false),
    });
  });
}

function getTapUserInfo(): Promise<TapUserInfo> {
  return new Promise((resolve, reject) => {
    if (!window.tap?.getUserInfo) return reject(new Error('当前容器未提供 tap.getUserInfo'));
    window.tap.getUserInfo({
      success: (result) => resolve(result.userInfo || {}),
      fail: (error) => reject(error),
    });
  });
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
  const tapProfileButtonTarget = useRef<HTMLDivElement | null>(null);
  const authMode: AuthMode = typeof window.tap?.login === 'function' ? 'container' : 'device';
  const diagnostic = useMemo(() => ({ tap: typeof window.tap, login: typeof window.tap?.login, mode: authMode }), [authMode]);

  useEffect(() => {
    console.info('[BHGT][Auth] runtime diagnostics', diagnostic);
  }, [diagnostic]);

  const loadPlayer = async (activeToken: string) => {
    const [sessionResult, roleResult] = await Promise.all([
      api<PlayerSession>('/auth/session', { headers: authHeader(activeToken) }),
      api<{ hasRole: boolean; role: Role | null }>('/game/role', { headers: authHeader(activeToken) }),
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
        localStorage.removeItem(TOKEN_KEY); setToken('');
      }
      setStatus(`恢复登录失败：${error instanceof Error ? error.message : '未知错误'}`);
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
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ nickname: nicknameFromTapTap, avatar: avatarFromTapTap }),
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
        setProfileAuthorization('当前容器未提供头像昵称授权；你仍可直接创建角色');
        return;
      }
      const rect = target.getBoundingClientRect();
      nativeButton = tap.createUserInfoButton({
        type: 'text', text: '使用 TapTap 昵称与头像',
        style: {
          left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height),
          lineHeight: Math.round(rect.height), backgroundColor: '#31bfac', color: '#ffffff', textAlign: 'center', fontSize: 16, borderRadius: 10,
        },
      });
      nativeButton.onTap(async (result) => {
        if (destroyed) return;
        try {
          if (!result.userInfo) throw new Error(result.errMsg || '未授权 TapTap 公开资料');
          await persistProfile(result.userInfo);
        } catch (error) {
          console.warn('[BHGT][Auth] TapTap public profile authorization not completed', error);
          setProfileAuthorization('未授权头像昵称；你仍可直接创建角色');
        }
      });
      setProfileAuthorization('可选：使用 TapTap 昵称与头像');
    };

    void getTapUserInfoPermission().then(async (authorized) => {
      if (destroyed) return;
      if (authorized) {
        try { await persistProfile(await getTapUserInfo()); }
        catch (error) { console.warn('[BHGT][Auth] existing TapTap profile permission could not be read', error); installNativeButton(); }
        return;
      }
      window.setTimeout(installNativeButton, 0);
    });

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
      setStatus(`登录失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally { setBusy(false); }
  };

  const createRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !nickname.trim()) return;
    setBusy(true); setStatus('正在创建角色...');
    try {
      const result = await api<{ role: Role }>('/game/start', {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ nickname: nickname.trim(), gender, avatar: session?.avatar || '' }),
      });
      setRole(result.MESSAGE_BODY?.role || null);
      setStatus('角色创建成功，已进入第一个节点');
    } catch (error) { setStatus(`创建角色失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setBusy(false); }
  };

  const logout = () => { localStorage.removeItem(TOKEN_KEY); setToken(''); setRole(null); setSession(null); setStatus('已退出登录'); };

  return <main className="app-shell">
    <section className="card">
      <div className="runtime">容器探测 · tap: {diagnostic.tap} · tap.login: {diagnostic.login}</div>
      <h1>百世千岁</h1><p className="subtitle">一念入局，百世修行</p><p className="description">一段从选择开始的修行旅途</p>
      {session && <div className="profile">{session.avatar ? <img src={session.avatar} alt="TapTap 头像" /> : <span>{session.nickname.slice(0, 1)}</span>}<div><strong>{session.nickname}</strong><small>TapTap 已登录</small></div><button className="secondary" onClick={logout}>退出</button></div>}
      {!token && <button className="primary" disabled={busy} onClick={login}>{busy ? '认证中...' : 'TapTap 登录'}</button>}
      <p className="status">{status}</p>
      {qrRows.length > 0 && <div className="qr" aria-label="TapTap 登录二维码">{qrRows.map((row, y) => <div className="qr-row" key={y}>{[...row].map((cell, x) => <i className={cell === '1' ? 'dark' : ''} key={x} />)}</div>)}</div>}
      {!token && <p className="hint">{authMode === 'container' ? '检测到 TapTap 容器，将调用 tap.login()' : '普通浏览器将使用 TapTap 扫码登录'}</p>}
      {token && !role && <form onSubmit={createRole} className="create"><h2>创建角色</h2>{authMode === 'container' && session && !session.avatar && <><div className="tap-profile-target" ref={tapProfileButtonTarget}>使用 TapTap 昵称与头像</div><p className="profile-hint">{profileAuthorization || '正在检查 TapTap 资料授权…'}<br />授权是可选的；不同意也可以自定义道号。</p></>}<label>道号<input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="请输入你的名字" /></label><div className="gender">{([['male', '男'], ['female', '女'], ['other', '保密']] as const).map(([value, label]) => <button type="button" className={gender === value ? 'chosen' : ''} onClick={() => setGender(value)} key={value}>{label}</button>)}</div><button className="primary" disabled={busy}>开始新游戏</button></form>}
      {role && <section className="node"><p className="eyebrow">{role.node?.code || '当前节点'}</p><h2>{role.node?.title || role.node?.name || '修行开始'}</h2><p>{role.node?.text || '第一个节点正在等待你的选择。'}</p>{(role.node?.buttons || []).map((item, index) => <button className="choice" key={item.code || index}>{item.text || `选项 ${index + 1}`}</button>)}</section>}
      <p className="api">API：{API_BASE_URL}</p>
    </section>
  </main>;
}
