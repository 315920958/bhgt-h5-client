import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import VConsole from 'vconsole';
import App from './App';
import './styles.css';

// H5 测试包没有浏览器开发者工具，始终提供屏幕内日志入口。
new VConsole({ theme: 'dark' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
