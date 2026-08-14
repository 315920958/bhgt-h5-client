import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // TapTap 从 ZIP 内 dist/index.html 启动，不保证静态资源挂在站点根路径。
  // 使用相对路径，避免默认的 /assets/... 被解析为宿主根目录而导致白屏。
  base: './',
  plugins: [react()],
});
