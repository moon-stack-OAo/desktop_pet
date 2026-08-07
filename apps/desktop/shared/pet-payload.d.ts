/**
 * 主进程 → 渲染层宠物载荷与 petAPI 签名（单一源）
 * 渲染层通过 src/types/pet-api.d.ts 挂到全局；主进程 JS 用 import() 引用
 */

/** 可渲染的渲染器类型 */
export type PetRenderer = 'video' | 'spritesheet';

/** catalog 轻量读取时可能出现的 renderer（含无法识别） */
export type CatalogRenderer = PetRenderer | 'unknown';

/** 单个视频 clip（主进程扫描后的可播放项） */
export interface PetClipInfo {
  /** pet-asset:// 资源 URL（由主进程生成） */
  url: string;
  /** 是否循环 */
  loop: boolean;
  /** 相对 video.dir 的文件名 */
  file: string;
}

/** 兼容旧字段的 idle 片段 */
export interface PetIdleClip {
  url: string;
  loop?: boolean;
  file?: string;
}

/** 精灵表单条动画（扩展字段如 row 原样保留） */
export interface PetSpritesheetAnim {
  start?: number;
  frames?: number;
  fps?: number;
  loop?: boolean;
  row?: number;
  column?: number;
  [key: string]: unknown;
}

/** 主进程解析后的精灵表载荷 */
export interface PetSpritesheetPayload {
  /** 图片 pet-asset:// URL */
  url: string;
  /** 相对宠物目录的路径 */
  path: string;
  frameWidth: number;
  frameHeight: number;
  columns?: number;
  rows?: number;
  /** 表级默认 fps */
  fps?: number;
  animations?: Record<string, PetSpritesheetAnim>;
}

/** 主进程解析后的音效载荷（clip/behavior → pet-asset://） */
export interface PetAudioPayload {
  /** 相对宠物根目录的音频目录，如 audio */
  dir: string;
  /** clip 名或 behavior 名 → pet-asset:// URL */
  map: Record<string, string>;
}

/** AI 人格：persona 文件名 + 已读入的全文 */
export interface PetAiPayload {
  personaFile: string;
  personaText: string;
}

/**
 * 主进程加载策略元信息（B-601）
 * - ok：校验通过
 * - degraded：校验失败但仍可渲染（降级）
 * - fallback：guga 硬编码 idle 回退
 */
export interface PetLoadMeta {
  mode: 'ok' | 'degraded' | 'fallback';
  /** 是否非理想加载（degraded / fallback） */
  degraded: boolean;
  /** 用户可感知短提示；ok 时为空串 */
  userMessage: string;
  /** 日志/调试用细节（issues 摘要等） */
  detail?: string;
}

/** 主进程下发的宠物载荷（video / spritesheet） */
export interface PetPayload {
  id?: string;
  displayName?: string;
  /** 渲染器类型 */
  renderer?: PetRenderer;
  /** 窗口建议尺寸 */
  size?: { width: number; height: number };
  /** 宠物根目录绝对路径 */
  petDir?: string;
  /** 视频目录 pet-asset:// 基址 */
  baseUrl?: string;
  /** 同 baseUrl，兼容旧字段 */
  videoBaseUrl?: string;
  /**
   * clip / 动画名 → 元数据（video 为真实 url；spritesheet 为图片 url + loop）
   */
  clips?: Record<string, PetClipInfo>;
  /**
   * 逻辑行为 → clip/动画 候选列表
   */
  /** clip 候选：string 等权，或 { clip, weight } 加权 */
  behaviorMap?: Record<
    string,
    Array<string | { clip: string; weight?: number }>
  >;
  /**
   * 可选：覆盖 AutoScheduler 候选（string 或带 weight/cooldownMs）
   * 未设置时用 runtime 默认 walk/happy/play
   */
  autoBehaviors?: Array<
    string | { name: string; weight?: number; cooldownMs?: number }
  >;
  /** 兼容旧渲染层：等同 clips.idle */
  idle?: PetIdleClip;
  /** spritesheet 渲染器专用 */
  spritesheet?: PetSpritesheetPayload;
  /**
   * 音效：mapFile 解析后的 pet-asset:// 映射；无 audio 配置的宠物可省略
   */
  audio?: PetAudioPayload;
  /**
   * AI 人格：persona 文件名 + 已读入的全文
   */
  ai?: PetAiPayload;
  /**
   * 加载策略元信息：降级/回退时渲染层可展示 userMessage
   */
  loadMeta?: PetLoadMeta;
}

/** catalog 中的单项 */
export interface PetCatalogItem {
  id: string;
  displayName: string;
  renderer: CatalogRenderer;
}

/** getCatalog 返回值 */
export interface PetCatalog {
  pets: PetCatalogItem[];
  currentId: string;
}

/** switchPet 结果 */
export interface PetSwitchResult {
  ok: boolean;
  payload?: PetPayload;
  error?: string;
}

/** AI 对话上下文 */
export interface PetChatContext {
  vitals?: { hunger?: number; mood?: number };
}

/** AI 回复来源：本地规则 / 云端 API */
export type PetChatMode = 'local' | 'cloud';

/** AI 对话结果 */
export interface PetChatResult {
  reply: string;
  action?: string | null;
  /**
   * 实际生效来源：local=本地规则；cloud=云端成功
   * 云端失败降级本地时仍为 local，并带 errorKind
   */
  mode?: PetChatMode;
  /** 与 mode 同义，便于 UI 展示 */
  source?: PetChatMode;
  /**
   * 失败类型（仅降级或错误时）：timeout / network / http / no-key / unknown
   * 云端成功时省略
   */
  errorKind?: 'timeout' | 'network' | 'http' | 'no-key' | 'unknown';
  /** 可选短提示（已并入 reply 时可省略） */
  notice?: string;
}

/** 更新偏好 */
export interface UpdatePrefsSnapshot {
  checkOnStart: boolean;
  lastCheckDate: string;
  ignoredVersion: string;
}

/** 待安装更新信息 */
export interface PendingUpdateInfo {
  version: string;
  releaseNotes?: string | null;
}

/** getUpdateState 返回值 */
export interface UpdateState {
  packaged: boolean;
  currentVersion: string;
  checking: boolean;
  downloading: boolean;
  pendingUpdate: PendingUpdateInfo | null;
  prefs: UpdatePrefsSnapshot;
}

/** 更新状态推送 phase */
export type UpdateStatusPhase =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'ignored'
  | 'error'
  | 'downloading'
  | 'downloaded'
  | 'dev-skip';

/** update:status 推送载荷 */
export interface UpdateStatusPayload {
  phase: UpdateStatusPhase;
  version?: string;
  currentVersion?: string;
  releaseNotes?: string | null;
  message?: string;
  silent?: boolean;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

/** 简单 ok 结果 */
export interface OkResult {
  ok: boolean;
  error?: string;
}

/** AI 凭证来源：环境变量 / 本地存储 / 未配置 */
export type AiCredentialSource = 'env' | 'local' | 'none';

/**
 * getAiSettings 返回值（**不含完整 apiKey**）
 */
export interface AiSettingsPublic {
  hasKey: boolean;
  /** 掩码提示，如 sk-***xxxx */
  keyHint?: string;
  baseUrl: string;
  model: string;
  encryptionAvailable: boolean;
  source: AiCredentialSource;
}

/** saveAiSettings 入参 */
export interface AiSettingsSaveInput {
  /** 新 Key；省略或空串且未 clearKey 时表示不改 */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** true 时清除本地 Key */
  clearKey?: boolean;
}

/** 预加载脚本暴露的安全 API */
export interface PetAPI {
  /** 主动拉取宠物配置 */
  getPet: (petId?: string) => Promise<PetPayload>;
  /** 宠物列表与当前 id */
  getCatalog: () => Promise<PetCatalog>;
  /** 切换宠物；成功时还会触发 onReady */
  switchPet: (petId: string) => Promise<PetSwitchResult>;
  /** 主进程推送就绪事件；返回取消订阅函数 */
  onReady: (cb: (payload: PetPayload) => void) => (() => void) | void;
  /**
   * 主进程（托盘菜单等）请求触发行为；返回取消订阅
   */
  onBehaviorRequest: (cb: (behavior: string) => void) => (() => void) | void;
  /** 主进程菜单切换静音；返回取消订阅 */
  onToggleMute: (cb: () => void) => (() => void) | void;
  /**
   * AI 对话（主进程取当前 pet persona；无 Key 本地降级）
   */
  chat: (
    message: string,
    context?: PetChatContext,
  ) => Promise<PetChatResult>;
  /**
   * 读取 AI 设置（无完整 Key，仅 hasKey / keyHint）
   */
  getAiSettings: () => Promise<AiSettingsPublic>;
  /**
   * 保存 AI 设置（Key 经 safeStorage 加密写 userData）
   */
  saveAiSettings: (partial?: AiSettingsSaveInput) => Promise<OkResult>;
  /**
   * 打开 AI 工具窗（独立 BrowserWindow）
   * @param tab 'chat' | 'settings'，默认 chat
   */
  openToolWindow: (tab?: 'chat' | 'settings') => void;
  /** 隐藏 AI 工具窗（不退出应用） */
  hideToolWindow: () => void;
  /**
   * 工具窗收到主进程 Tab 切换；返回取消订阅
   */
  onToolTab: (cb: (tab: 'chat' | 'settings') => void) => (() => void) | void;
  /**
   * 工具窗 → 主进程 → 宠物窗：触发行为（eat/happy/play 等）
   */
  requestBehavior: (behavior: string) => void;
  /** @deprecated 托盘已改 openToolWindow；保留兼容 */
  onOpenChat: (cb: () => void) => (() => void) | void;
  /** @deprecated 托盘已改 openToolWindow；保留兼容 */
  onOpenAiSettings: (cb: () => void) => (() => void) | void;
  /** 退出应用 */
  quit: () => void;

  /**
   * 宠物小窗右键弹出原生菜单（主进程 Menu.popup，可画出窗 bounds）
   * @param payload.x / y 相对窗口的 client 坐标
   * @param payload.vitalsLabel 可选顶部状态行
   * @param payload.muted 可选，用于静音项文案
   */
  popupContextMenu: (payload?: {
    x?: number;
    y?: number;
    vitalsLabel?: string;
    muted?: boolean;
  }) => void;

  /**
   * 设置点击穿透；开启后宠物窗不再收鼠标，须托盘关闭
   */
  setIgnoreMouse: (ignore: boolean) => void;
  /** 当前是否点击穿透 */
  getIgnoreMouse: () => Promise<boolean>;
  /** 主进程（托盘等）变更穿透状态时通知；返回取消订阅 */
  onIgnoreMouseChanged: (cb: (ignore: boolean) => void) => (() => void) | void;
  /** 对话/设置关闭后恢复宠物默认窗尺寸 */
  restorePetWindowSize: () => void;
  /**
   * 自定义拖窗：pointerdown 调 start，pointermove 调 move（屏幕坐标）。
   * 替代 CSS -webkit-app-region: drag，避免 Windows 右键系统菜单。
   */
  startWindowDrag: (screenX: number, screenY: number) => void;
  moveWindowDrag: (screenX: number, screenY: number) => void;
  /** 拖动结束，清理主进程 drag 状态 */
  endWindowDrag: () => void;

  // —— 自动更新 ——
  getUpdateState: () => Promise<UpdateState>;
  checkUpdate: (opts?: { manual?: boolean }) => Promise<OkResult>;
  downloadUpdate: () => Promise<OkResult>;
  installUpdate: () => Promise<OkResult>;
  ignoreUpdate: (version: string) => Promise<{ ok: boolean }>;
  setCheckUpdateOnStart: (enabled: boolean) => Promise<UpdatePrefsSnapshot>;
  getUpdatePrefs: () => Promise<UpdatePrefsSnapshot>;
  onUpdateStatus: (
    cb: (payload: UpdateStatusPayload) => void,
  ) => (() => void) | void;
}
