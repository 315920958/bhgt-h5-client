# BHGT Cocos 客户端

这是 BHGT 的 Cocos Creator 3.8.8 2D 项目。

## 当前结构

- `assets/scenes/Main.scene`：2D 主场景，包含 Canvas 与 Camera。
- `assets/scripts/Main.ts`：代码生成首页界面和 TapTap 登录按钮。
- `assets/scripts/platform-auth.ts`：Chrome Mock 登录 / TapTap 容器登录适配层。

当前 Chrome / Web Mobile 预览会显示 TapTap 登录按钮；进入 TapTap 小游戏调试容器后，会自动切换为运行时注入的真实 `tap.login()`。

## 运行环境配置

启动时按以下顺序读取配置；前一个配置生效后，后面的配置会被忽略：

1. `config/runtime-config.production.local.json`
2. `config/runtime-config.local.json`
3. 公共配置 `config/runtime-config.json`

前两个本地配置文件不存在，或设置了 `"enabled": false`，都会视为未生效并继续读取下一个配置。

日常本地配置文件是：

```text
config/runtime-config.local.json
```

该文件已加入 `.gitignore`，不会提交到 Git。没有生效的本地配置时，程序读取公共配置：

```text
config/runtime-config.json
```

公共配置保持自动判断：本地 `localhost` 使用 `http://localhost:4001/api`，其他环境使用同源 `/api`。

朋友如果要在本地运行客户端、但连接线上测试服务，可以复制示例：

```bash
cp config/runtime-config.local.example.json \
  config/runtime-config.local.json
```

然后按需修改 `apiBaseUrl`。启动 Cocos 后，程序会按上述优先级选择配置；不要把本机文件加入 Git。

本地配置支持开关：

```json
{
  "enabled": false,
  "environment": "online-test",
  "apiBaseUrl": "https://线上服务地址/api"
}
```

当 `enabled` 为 `false` 时，程序会跳过本地配置并使用公共配置。生产环境本地配置文件 `runtime-config.production.local.json` 默认已关闭，同样不会提交到 Git。
