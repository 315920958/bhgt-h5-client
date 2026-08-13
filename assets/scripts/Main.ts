import {
  Button,
  Color,
  Component,
  EditBox,
  Graphics,
  ImageAsset,
  Label,
  Node,
  ResolutionPolicy,
  UITransform,
  Sprite,
  SpriteFrame,
  Texture2D,
  assetManager,
  view,
  _decorator,
} from 'cc';
import { createPlatformAuth, DeviceQrCode } from './platform-auth';
import { clearPlayerToken, getPlayerToken, setPlayerToken } from './auth-storage';
import { loadRuntimeConfig } from './runtime-config';
import { apiRequest } from './api-request';
import { reportClientDebug } from './client-debug';

const { ccclass } = _decorator;

@ccclass('BHGTMain')
export class BHGTMain extends Component {
  private apiBaseUrl = '';
  private isDevelopment = false;
  private statusLabel!: Label;
  private loginButton!: Button;
  private isLoggingIn = false;
  private qrNode: Node | null = null;
  private playerHeader: Node | null = null;
  private createRoleButton: Button | null = null;
  private enterGameButton: Button | null = null;
  private createRolePage: Node | null = null;
  private storyPage: Node | null = null;
  private currentAuth = '';
  private currentNickname = '';
  private currentAvatar = '';

  onLoad(): void {
    this.buildHome();
    this.loginButton.interactable = false;
    this.statusLabel.string = '正在加载运行配置...';
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    console.info('[BHGT][Auth] initialize started');
    let config;
    try {
      config = await loadRuntimeConfig();
    } catch (error) {
      console.error('[BHGT][Config] runtime configuration initialization failed', error);
      this.statusLabel.string = '运行配置加载失败，请查看控制台日志';
      reportClientDebug('', {
        event: 'runtime-config-failed',
        details: { error: String(error) },
      });
      return;
    }
    this.apiBaseUrl = config.apiBaseUrl;
    const isLocalPreview = typeof location !== 'undefined'
      && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    this.isDevelopment = config.environment === 'develop'
      || config.environment === 'development'
      || config.environment === 'online-test'
      || config.environment === 'test'
      || isLocalPreview
      || (typeof location !== 'undefined' && location.hostname.startsWith('develop.'));
    console.info('[BHGT][Config] runtime config ready', {
      environment: config.environment,
      apiBaseUrl: this.apiBaseUrl,
    });
    const tap = (globalThis as typeof globalThis & { tap?: { getAppBaseInfo?: () => { enableDebug?: boolean; SDKVersion?: string } } }).tap;
    const appInfo = tap?.getAppBaseInfo?.();
    console.info('[BHGT][Debug] runtime diagnostics', {
      environment: config.environment,
      tapPresent: Boolean(tap),
      tapLoginType: typeof (tap as any)?.login,
      tapRequestType: typeof (tap as any)?.request,
      tapEnableDebug: appInfo?.enableDebug,
      tapSdkVersion: appInfo?.SDKVersion,
      vConsoleNote: '请在TapTap小游戏菜单开启“日志”后重启，容器才显示vConsole',
    });
    reportClientDebug(this.apiBaseUrl, {
      event: 'client-initialized',
      details: {
        environment: config.environment,
        tapPresent: Boolean(tap),
        tapLoginType: typeof (tap as any)?.login,
        tapRequestType: typeof (tap as any)?.request,
        tapEnableDebug: appInfo?.enableDebug,
        tapSdkVersion: appInfo?.SDKVersion,
      },
    });
    this.loginButton.interactable = true;
    this.statusLabel.string = '请选择 TapTap 登录进入游戏';
    void this.restoreSession();
  }

  private buildHome(): void {
    const root = this.node;
    // 以手机竖屏为设计基准，固定宽度后高度随设备变化，避免 960x640 在手机上缩成一小块。
    view.setDesignResolutionSize(390, 844, ResolutionPolicy.FIXED_WIDTH);
    const size = view.getVisibleSize();
    const transform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    transform.setContentSize(size.width, size.height);

    this.addPanelBackground(root, size.width, size.height);
    this.addLabel(root, '百世千岁', 0, size.height * 0.72 - size.height / 2, 42, new Color(245, 228, 177, 255));
    this.addLabel(root, '一念入局，百世修行', 0, size.height * 0.63 - size.height / 2, 22, new Color(235, 220, 190, 255));
    this.addLabel(root, '一段从选择开始的修行旅途', 0, size.height * 0.56 - size.height / 2, 16, new Color(183, 170, 150, 255));

    this.statusLabel = this.addLabel(root, '请选择 TapTap 登录进入游戏', 0, size.height * 0.32 - size.height / 2, 16, new Color(190, 190, 190, 255));
    this.loginButton = this.addButton(root, 'TapTap 登录', 0, size.height * 0.43 - size.height / 2, Math.min(300, size.width * 0.74), 64);
    this.loginButton.node.on(Button.EventType.CLICK, this.handleLogin, this);
    // 兼容部分 Cocos Web/移动预览下 Button CLICK 未派发的情况。
    this.loginButton.node.on(Node.EventType.TOUCH_END, this.handleLogin, this);
  }

  private addPanelBackground(root: Node, width: number, height: number): void {
    const node = new Node('Background');
    node.parent = root;
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(24, 29, 38, 255);
    graphics.roundRect(-width / 2, -height / 2, width, height, 0);
    graphics.fill();
  }

  private addLabel(root: Node, text: string, x: number, y: number, fontSize: number, color: Color): Label {
    const node = new Node(text);
    node.parent = root;
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(800, fontSize + 20);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    return label;
  }

  private addButton(
    root: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize = 22,
  ): Button {
    const node = new Node(text);
    node.parent = root;
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(42, 188, 164, 255);
    graphics.roundRect(-width / 2, -height / 2, width, height, 12);
    graphics.fill();

    const labelNode = new Node('Label');
    labelNode.parent = node;
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(width, height);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = Color.WHITE;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;

    return node.addComponent(Button);
  }

  private setButtonColor(button: Button, color: Color): void {
    const transform = button.node.getComponent(UITransform);
    const graphics = button.node.getComponent(Graphics);
    if (!transform || !graphics) return;
    graphics.clear();
    graphics.fillColor = color;
    graphics.roundRect(
      -transform.contentSize.width / 2,
      -transform.contentSize.height / 2,
      transform.contentSize.width,
      transform.contentSize.height,
      12,
    );
    graphics.fill();
  }

  private async handleLogin(): Promise<void> {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;
    this.loginButton.interactable = false;
    console.info('[BHGT] TapTap login clicked');
    reportClientDebug(this.apiBaseUrl, { event: 'login-clicked' });
    this.statusLabel.string = '正在认证信息...';
    try {
      const result = await createPlatformAuth().login({
        apiBaseUrl: this.apiBaseUrl,
        onDeviceQrCode: (qr) => {
          this.loginButton.node.active = false;
          this.statusLabel.node.setPosition(0, -190, 0);
          this.showQrCode(qr);
        },
        onDeviceWaiting: () => {
          this.statusLabel.string = '请使用 TapTap App 扫码确认登录';
        },
      });
      console.info('[BHGT][Auth] platform login returned', {
        platform: result.platform,
        credentialPresent: 'code' in result ? Boolean(result.code) : Boolean(result.auth),
      });
      reportClientDebug(this.apiBaseUrl, {
        event: 'platform-login-returned',
        details: { platform: result.platform, credentialPresent: 'code' in result ? Boolean(result.code) : Boolean(result.auth) },
      });
      this.statusLabel.string = 'TapTap 登录成功，正在读取角色...';
      let auth: string;
      let nickname = '';
      let avatar = '';
      if (result.platform === 'taptap-device-code') {
        auth = result.auth;
        nickname = result.nickname;
        avatar = result.avatar;
      } else {
        const loginResponse = await apiRequest(`${this.apiBaseUrl}/auth/taptap-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: result.code }),
          apiBaseUrl: this.apiBaseUrl,
        });
        console.info('[BHGT][Auth] backend taptap-login response', {
          status: loginResponse.status,
          ok: loginResponse.ok,
        });
        const loginBody = await loginResponse.json() as {
          auth?: string;
          message?: string;
          MESSAGE_BODY?: { nickname?: string; avatar?: string };
        };
        if (!loginResponse.ok || !loginBody.auth) {
          throw new Error(loginBody.message || 'TapTap 服务端认证失败');
        }
        auth = loginBody.auth;
        nickname = loginBody.MESSAGE_BODY?.nickname || 'TapTap 玩家';
        avatar = loginBody.MESSAGE_BODY?.avatar || '';
      }

      this.hideQrCode();
      setPlayerToken(auth);
      this.currentAuth = auth;
      this.currentNickname = nickname;
      this.currentAvatar = avatar;
      this.showPlayerHeader(nickname, avatar);
      const role = await this.loadRole(auth);
      this.applyRoleStatus(role.hasRole);
      console.info('[BHGT] Real TapTap authentication complete', { platform: result.platform, role });
    } catch (error) {
      reportClientDebug(this.apiBaseUrl, {
        event: 'login-flow-failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      console.error('[BHGT][Auth] login flow failed', error);
      this.hideQrCode();
      this.loginButton.node.active = true;
      this.statusLabel.string = error instanceof Error ? error.message : '登录失败，请稍后重试';
      this.loginButton.interactable = true;
    }
  }

  private async restoreSession(): Promise<void> {
    const auth = getPlayerToken();
    if (!auth) {
      console.info('[BHGT][Auth] no stored player token; waiting for TapTap login');
      this.statusLabel.string = '请选择 TapTap 登录进入游戏';
      return;
    }

    this.loginButton.interactable = false;
    this.statusLabel.string = '正在恢复登录...';
    console.info('[BHGT][Auth] validating stored player token');
    try {
      console.info('[BHGT][Auth] requesting session validation', {
        apiBaseUrl: this.apiBaseUrl,
      });
      const response = await apiRequest(`${this.apiBaseUrl}/auth/session`, {
        headers: { Authorization: `Bearer ${auth}` },
        apiBaseUrl: this.apiBaseUrl,
      });
      console.info('[BHGT][Auth] session validation response received', {
        status: response.status,
        ok: response.ok,
      });
      const body = await response.json() as {
        errCode?: number;
        message?: string;
        MESSAGE_BODY?: {
          nickname?: string;
          avatar?: string;
          hasTapTapBinding?: boolean;
        };
      };
      const session = body.MESSAGE_BODY;
      console.info('[BHGT][Auth] stored token validation response', {
        httpStatus: response.status,
        errCode: body.errCode,
        hasSession: Boolean(session),
        hasTapTapBinding: Boolean(session?.hasTapTapBinding),
      });
      if (!response.ok || body.errCode || !session?.hasTapTapBinding) {
        const error = new Error(body.message || '本地登录校验失败') as Error & { code?: number };
        error.code = body.errCode;
        throw error;
      }

      this.loginButton.node.active = false;
      this.currentAuth = auth;
      this.currentNickname = session.nickname || 'TapTap 玩家';
      this.currentAvatar = session.avatar || '';
      this.showPlayerHeader(session.nickname || 'TapTap 玩家', session.avatar || '');
      const role = await this.loadRole(auth);
      this.applyRoleStatus(role.hasRole);
      console.info('[BHGT][Auth] stored player token restored', { hasRole: role.hasRole });
    } catch (error) {
      const errorCode = (error as Error & { code?: number })?.code;
      const tokenDefinitelyInvalid = errorCode === 10002
        || errorCode === 10003
        || errorCode === 401
        || errorCode === 403;
      if (tokenDefinitelyInvalid) {
        clearPlayerToken();
        console.warn('[BHGT][Auth] stored player token rejected and cleared', { errorCode });
      } else {
        console.warn('[BHGT][Auth] stored player token validation failed; kept for retry', error);
      }
      this.loginButton.node.active = true;
      this.loginButton.interactable = true;
      this.statusLabel.string = tokenDefinitelyInvalid
        ? '登录已失效，请重新使用 TapTap 登录'
        : '暂时无法恢复登录，请稍后重试';
    }
  }

  private async loadRole(auth: string): Promise<{ hasRole: boolean }> {
    const response = await apiRequest(`${this.apiBaseUrl}/game/role`, {
      headers: { Authorization: `Bearer ${auth}` },
    });
    const body = await response.json() as {
      errCode?: number;
      MESSAGE_BODY?: { hasRole?: boolean };
      message?: string;
    };
    console.info('[BHGT][Auth] role response', {
      status: response.status,
      ok: response.ok,
      hasRole: body.MESSAGE_BODY?.hasRole,
    });
    if (!response.ok || body.errCode) {
      throw new Error(body.message || '读取角色信息失败');
    }
    return { hasRole: Boolean(body.MESSAGE_BODY?.hasRole) };
  }

  private applyRoleStatus(hasRole: boolean): void {
    this.createRoleButton?.node.destroy();
    this.createRoleButton = null;
    this.enterGameButton?.node.destroy();
    this.enterGameButton = null;
    this.statusLabel.string = hasRole
      ? '认证成功，可以进入游戏'
      : '认证成功，请创建角色开始游戏';
    if (!hasRole) {
      const size = view.getVisibleSize();
      this.createRoleButton = this.addButton(this.node, '创建角色', 0, size.height * 0.43 - size.height / 2, Math.min(330, size.width * 0.82), 72);
      this.createRoleButton.node.on(Button.EventType.CLICK, this.showCreateRole, this);
    } else {
      const size = view.getVisibleSize();
      this.enterGameButton = this.addButton(this.node, '进入游戏', 0, size.height * 0.43 - size.height / 2, Math.min(330, size.width * 0.82), 72);
      this.enterGameButton.node.on(Button.EventType.CLICK, this.openCurrentNode, this);
    }
  }

  private handleLogout(): void {
    clearPlayerToken();
    this.currentAuth = '';
    this.currentNickname = '';
    this.currentAvatar = '';
    this.playerHeader?.destroy();
    this.playerHeader = null;
    this.createRoleButton?.node.destroy();
    this.createRoleButton = null;
    this.enterGameButton?.node.destroy();
    this.enterGameButton = null;
    this.createRolePage?.destroy();
    this.createRolePage = null;
    this.storyPage?.destroy();
    this.storyPage = null;
    this.loginButton.node.active = true;
    this.loginButton.interactable = true;
    this.statusLabel.string = '已退出开发账号，请重新登录';
    console.info('[BHGT][Auth] development logout complete');
  }

  private async requestCurrentRole(reset = false): Promise<any> {
    const response = await apiRequest(
      reset ? `${this.apiBaseUrl}/game/current-node/reset` : `${this.apiBaseUrl}/game/role`,
      {
        method: reset ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${this.currentAuth}` },
      },
    );
    const body = await response.json() as { MESSAGE_BODY?: { hasRole?: boolean; role?: any }; message?: string; errCode?: number };
    if (!response.ok || body.errCode || !body.MESSAGE_BODY?.hasRole || !body.MESSAGE_BODY.role) {
      throw new Error(body.message || '读取当前节点失败');
    }
    return body.MESSAGE_BODY.role;
  }

  private async openCurrentNode(): Promise<void> {
    if (!this.currentAuth || !this.enterGameButton) return;
    this.enterGameButton.interactable = false;
    this.statusLabel.string = '正在进入当前节点...';
    try {
      const role = await this.requestCurrentRole();
      this.showCurrentNode(role);
    } catch (error) {
      this.statusLabel.string = error instanceof Error ? error.message : '进入游戏失败';
      this.enterGameButton.interactable = true;
    }
  }

  /**
   * Cocos 没有网页路由；节点页以一个覆盖层承载，重置接口返回的新 role 直接重绘这层。
   * 因此开发者不需要返回首页或重复点击入口，页面状态和服务端数据始终同一份。
   */
  private showCurrentNode(role: any): void {
    this.storyPage?.destroy();
    this.storyPage = null;
    this.enterGameButton?.node.destroy();
    this.enterGameButton = null;
    const node = role.node;
    if (!node) {
      this.statusLabel.string = '当前角色没有可进入的剧情节点';
      return;
    }

    const size = view.getVisibleSize();
    const page = new Node('CurrentNodePage');
    page.parent = this.node;
    page.addComponent(UITransform).setContentSize(size.width, size.height);
    const background = page.addComponent(Graphics);
    background.fillColor = new Color(18, 24, 32, 252);
    background.rect(-size.width / 2, -size.height / 2, size.width, size.height);
    background.fill();
    this.storyPage = page;

    this.addLabel(page, `节点 ${node.code || ''}`, 0, size.height / 2 - 64, 14, new Color(143, 214, 198, 255));
    this.addLabel(page, node.title || node.name || '未命名节点', 0, size.height / 2 - 108, 30, new Color(245, 228, 177, 255));
    const text = this.addLabel(page, node.text || '', 0, size.height / 2 - 205, 17, new Color(225, 217, 200, 255));
    text.overflow = Label.Overflow.SHRINK;
    text.node.getComponent(UITransform)?.setContentSize(Math.min(340, size.width * 0.86), 130);

    const buttons = Array.isArray(node.buttons) ? node.buttons : [];
    buttons.forEach((button: any, index: number) => {
      const action = this.addButton(page, button.text || `选项 ${index + 1}`, 0, 72 - index * 68, Math.min(340, size.width * 0.86), 52);
      // 节点选择的结算/跳转将在下一阶段接入；现阶段先明确点击已命中本角色快照内的按钮。
      action.node.on(Button.EventType.CLICK, () => {
        console.info('[BHGT][Node] selected current-node button', { nodeCode: node.code, buttonCode: button.code });
      });
    });
    if (!buttons.length) {
      this.addLabel(page, '此节点当前没有可用选项', 0, 48, 16, new Color(183, 170, 150, 255));
    }

    const debugButtonY = -size.height / 2 + 38;
    const nodeStatus = this.addLabel(page, '', 0, debugButtonY + 42, 14, new Color(143, 214, 198, 255));
    if (this.isDevelopment) {
      const reset = this.addButton(page, '重置节点', -82, debugButtonY, 140, 36, 15);
      reset.node.on(Button.EventType.CLICK, async () => {
        reset.interactable = false;
        nodeStatus.string = '正在重新生成节点数据...';
        try {
          const refreshedRole = await this.requestCurrentRole(true);
          this.showCurrentNode(refreshedRole);
          console.info('[BHGT][Node] development current-node reset complete', {
            nodeId: refreshedRole.node?.id,
            currentInfo: refreshedRole.node?.currentInfo,
          });
        } catch (error) {
          nodeStatus.string = error instanceof Error ? error.message : '节点重置失败';
          reset.interactable = true;
        }
      });
    }

    const back = this.addButton(page, '返回首页', 82, debugButtonY, 110, 36, 15);
    back.node.on(Button.EventType.CLICK, () => {
      page.destroy();
      this.storyPage = null;
      this.applyRoleStatus(true);
    });
  }

  private showCreateRole(): void {
    if (this.createRolePage || !this.currentAuth) return;
    this.createRoleButton!.node.active = false;
    const size = view.getVisibleSize();
    const page = new Node('CreateRolePage');
    page.parent = this.node;
    page.setPosition(0, 0, 0);
    page.addComponent(UITransform).setContentSize(size.width, size.height);
    const background = page.addComponent(Graphics);
    background.fillColor = new Color(20, 25, 33, 250);
    background.rect(-size.width / 2, -size.height / 2, size.width, size.height);
    background.fill();
    this.createRolePage = page;

    this.addLabel(page, '创建角色', 0, size.height / 2 - 82, 34, new Color(245, 228, 177, 255));
    this.addLabel(page, '踏入百世轮回前，请留下你的名字', 0, size.height / 2 - 126, 15, new Color(183, 170, 150, 255));
    const pageStatus = this.addLabel(page, '', 0, -325, 14, new Color(143, 214, 198, 255));

    const avatarNode = new Node('RoleAvatar');
    avatarNode.parent = page;
    avatarNode.setPosition(0, size.height / 2 - 210, 0);
    avatarNode.addComponent(UITransform).setContentSize(92, 92);
    const avatarBg = avatarNode.addComponent(Graphics);
    avatarBg.fillColor = new Color(42, 188, 164, 255);
    avatarBg.circle(0, 0, 46);
    avatarBg.fill();
    const avatarFallback = this.addLabel(avatarNode, this.currentNickname.trim().slice(0, 1) || '玩', 0, -2, 34, Color.WHITE);
    this.renderRemoteAvatar(avatarNode, avatarFallback.node, this.currentAvatar, 92);

    let selectedAvatar = this.currentAvatar;
    const selectAvatar = this.addButton(page, '选择头像', 0, size.height / 2 - 286, 160, 46);
    selectAvatar.node.on(Button.EventType.CLICK, () => {
      if (typeof document === 'undefined') {
        pageStatus.string = '当前宿主暂不支持本地图片选择';
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          pageStatus.string = '头像不能超过 5MB';
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '');
          selectAvatar.interactable = false;
          pageStatus.string = '正在上传头像...';
          try {
            const response = await apiRequest(`${this.apiBaseUrl}/game/avatar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.currentAuth}` },
              body: JSON.stringify({ dataUrl }),
            });
            const body = await response.json() as { MESSAGE_BODY?: { url?: string }; message?: string; errCode?: number };
            const url = body.MESSAGE_BODY?.url;
            if (!response.ok || body.errCode || !url) throw new Error(body.message || '头像上传失败');
            selectedAvatar = url;
            this.renderRemoteAvatar(avatarNode, avatarFallback.node, url, 92);
            pageStatus.string = '头像上传成功';
          } catch (error) {
            pageStatus.string = error instanceof Error ? error.message : '头像上传失败';
          } finally {
            selectAvatar.interactable = true;
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });

    const inputNode = new Node('NicknameInput');
    inputNode.parent = page;
    inputNode.setPosition(0, 30, 0);
    inputNode.addComponent(UITransform).setContentSize(Math.min(330, size.width * 0.82), 58);
    const inputBg = inputNode.addComponent(Graphics);
    inputBg.fillColor = new Color(42, 49, 60, 255);
    inputBg.roundRect(-165, -29, 330, 58, 10);
    inputBg.fill();
    const editBox = inputNode.addComponent(EditBox);
    // Cocos 给程序化 EditBox 创建的默认 Label 会显示字样“Label”，必须移除。
    // 之后由我们显式提供 textLabel / placeholderLabel。
    inputNode.children.slice().forEach((child) => child.destroy());
    const textNode = new Node('Text');
    textNode.parent = inputNode;
    textNode.addComponent(UITransform).setContentSize(Math.min(300, size.width * 0.74), 50);
    const textLabel = textNode.addComponent(Label);
    textLabel.fontSize = 20;
    textLabel.lineHeight = 26;
    textLabel.color = new Color(244, 235, 208, 255);
    textLabel.verticalAlign = Label.VerticalAlign.CENTER;
    textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    editBox.textLabel = textLabel;
    const placeholderNode = new Node('Placeholder');
    placeholderNode.parent = inputNode;
    placeholderNode.addComponent(UITransform).setContentSize(Math.min(300, size.width * 0.74), 50);
    const placeholderLabel = placeholderNode.addComponent(Label);
    placeholderLabel.fontSize = 20;
    placeholderLabel.lineHeight = 26;
    placeholderLabel.color = new Color(130, 135, 145, 255);
    placeholderLabel.verticalAlign = Label.VerticalAlign.CENTER;
    placeholderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    editBox.placeholderLabel = placeholderLabel;
    editBox.string = this.currentNickname;
    editBox.maxLength = 12;
    editBox.placeholder = '请输入角色昵称';

    this.addLabel(page, '选择性别', 0, -22, 16, new Color(190, 190, 190, 255));
    let gender: 'male' | 'female' | 'other' = 'other';
    const male = this.addButton(page, '男', -110, -78, 92, 48);
    const female = this.addButton(page, '女', 0, -78, 92, 48);
    const other = this.addButton(page, '保密', 110, -78, 92, 48);
    const selectedColor = new Color(42, 188, 164, 255);
    const normalColor = new Color(65, 75, 88, 255);
    this.setButtonColor(other, selectedColor);
    const selectGender = (value: 'male' | 'female' | 'other', selected: Button): void => {
      gender = value;
      [male, female, other].forEach((button) => this.setButtonColor(button, button === selected ? selectedColor : normalColor));
    };
    male.node.on(Button.EventType.CLICK, () => selectGender('male', male));
    female.node.on(Button.EventType.CLICK, () => selectGender('female', female));
    other.node.on(Button.EventType.CLICK, () => selectGender('other', other));

    const submit = this.addButton(page, '开始新游戏', 0, -178, Math.min(330, size.width * 0.82), 68);
    submit.node.on(Button.EventType.CLICK, async () => {
      const nickname = editBox.string.trim();
      if (!nickname) {
        pageStatus.string = '请输入角色昵称';
        return;
      }
      submit.interactable = false;
      pageStatus.string = '正在创建角色...';
      try {
            const response = await apiRequest(`${this.apiBaseUrl}/game/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.currentAuth}` },
          body: JSON.stringify({ nickname, gender, avatar: selectedAvatar }),
        });
        const body = await response.json() as { MESSAGE_BODY?: { hasRole?: boolean; role?: any }; message?: string; errCode?: number };
        if (!response.ok || body.errCode || !body.MESSAGE_BODY?.hasRole) throw new Error(body.message || '创建角色失败');
        page.destroy();
        this.createRolePage = null;
        // 创建成功后直接展示服务端返回的首个节点，不再让玩家额外点击“进入游戏”。
        this.showCurrentNode(body.MESSAGE_BODY.role);
        console.info('[BHGT][Role] role created', { nickname, gender, avatar: selectedAvatar });
      } catch (error) {
        submit.interactable = true;
        pageStatus.string = error instanceof Error ? error.message : '创建角色失败';
      }
    });

  }

  private renderRemoteAvatar(parent: Node, fallback: Node, url: string, size: number): void {
    parent.getChildByName('RemoteAvatar')?.destroy();
    if (!url) return;
    const render = (error: Error | null, asset?: ImageAsset | null): void => {
      if (error || !asset || !parent.isValid) return;
      const imageNode = new Node('RemoteAvatar');
      imageNode.parent = parent;
      imageNode.addComponent(UITransform).setContentSize(size, size);
      const texture = new Texture2D();
      texture.image = asset;
      const frame = new SpriteFrame();
      frame.texture = texture;
      const sprite = imageNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      fallback.active = false;
    };
    if (typeof Image !== 'undefined') {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => render(null, new ImageAsset(image));
      image.onerror = () => render(new Error('头像加载失败'));
      image.src = url;
    } else {
      assetManager.loadRemote<ImageAsset>(url, render);
    }
  }

  private showQrCode(qr: DeviceQrCode): void {
    this.hideQrCode();
    const node = new Node('TapTapLoginQrCode');
    node.parent = this.node;
    node.setPosition(0, 40, 0);
    const transform = node.addComponent(UITransform);
    const canvasSize = Math.min(280, view.getVisibleSize().width * 0.72);
    transform.setContentSize(canvasSize, canvasSize);
    const graphics = node.addComponent(Graphics);
    const quietModules = 4;
    const totalModules = qr.size + quietModules * 2;
    const moduleSize = canvasSize / totalModules;
    graphics.fillColor = Color.WHITE;
    graphics.rect(-canvasSize / 2, -canvasSize / 2, canvasSize, canvasSize);
    graphics.fill();
    graphics.fillColor = new Color(16, 20, 26, 255);
    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.rows[y]?.[x] !== '1') continue;
        graphics.rect(
          -canvasSize / 2 + (x + quietModules) * moduleSize,
          canvasSize / 2 - (y + quietModules + 1) * moduleSize,
          moduleSize + 0.25,
          moduleSize + 0.25,
        );
      }
    }
    graphics.fill();
    this.qrNode = node;
    console.info('[BHGT][Auth] real TapTap QR code displayed', {
      modules: qr.size,
      expiresIn: qr.expiresIn,
    });
  }

  private hideQrCode(): void {
    this.qrNode?.destroy();
    this.qrNode = null;
  }

  private showPlayerHeader(nickname: string, avatarUrl: string): void {
    this.playerHeader?.destroy();
    const root = this.node;
    const size = view.getVisibleSize();
    const node = new Node('TapTapPlayerHeader');
    node.parent = root;
    node.setPosition(-size.width / 2 + 118, size.height / 2 - 58, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(220, 64);

    const background = node.addComponent(Graphics);
    background.fillColor = new Color(35, 43, 54, 232);
    background.roundRect(-110, -32, 220, 64, 20);
    background.fill();

    const avatarNode = new Node('Avatar');
    avatarNode.parent = node;
    avatarNode.setPosition(-75, 0, 0);
    const avatarTransform = avatarNode.addComponent(UITransform);
    avatarTransform.setContentSize(48, 48);
    const avatarBackground = avatarNode.addComponent(Graphics);
    avatarBackground.fillColor = new Color(42, 188, 164, 255);
    avatarBackground.circle(0, 0, 24);
    avatarBackground.fill();

    const fallback = this.addLabel(avatarNode, (nickname.trim().slice(0, 1) || '玩').toUpperCase(), 0, -2, 22, Color.WHITE);
    fallback.node.name = 'AvatarFallback';
    const nameLabel = this.addLabel(node, nickname || 'TapTap 玩家', 18, 8, 18, new Color(244, 235, 208, 255));
    nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    const sourceLabel = this.addLabel(node, 'TapTap 已登录', 18, -15, 12, new Color(143, 214, 198, 255));
    sourceLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.playerHeader = node;

    if (this.isDevelopment) {
      const logout = this.addButton(root, '退出登录', size.width / 2 - 66, size.height / 2 - 58, 108, 42);
      logout.node.name = 'DevelopmentLogout';
      logout.node.on(Button.EventType.CLICK, this.handleLogout, this);
      logout.node.parent = node;
      logout.node.setPosition(178, 0, 0);
    }

    if (!avatarUrl) return;

    const renderAvatar = (error: Error | null, imageAsset?: ImageAsset | null): void => {
      if (error || !imageAsset || !avatarNode.isValid) {
        console.warn('[BHGT][Auth] TapTap avatar load failed; using nickname fallback', error);
        return;
      }
      const imageNode = new Node('AvatarImage');
      imageNode.parent = avatarNode;
      const imageTransform = imageNode.addComponent(UITransform);
      imageTransform.setContentSize(48, 48);
      const sprite = imageNode.addComponent(Sprite);
      const texture = new Texture2D();
      texture.image = imageAsset;
      const frame = new SpriteFrame();
      frame.texture = texture;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      imageTransform.setContentSize(48, 48);
      fallback.node.active = false;
      console.info('[BHGT][Auth] TapTap avatar rendered', {
        width: imageAsset.width,
        height: imageAsset.height,
      });
    };

    // TapTap 头像 CDN 会对来自普通网页的 Referer 返回 567；直接打开 URL
    // 没有 Referer，所以能正常显示。Web 预览显式禁用 Referer 后再交给 Cocos。
    if (typeof Image !== 'undefined') {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => renderAvatar(null, new ImageAsset(image));
      image.onerror = () => renderAvatar(new Error('TapTap 头像浏览器加载失败'));
      image.src = avatarUrl;
      return;
    }

    // TapTap 小游戏容器没有 DOM/网页 Referer，使用 Cocos 原生远程加载器。
    assetManager.loadRemote<ImageAsset>(avatarUrl, renderAvatar);
  }
}
