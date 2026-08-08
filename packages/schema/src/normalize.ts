import type {
  BehaviorMap,
  PetConfig,
  RawPetConfig,
  RendererType,
  Size,
  SpritesheetAnimation,
  SpritesheetConfig,
  VideoClip,
  VideoConfig,
} from './types.js';

const DEFAULT_SIZE: Size = { width: 160, height: 160 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function resolveRenderer(raw: RawPetConfig): RendererType {
  const explicit = asString(raw.renderer);
  if (explicit === 'video' || explicit === 'spritesheet') {
    return explicit;
  }
  // 历史 atlas 渲染器 → 统一为 spritesheet
  if (explicit === 'atlas') {
    return 'spritesheet';
  }
  if (raw.video && isRecord(raw.video)) {
    return 'video';
  }
  if (
    asString(raw.spritesheetPath) ||
    (raw.spritesheet && isRecord(raw.spritesheet)) ||
    (raw.atlas && isRecord(raw.atlas))
  ) {
    return 'spritesheet';
  }
  // 无法推断时默认 spritesheet（多数精简配置）
  return 'spritesheet';
}

/**
 * 历史 atlas 配置 → SpritesheetConfig（B-804 P0）
 * atlas.states 的 row/frames/fps/loop 与 PetSpritesheet 行模式一致。
 */
function normalizeAtlasToSpritesheet(raw: RawPetConfig): SpritesheetConfig | undefined {
  const atlas = raw.atlas;
  if (!atlas || !isRecord(atlas)) {
    return undefined;
  }

  const path = asString(atlas.image) ?? asString(atlas.path);
  if (!path) {
    return undefined;
  }

  const sheet: SpritesheetConfig = { path };

  const cellW = atlas.cellW ?? atlas.frameWidth;
  const cellH = atlas.cellH ?? atlas.frameHeight;
  if (typeof cellW === 'number' && cellW > 0) {
    sheet.frameWidth = cellW;
  }
  if (typeof cellH === 'number' && cellH > 0) {
    sheet.frameHeight = cellH;
  }
  if (typeof atlas.cols === 'number' && atlas.cols > 0) {
    sheet.columns = atlas.cols;
  }
  if (typeof atlas.rows === 'number' && atlas.rows > 0) {
    sheet.rows = atlas.rows;
  }

  const states = atlas.states;
  if (states && isRecord(states)) {
    const animations: NonNullable<SpritesheetConfig['animations']> = {};
    for (const [name, val] of Object.entries(states)) {
      if (!isRecord(val)) {
        continue;
      }
      const anim: SpritesheetAnimation = {};
      if (typeof val.row === 'number') {
        anim.row = val.row;
      }
      if (typeof val.start === 'number') {
        anim.start = val.start;
      }
      if (typeof val.column === 'number') {
        anim.column = val.column;
      }
      if (typeof val.frames === 'number') {
        anim.frames = val.frames;
      }
      if (typeof val.fps === 'number') {
        anim.fps = val.fps;
      }
      if (typeof val.loop === 'boolean') {
        anim.loop = val.loop;
      }
      animations[name] = anim;
    }
    if (Object.keys(animations).length > 0) {
      sheet.animations = animations;
    }
  }

  return sheet;
}

/** 从动画名推导核心 behaviorMap（atlas 宠通常无顶层 behaviorMap） */
function behaviorMapFromAnimations(
  animations: Record<string, unknown> | undefined,
): BehaviorMap | undefined {
  if (!animations) {
    return undefined;
  }
  const names = new Set(Object.keys(animations));
  const core = [
    'idle',
    'walk',
    'eat',
    'sleep',
    'play',
    'hungry',
    'happy',
    'sick',
    'hunt',
  ] as const;
  const map: BehaviorMap = {};
  for (const b of core) {
    if (names.has(b)) {
      map[b] = [b];
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function normalizeSize(raw: RawPetConfig['size']): Size {
  if (!raw || !isRecord(raw)) {
    return { ...DEFAULT_SIZE };
  }
  const width = typeof raw.width === 'number' && raw.width > 0 ? raw.width : DEFAULT_SIZE.width;
  const height = typeof raw.height === 'number' && raw.height > 0 ? raw.height : DEFAULT_SIZE.height;
  return { width, height };
}

function normalizeClip(value: unknown): VideoClip | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return { file: value };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const file = asString(value.file);
  if (!file) {
    return undefined;
  }
  const clip: VideoClip = { file };
  if (typeof value.loop === 'boolean') {
    clip.loop = value.loop;
  }
  return clip;
}

function normalizeVideo(raw: RawPetConfig['video']): VideoConfig | undefined {
  if (!raw || !isRecord(raw)) {
    return undefined;
  }
  const dir = asString(raw.dir) ?? '';
  const clipsIn = isRecord(raw.clips) ? raw.clips : {};
  const clips: Record<string, VideoClip> = {};
  for (const [key, val] of Object.entries(clipsIn)) {
    const clip = normalizeClip(val);
    if (clip) {
      clips[key] = clip;
    }
  }
  const video: VideoConfig = {
    dir,
    clips,
  };
  const ext = asString(raw.ext);
  if (ext) {
    video.ext = ext;
  }
  if (typeof raw.aspect === 'number') {
    video.aspect = raw.aspect;
  }
  if (raw.behaviorMap && isRecord(raw.behaviorMap)) {
    video.behaviorMap = normalizeBehaviorMap(raw.behaviorMap);
  }
  return video;
}

function normalizeBehaviorMap(input: unknown): BehaviorMap | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const map: BehaviorMap = {};
  for (const [key, val] of Object.entries(input)) {
    if (!Array.isArray(val)) continue;
    const list = [];
    for (const item of val) {
      if (typeof item === 'string' && item.trim()) {
        list.push(item.trim());
        continue;
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const clip =
          typeof o.clip === 'string'
            ? o.clip.trim()
            : typeof o.name === 'string'
              ? o.name.trim()
              : '';
        if (!clip) continue;
        const weight =
          typeof o.weight === 'number' && o.weight > 0 ? o.weight : undefined;
        list.push(weight !== undefined ? { clip, weight } : clip);
      }
    }
    if (list.length > 0) map[key] = list;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function normalizeSpritesheet(raw: RawPetConfig): SpritesheetConfig | undefined {
  const fromNested = raw.spritesheet && isRecord(raw.spritesheet) ? raw.spritesheet : undefined;
  const path =
    asString(fromNested?.path) ??
    asString(raw.spritesheetPath);

  // 显式 spritesheet / spritesheetPath 优先；否则映射历史 atlas
  if (!path && !fromNested) {
    return normalizeAtlasToSpritesheet(raw);
  }

  const sheet: SpritesheetConfig = {
    path: path ?? '',
  };

  if (fromNested) {
    if (typeof fromNested.frameWidth === 'number') {
      sheet.frameWidth = fromNested.frameWidth;
    }
    if (typeof fromNested.frameHeight === 'number') {
      sheet.frameHeight = fromNested.frameHeight;
    }
    if (typeof fromNested.columns === 'number') {
      sheet.columns = fromNested.columns;
    }
    if (typeof fromNested.rows === 'number') {
      sheet.rows = fromNested.rows;
    }
    if (fromNested.animations && isRecord(fromNested.animations)) {
      sheet.animations = fromNested.animations as SpritesheetConfig['animations'];
    }
  }

  // 仅有 path、无 animations 时尝试用 atlas 补全元数据
  if (!sheet.animations) {
    const fromAtlas = normalizeAtlasToSpritesheet(raw);
    if (fromAtlas) {
      if (!sheet.path && fromAtlas.path) {
        sheet.path = fromAtlas.path;
      }
      if (sheet.frameWidth === undefined && fromAtlas.frameWidth !== undefined) {
        sheet.frameWidth = fromAtlas.frameWidth;
      }
      if (sheet.frameHeight === undefined && fromAtlas.frameHeight !== undefined) {
        sheet.frameHeight = fromAtlas.frameHeight;
      }
      if (sheet.columns === undefined && fromAtlas.columns !== undefined) {
        sheet.columns = fromAtlas.columns;
      }
      if (sheet.rows === undefined && fromAtlas.rows !== undefined) {
        sheet.rows = fromAtlas.rows;
      }
      if (fromAtlas.animations) {
        sheet.animations = fromAtlas.animations;
      }
    }
  }

  return sheet;
}

/**
 * 将原始 pet.json 规范为统一 PetConfig。
 * 不抛错；缺失字段用合理默认值填充，交由 validate 报告问题。
 */
export function normalizePet(raw: RawPetConfig, fallbackId?: string): PetConfig {
  const id = asString(raw.id)?.trim() || fallbackId?.trim() || '';
  const name = asString(raw.name);
  const displayName =
    asString(raw.displayName)?.trim() ||
    name?.trim() ||
    id;

  const renderer = resolveRenderer(raw);
  const video = normalizeVideo(raw.video);
  const spritesheet = normalizeSpritesheet(raw);

  const topBehavior =
    normalizeBehaviorMap(raw.behaviorMap) ??
    (video?.behaviorMap ? { ...video.behaviorMap } : undefined) ??
    behaviorMapFromAnimations(spritesheet?.animations);

  const config: PetConfig = {
    id,
    displayName,
    size: normalizeSize(raw.size),
    renderer,
  };

  if (name) {
    config.name = name;
  }
  if (asString(raw.version)) {
    config.version = asString(raw.version);
  }
  if (asString(raw.greeting)) {
    config.greeting = asString(raw.greeting);
  }
  if (asString(raw.description)) {
    config.description = asString(raw.description);
  }
  if (raw.kind !== undefined && raw.kind !== null) {
    config.kind = raw.kind as PetConfig['kind'];
  }
  if (raw.colors && isRecord(raw.colors)) {
    config.colors = raw.colors as PetConfig['colors'];
  }
  if (video) {
    config.video = video;
  }
  if (spritesheet) {
    config.spritesheet = spritesheet;
  }
  if (topBehavior) {
    config.behaviorMap = topBehavior;
  }
  const autoBehaviors = normalizeAutoBehaviors(raw.autoBehaviors);
  if (autoBehaviors) {
    config.autoBehaviors = autoBehaviors;
  }
  if (raw.audio && isRecord(raw.audio)) {
    config.audio = raw.audio as PetConfig['audio'];
  }
  if (raw.ai && isRecord(raw.ai)) {
    config.ai = raw.ai as PetConfig['ai'];
  }

  return config;
}

/** 规范化 autoBehaviors 候选列表 */
function normalizeAutoBehaviors(
  input: unknown,
): PetConfig['autoBehaviors'] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  /** @type {NonNullable<PetConfig['autoBehaviors']>} */
  const out: NonNullable<PetConfig['autoBehaviors']> = [];
  for (const item of input) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) out.push(name);
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) continue;
      /** @type {{ name: string; weight?: number; cooldownMs?: number }} */
      const entry: { name: string; weight?: number; cooldownMs?: number } = {
        name,
      };
      if (typeof o.weight === 'number' && o.weight > 0) entry.weight = o.weight;
      if (typeof o.cooldownMs === 'number' && o.cooldownMs > 0) {
        entry.cooldownMs = o.cooldownMs;
      }
      out.push(entry);
    }
  }
  return out.length > 0 ? out : undefined;
}
