/** 渲染器类型 */
export type RendererType = 'video' | 'spritesheet';

/** 宠物种类（可选元数据） */
export type PetKind = 'creature' | string;

/** 尺寸 */
export interface Size {
  width: number;
  height: number;
}

/** 主题色 */
export interface PetColors {
  body?: string;
  accent?: string;
  cheek?: string;
  [key: string]: string | undefined;
}

/** 视频片段 */
export interface VideoClip {
  /** 相对 video.dir 的文件名 */
  file: string;
  /** 是否循环，默认 false */
  loop?: boolean;
}

/**
 * behaviorMap 候选：string 等权，或 { clip, weight } 加权
 * weight 越大越容易被选中；缺省 1
 */
export type BehaviorClipRef =
  | string
  | {
      clip: string;
      weight?: number;
    };

/** 行为 → 可用 clip 候选列表 */
export type BehaviorMap = Record<string, BehaviorClipRef[]>;

/** 视频渲染配置 */
export interface VideoConfig {
  /** 视频目录（相对宠物根目录） */
  dir: string;
  /** 扩展名，如 webm */
  ext?: string;
  /** 宽高比 */
  aspect?: number;
  /** clip 名 → 片段定义 */
  clips: Record<string, VideoClip>;
  /** 行为映射（也可提升到 PetConfig.behaviorMap） */
  behaviorMap?: BehaviorMap;
}

/** 精灵表单帧/动画（可选扩展） */
export interface SpritesheetAnimation {
  /** 起始帧索引 */
  start?: number;
  /** 帧数 */
  frames?: number;
  /** 帧率 */
  fps?: number;
  /** 是否循环 */
  loop?: boolean;
  /** 自定义扩展字段 */
  [key: string]: unknown;
}

/** 精灵表配置 */
export interface SpritesheetConfig {
  /** 相对宠物根目录的图片路径 */
  path: string;
  /** 帧宽（可选） */
  frameWidth?: number;
  /** 帧高（可选） */
  frameHeight?: number;
  /** 列数（可选） */
  columns?: number;
  /** 行数（可选） */
  rows?: number;
  /** 命名动画（可选） */
  animations?: Record<string, SpritesheetAnimation>;
}

/** 音频配置 */
export interface AudioConfig {
  /** 映射文件路径（相对宠物根目录），如 audio.json */
  mapFile?: string;
  /** 音频目录（相对宠物根目录） */
  dir?: string;
  /** 内联映射：clip/事件 → 文件名 */
  map?: Record<string, string>;
}

/** AI 人格配置 */
export interface AiConfig {
  /** persona 文件路径（相对宠物根目录） */
  personaFile?: string;
  /** 内联 persona 文本 */
  persona?: string;
}

/**
 * 磁盘上的原始 pet.json（双轨字段，未规范化）
 * 兼容 name/displayName、renderer/video/spritesheetPath 等历史写法
 */
export interface RawPetConfig {
  id?: string;
  name?: string;
  displayName?: string;
  version?: string;
  greeting?: string;
  description?: string;
  kind?: PetKind;
  colors?: PetColors;
  size?: Partial<Size> | Size;
  renderer?: RendererType | string;
  video?: Partial<VideoConfig> & {
    clips?: Record<string, Partial<VideoClip> | string>;
    behaviorMap?: BehaviorMap;
  };
  spritesheetPath?: string;
  spritesheet?: Partial<SpritesheetConfig> & { path?: string };
  behaviorMap?: BehaviorMap;
  audio?: AudioConfig;
  ai?: AiConfig;
  [key: string]: unknown;
}

/**
 * 规范化后的统一宠物配置
 */
export interface PetConfig {
  id: string;
  /** 展示名：displayName ?? name ?? id */
  displayName: string;
  /** 原始 name 字段（若有） */
  name?: string;
  version?: string;
  greeting?: string;
  description?: string;
  kind?: PetKind;
  colors?: PetColors;
  size: Size;
  renderer: RendererType;
  video?: VideoConfig;
  spritesheet?: SpritesheetConfig;
  /** 顶层行为映射（video 型会从 video.behaviorMap 提升） */
  behaviorMap?: BehaviorMap;
  audio?: AudioConfig;
  ai?: AiConfig;
}

/** manifest.json */
export interface Manifest {
  pets: string[];
}

/** 校验问题严重级别 */
export type ValidationSeverity = 'error' | 'warning';

/** 单条校验问题 */
export interface ValidationIssue {
  path: string;
  message: string;
  severity: ValidationSeverity;
  code?: string;
}

/** 校验结果 */
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** 加载单只宠物的结果 */
export interface LoadedPet {
  id: string;
  dir: string;
  raw: RawPetConfig;
  config: PetConfig;
  validation: ValidationResult;
}

/** 批量加载结果 */
export interface LoadAllPetsResult {
  manifest: Manifest;
  pets: LoadedPet[];
  /** 是否全部校验通过 */
  ok: boolean;
}
