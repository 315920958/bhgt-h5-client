# 百世千岁 H5 玩家端

React + Vite 的独立 H5 玩家端。它不是 Cocos 工程；Cocos 小游戏版本位于独立仓库 `bhgt-cocos-client`。

## 登录策略

1. 如果 TapTap 容器向页面注入了 `globalThis.tap.login`，优先调用真实 `tap.login()`，把一次性 `code` 交给服务端 `/api/auth/taptap-login`。
2. 普通浏览器没有该对象时，退回服务端的 TapTap 设备码扫码登录。

页面顶部会直接显示运行时探测结果，方便在 TapTap 包体/容器中验证：`tap` 是否存在、`tap.login` 是否为函数。

## 本地运行

```bash
npm install
npm run dev
```

默认 API 为 `https://develop.server.bhgt.sixonehub.site/api`。需要切换时，在启动前设置：

```bash
VITE_API_BASE_URL=https://your-api.example.com/api npm run dev
```

构建：

```bash
npm run build
```

构建完成后，项目根目录会生成 `bhgt-h5-client.zip`；这是已忽略的上传包，不会进入 Git。压缩包内以 `dist/` 为第一层目录，满足上传平台的目录结构要求。
