import { FormEvent, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, api, ApiError, type PlayerSession, type Role } from './api';

const TOKEN_KEY = 'bhgt.player.token';
type AuthMode = 'container' | 'device';
type LoginResult = { auth: string; nickname: string; avatar: string };

function getStoredToken(): string { return localStorage.getItem(TOKEN_KEY) || ''; }
function authHeader(token: string): HeadersInit { return { Authorization: `Bearer ${token}` }; }

async function deviceCodeLogin(
  onStatus: (text: string) => void,
  onQrCode: (rows: string[]) => void,
): Promise<LoginResult> {
  const start = await api<{ loginId: string; expiresIn: number; interval: number; qrcode_url?: string; qrRows?: string[] }>('/auth/taptap-device/start', { method: 'POST' });
  const payload = start.MESSAGE_BODY;
  if (!payload?.loginId) throw new Error('无法创建 TapTap 扫码登录');
  if (!payload.qrRows?.length) throw new Error('TapTap 未返回登录二维码');
  onQrCode(payload.qrRows);
  onStatus('浏览器环境：请使用 TapTap App 扫码确认登录');
  const deadline = Date.now() + payload.expiresIn * 1000;
  const interval = Math.max(2, payload.interval || 2);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    const result = await api<{ status?: 'pending' | 'complete'; nickname?: string; avatar?: string }>('/auth/taptap-device/status', {
      method: 'POST', body: JSON.stringify({ loginId: payload.loginId }),
    });
    if (result.MESSAGE_BODY?.status === 'complete' && result.auth) {
      return { auth: result.auth, nickname: result.MESSAGE_BODY.nickname || 'TapTap 玩家', avatar: result.MESSAGE_BODY.avatar || '' };
    }
  }
  throw new Error('二维码已过期，请重新点击登录');
}

async function containerLogin(): Promise<LoginResult> {
  const code = (await window.tap?.login?.())?.code;
  if (!code) throw new Error('TapTap 容器没有返回登录 code');
  const result = await api<{ nickname?: string; avatar?: string }>('/auth/taptap-login', {
    method: 'POST', body: JSON.stringify({ code }),
  });
  if (!result.auth) throw new Error(result.message || 'TapTap 服务端认证失败');
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
  const authMode: AuthMode = typeof window.tap?.login === 'function' ? 'container' : 'device';
  const diagnostic = useMemo(() => ({ tap: typeof window.tap, login: typeof window.tap?.login, mode: authMode }), [authMode]);

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

  const login = async () => {
    setBusy(true);
    try {
      setStatus(authMode === 'container' ? '正在调用 TapTap 容器登录...' : '正在创建扫码登录...');
      const result = authMode === 'container' ? await containerLogin() : await deviceCodeLogin(setStatus, setQrRows);
      localStorage.setItem(TOKEN_KEY, result.auth);
      setToken(result.auth);
      setQrRows([]);
      await loadPlayer(result.auth);
    } catch (error) {
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
      {token && !role && <form onSubmit={createRole} className="create"><h2>创建角色</h2><label>道号<input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="请输入你的名字" /></label><div className="gender">{([['male', '男'], ['female', '女'], ['other', '保密']] as const).map(([value, label]) => <button type="button" className={gender === value ? 'chosen' : ''} onClick={() => setGender(value)} key={value}>{label}</button>)}</div><button className="primary" disabled={busy}>开始新游戏</button></form>}
      {role && <section className="node"><p className="eyebrow">{role.node?.code || '当前节点'}</p><h2>{role.node?.title || role.node?.name || '修行开始'}</h2><p>{role.node?.text || '第一个节点正在等待你的选择。'}</p>{(role.node?.buttons || []).map((item, index) => <button className="choice" key={item.code || index}>{item.text || `选项 ${index + 1}`}</button>)}</section>}
      <p className="api">API：{API_BASE_URL}</p>
    </section>
  </main>;
}
