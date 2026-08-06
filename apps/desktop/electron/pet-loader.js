/**
 * 宠物资源加载：clips / audio / ai / video / spritesheet / catalog
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { app, protocol, net } = require('electron');
const {
  PET_ASSET_SCHEME,
  isPathInsideRoot,
  resolvePetAssetPath: resolvePetAssetPathAgainstRoot,
} = require('./pet-asset-path');
const log = require('./logger');

/**
 * 与 apps/desktop/shared/pet-payload.d.ts 同源
 * @typedef {import('../shared/pet-payload').PetClipInfo} PetClip
 * @typedef {import('../shared/pet-payload').PetAudioPayload} PetAudioPayload
 * @typedef {import('../shared/pet-payload').PetAiPayload} PetAiPayload
 * @typedef {import('../shared/pet-payload').PetPayload} PetPayload
 * @typedef {import('../shared/pet-payload').PetCatalogItem} PetCatalogItem
 * @typedef {import('../shared/pet-payload').PetRenderer} PetRenderer
 * @typedef {import('../shared/pet-payload').CatalogRenderer} CatalogRenderer
 */

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 仓库根目录：apps/desktop → 上两级（仅开发态有效） */
const REPO_ROOT = path.resolve(__dirname, '../../..');

/** 环境变量优先；否则启动后再读 prefs / 回退 guga */
const ENV_PET_ID = process.env.PET_ID || '';

/**
 * 宠物资源根目录
 * - 开发：仓库根 pets/
 * - 打包后：extraResources → resources/pets
 */
function getPetsRoot() {
  try {
    // 纯 Node 单测 / 非 Electron 启动时 require('electron') 可能不是 API 对象
    if (app && typeof app.isPackaged === 'boolean' && app.isPackaged) {
      return path.join(process.resourcesPath, 'pets');
    }
  } catch {
    /* ignore */
  }
  return path.join(REPO_ROOT, 'pets');
}

/**
 * 将请求 URL 解析为 pets 根下的安全绝对路径；非法则返回 null
 * @param {string} requestUrl
 * @returns {string | null}
 */
function resolvePetAssetPath(requestUrl) {
  return resolvePetAssetPathAgainstRoot(requestUrl, getPetsRoot());
}

/**
 * 注册 pet-asset 协议特权（须在 app ready 之前调用）
 */
function registerPetAssetSchemePrivileges() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PET_ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * 注册 pet-asset 协议：仅允许读取 pets 根下文件
 */
function registerPetAssetProtocol() {
  protocol.handle(PET_ASSET_SCHEME, async (request) => {
    try {
      const target = resolvePetAssetPath(request.url);
      if (!target) {
        return new Response('Forbidden', { status: 403, statusText: 'Forbidden' });
      }
      let stat;
      try {
        stat = fs.statSync(target);
      } catch {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }
      if (!stat.isFile()) {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }
      return net.fetch(pathToFileURL(target).href);
    } catch (err) {
      log.warn('[pet-asset] 处理失败:', formatErr(err));
      return new Response('Internal Error', {
        status: 500,
        statusText: 'Internal Error',
      });
    }
  });
  log.info(`[pet-asset] 已注册协议 ${PET_ASSET_SCHEME}:// ，pets 根=`, getPetsRoot());
}

/**
 * 解析 idle 视频绝对路径（schema 失败时的回退）
 * @param {string} petId
 * @param {string} videoDir
 * @param {string} file
 */
function resolveClipPath(petId, videoDir, file) {
  return path.join(getPetsRoot(), petId, videoDir, file);
}

/**
 * 本地绝对路径 → pet-asset:// URL
 * @param {string} filePath
 */
function pathToPetAssetUrl(filePath) {
  const petsRoot = path.resolve(getPetsRoot());
  const resolved = path.resolve(filePath);
  if (!isPathInsideRoot(petsRoot, resolved)) {
    throw new Error(`[pet-asset] 路径不在 pets 根内: ${resolved}`);
  }
  const rel = path.relative(petsRoot, resolved);
  if (!rel || rel === '') {
    return `${PET_ASSET_SCHEME}://asset/`;
  }
  const posixRel = rel
    .split(path.sep)
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join('/');
  const trailing =
    filePath.endsWith('/') ||
    filePath.endsWith('\\') ||
    (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory())
      ? '/'
      : '';
  return `${PET_ASSET_SCHEME}://asset/${posixRel}${trailing}`;
}

/**
 * 扫描 video.clips，为存在的文件生成 pet-asset:// URL
 * @param {string} petDir
 * @param {string} videoDir
 * @param {Record<string, { file?: string; loop?: boolean } | string>} rawClips
 * @returns {Record<string, { url: string; loop: boolean; file: string }>}
 */
function buildClipsMap(petDir, videoDir, rawClips) {
  /** @type {Record<string, { url: string; loop: boolean; file: string }>} */
  const clips = {};
  if (!rawClips || typeof rawClips !== 'object') {
    return clips;
  }

  for (const [name, def] of Object.entries(rawClips)) {
    const file = typeof def === 'string' ? def : def?.file;
    if (!file || typeof file !== 'string') {
      log.warn(`[pet] clip "${name}" 缺少 file，已跳过`);
      continue;
    }
    const loop =
      typeof def === 'object' && def !== null
        ? def.loop === true || (name === 'idle' && def.loop !== false)
        : name === 'idle';
    const absPath = path.join(petDir, videoDir, file);
    if (!fs.existsSync(absPath)) {
      log.warn(`[pet] clip 文件不存在，已跳过: ${name} → ${absPath}`);
      continue;
    }
    clips[name] = {
      file,
      url: pathToPetAssetUrl(absPath),
      loop: !!loop,
    };
  }
  return clips;
}

/**
 * 读取 pet.audio 配置
 * @param {string} petDir
 * @param {{ mapFile?: string; dir?: string; map?: Record<string, string> } | null | undefined} audioConfig
 * @returns {{ dir: string; map: Record<string, string> } | undefined}
 */
function buildAudioPayload(petDir, audioConfig) {
  if (!audioConfig || typeof audioConfig !== 'object') {
    return undefined;
  }
  const dir =
    typeof audioConfig.dir === 'string' && audioConfig.dir
      ? audioConfig.dir
      : 'audio';

  /** @type {Record<string, string>} */
  let rawMap = {};
  if (audioConfig.map && typeof audioConfig.map === 'object') {
    rawMap = { ...audioConfig.map };
  }
  if (typeof audioConfig.mapFile === 'string' && audioConfig.mapFile) {
    const mapPath = path.join(petDir, audioConfig.mapFile);
    if (fs.existsSync(mapPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          rawMap = { ...rawMap, ...data };
        }
      } catch (err) {
        log.warn(
          '[pet] 读取 audio mapFile 失败:',
          mapPath,
          formatErr(err),
        );
      }
    } else {
      log.warn('[pet] audio mapFile 不存在:', mapPath);
    }
  }

  /** @type {Record<string, string>} */
  const map = {};
  for (const [key, filename] of Object.entries(rawMap)) {
    if (typeof filename !== 'string' || !filename) continue;
    const absPath = path.join(petDir, dir, filename);
    if (!fs.existsSync(absPath)) {
      log.warn(`[pet] 音效文件不存在，已跳过: ${key} → ${absPath}`);
      continue;
    }
    map[key] = pathToPetAssetUrl(absPath);
  }

  if (Object.keys(map).length === 0) {
    return undefined;
  }
  return { dir, map };
}

/**
 * 读取 ai.personaFile 文本
 * @param {string} petDir
 * @param {{ personaFile?: string; persona?: string } | null | undefined} aiConfig
 * @returns {{ personaFile: string; personaText: string } | undefined}
 */
function buildAiPayload(petDir, aiConfig) {
  if (!aiConfig || typeof aiConfig !== 'object') {
    return undefined;
  }
  const personaFile =
    typeof aiConfig.personaFile === 'string' && aiConfig.personaFile
      ? aiConfig.personaFile
      : '';
  let personaText = '';
  if (typeof aiConfig.persona === 'string' && aiConfig.persona.trim()) {
    personaText = aiConfig.persona.trim();
  }
  if (personaFile) {
    const absPath = path.join(petDir, personaFile);
    if (fs.existsSync(absPath)) {
      try {
        const text = fs.readFileSync(absPath, 'utf8');
        if (text && text.trim()) {
          personaText = text.trim();
        }
      } catch (err) {
        log.warn(
          '[pet] 读取 persona 失败:',
          absPath,
          formatErr(err),
        );
      }
    } else {
      log.warn('[pet] persona 文件不存在:', absPath);
    }
  }
  if (!personaText && !personaFile) {
    return undefined;
  }
  return {
    personaFile: personaFile || 'persona.md',
    personaText: personaText || '',
  };
}

/**
 * 构造完整视频宠 payload
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.displayName
 * @param {string} opts.petDir
 * @param {string} opts.videoDir
 * @param {Record<string, PetClip>} opts.clips
 * @param {Record<string, string[]>} opts.behaviorMap
 * @param {{ width: number; height: number }} opts.size
 * @param {PetRenderer} [opts.renderer]
 * @param {PetAudioPayload} [opts.audio]
 * @param {PetAiPayload} [opts.ai]
 * @returns {PetPayload}
 */
function buildVideoPayload({
  id,
  displayName,
  petDir,
  videoDir,
  clips,
  behaviorMap,
  size,
  renderer = /** @type {PetRenderer} */ ('video'),
  audio,
  ai,
}) {
  const idleClip = clips.idle;
  if (!idleClip) {
    throw new Error(`宠物 ${id} 缺少可用的 idle clip`);
  }
  const videoBase = path.join(petDir, videoDir);
  /** @type {PetPayload} */
  const payload = {
    id,
    displayName,
    renderer,
    petDir,
    baseUrl: pathToPetAssetUrl(videoBase),
    videoBaseUrl: pathToPetAssetUrl(videoBase),
    clips,
    behaviorMap: behaviorMap || {},
    idle: {
      file: idleClip.file,
      url: idleClip.url,
      loop: idleClip.loop !== false,
    },
    size: size || { width: 180, height: 180 },
  };
  if (audio) {
    payload.audio = audio;
  }
  if (ai) {
    payload.ai = ai;
  }
  return payload;
}

/**
 * 构造精灵表宠 payload
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.displayName
 * @param {string} opts.petDir
 * @param {{ path: string; frameWidth?: number; frameHeight?: number; columns?: number; rows?: number; animations?: Record<string, unknown> }} opts.sheet
 * @param {Record<string, string[]>} opts.behaviorMap
 * @param {{ width: number; height: number }} opts.size
 * @param {PetAudioPayload} [opts.audio]
 * @param {PetAiPayload} [opts.ai]
 * @returns {PetPayload}
 */
function buildSpritesheetPayload({
  id,
  displayName,
  petDir,
  sheet,
  behaviorMap,
  size,
  audio,
  ai,
}) {
  const relPath = sheet?.path;
  if (!relPath || typeof relPath !== 'string') {
    throw new Error(`宠物 ${id} 缺少 spritesheet.path`);
  }
  const absPath = path.join(petDir, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`精灵表图片不存在: ${absPath}`);
  }

  /** @type {import('../shared/pet-payload').PetSpritesheetAnim} */
  const defaultIdleAnim = { row: 0, frames: 1, loop: true, fps: 8 };
  /** @type {Record<string, import('../shared/pet-payload').PetSpritesheetAnim>} */
  const animations =
    sheet.animations && typeof sheet.animations === 'object'
      ? /** @type {Record<string, import('../shared/pet-payload').PetSpritesheetAnim>} */ (
          sheet.animations
        )
      : { idle: defaultIdleAnim };

  /** @type {Record<string, PetClip>} */
  const clips = {};
  const imageUrl = pathToPetAssetUrl(absPath);
  for (const [name, anim] of Object.entries(animations)) {
    const loop =
      anim && typeof anim === 'object' && anim !== null && 'loop' in anim
        ? /** @type {{ loop?: unknown }} */ (anim).loop === true
        : name === 'idle';
    clips[name] = {
      file: relPath,
      url: imageUrl,
      loop: !!loop,
    };
  }
  if (!clips.idle) {
    clips.idle = { file: relPath, url: imageUrl, loop: true };
  }

  const idleAnim = animations.idle;
  const idleFps =
    idleAnim &&
    typeof idleAnim === 'object' &&
    idleAnim !== null &&
    'fps' in idleAnim &&
    typeof /** @type {{ fps?: unknown }} */ (idleAnim).fps === 'number'
      ? /** @type {{ fps: number }} */ (idleAnim).fps
      : 8;

  /** @type {PetPayload} */
  const payload = {
    id,
    displayName,
    renderer: 'spritesheet',
    petDir,
    clips,
    behaviorMap: behaviorMap || {},
    idle: {
      file: clips.idle.file,
      url: clips.idle.url,
      loop: true,
    },
    size: size || { width: 160, height: 160 },
    spritesheet: {
      url: imageUrl,
      path: relPath,
      frameWidth: typeof sheet.frameWidth === 'number' ? sheet.frameWidth : 128,
      frameHeight: typeof sheet.frameHeight === 'number' ? sheet.frameHeight : 128,
      columns: typeof sheet.columns === 'number' ? sheet.columns : undefined,
      rows: typeof sheet.rows === 'number' ? sheet.rows : undefined,
      fps: idleFps,
      animations,
    },
  };
  if (audio) {
    payload.audio = audio;
  }
  if (ai) {
    payload.ai = ai;
  }
  return payload;
}

/**
 * 校验失败 / 加载策略（产品化）
 *
 * | 场景 | 策略 | 用户提示 |
 * |------|------|----------|
 * | schema 校验有 error，但资源仍可构建（有 idle 等） | **降级**加载，标记 loadMeta.degraded | 配置有问题，已降级加载 |
 * | 缺 idle / 精灵表 / 渲染器不可用 | **拒载**（非 guga 抛错；切宠 ok:false） | 无法加载该宠物 |
 * | guga 硬失败 | **回退**硬编码 idle.webm | 使用默认资源回退 |
 * | 再次切到已成功加载的宠 | **缓存命中**（进程内 Map） | 无 |
 *
 * 缓存失效：clearPetPayloadCache / invalidatePetPayloadCache；
 * 进程重启后自然清空。资源文件热改需重启或主动 invalidate。
 */

/** @type {Map<string, PetPayload>} */
const payloadCache = new Map();

/**
 * 格式化校验 issues 供日志
 * @param {Array<{ path?: string; message?: string; severity?: string; code?: string }>} issues
 */
function formatValidationIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return '(无)';
  return issues
    .map((i) => {
      const sev = i.severity || 'error';
      const code = i.code ? ` [${i.code}]` : '';
      return `${sev}${code} ${i.path || ''}: ${i.message || ''}`;
    })
    .join('; ');
}

/**
 * @param {string} petId
 * @param {'ok' | 'degraded' | 'fallback'} mode
 * @param {string} [detail]
 * @returns {NonNullable<PetPayload['loadMeta']>}
 */
function buildLoadMeta(petId, mode, detail) {
  if (mode === 'degraded') {
    return {
      mode: 'degraded',
      degraded: true,
      userMessage: `「${petId}」配置有问题，已降级加载`,
      detail: detail || '',
    };
  }
  if (mode === 'fallback') {
    return {
      mode: 'fallback',
      degraded: true,
      userMessage: `「${petId}」加载失败，已使用默认资源`,
      detail: detail || '',
    };
  }
  return {
    mode: 'ok',
    degraded: false,
    userMessage: '',
    detail: detail || '',
  };
}

/**
 * 附加 loadMeta 到 payload（浅拷贝，避免污染缓存前对象引用链）
 * @param {PetPayload} payload
 * @param {NonNullable<PetPayload['loadMeta']>} meta
 * @returns {PetPayload}
 */
function withLoadMeta(payload, meta) {
  return { ...payload, loadMeta: meta };
}

/**
 * guga 硬编码 idle 回退（schema / 构建均失败时）
 * @param {string} [detail]
 * @returns {PetPayload}
 */
function buildGugaHardFallback(detail) {
  const videoDir = 'large/webm';
  const petDir = path.join(getPetsRoot(), 'guga');
  const absPath = resolveClipPath('guga', videoDir, 'idle.webm');
  if (!fs.existsSync(absPath)) {
    throw new Error(`回退路径也不存在: ${absPath}`);
  }
  const clips = {
    idle: {
      file: 'idle.webm',
      url: pathToPetAssetUrl(absPath),
      loop: true,
    },
  };
  const payload = buildVideoPayload({
    id: 'guga',
    displayName: 'guga',
    petDir,
    videoDir,
    clips,
    behaviorMap: { idle: ['idle'] },
    size: { width: 180, height: 180 },
    audio: buildAudioPayload(petDir, {
      mapFile: 'audio.json',
      dir: 'audio',
    }),
  });
  return withLoadMeta(payload, buildLoadMeta('guga', 'fallback', detail));
}

/**
 * 从 schema LoadedPet 构建 payload；校验失败时尽量降级，无法渲染则抛错
 * @param {string} petId
 * @param {{ config: any; dir: string; validation: { ok: boolean; issues?: any[] } }} loaded
 * @returns {PetPayload}
 */
function buildPayloadFromLoaded(petId, loaded) {
  const { config, dir, validation } = loaded;
  const issues = validation?.issues || [];
  const degraded = !validation?.ok;
  if (degraded) {
    log.warn(
      `[pet] 校验未通过（将尝试降级加载） petId=${petId}:`,
      formatValidationIssues(issues),
    );
  }

  const audio = buildAudioPayload(dir, config.audio);
  const ai = buildAiPayload(dir, config.ai);
  const meta = degraded
    ? buildLoadMeta(petId, 'degraded', formatValidationIssues(issues))
    : buildLoadMeta(petId, 'ok');

  if (config.renderer === 'spritesheet') {
    if (!config.spritesheet?.path) {
      const err = new Error(
        `无法加载「${petId}」：spritesheet 缺少 path（拒载）`,
      );
      /** @type {Error & { loadPolicy?: string }} */
      (err).loadPolicy = 'reject';
      throw err;
    }
    const payload = buildSpritesheetPayload({
      id: config.id,
      displayName: config.displayName,
      petDir: dir,
      sheet: config.spritesheet,
      behaviorMap: config.behaviorMap || {},
      size: config.size || { width: 160, height: 160 },
      audio,
      ai,
    });
    log.info(
      '[pet] spritesheet 已加载:',
      payload.id,
      degraded ? '(降级)' : '',
      'animations=',
      Object.keys(payload.spritesheet?.animations || {}).join(', ') || '(none)',
      audio ? `audio=${Object.keys(audio.map).length}` : 'audio=0',
      ai ? 'ai=persona' : 'ai=0',
    );
    return withLoadMeta(payload, meta);
  }

  if (config.renderer !== 'video' || !config.video?.clips) {
    const err = new Error(
      `无法加载「${petId}」：不是可用的 video/spritesheet 或缺少资源（拒载）`,
    );
    /** @type {Error & { loadPolicy?: string }} */
    (err).loadPolicy = 'reject';
    throw err;
  }

  const videoDir = config.video.dir || 'large/webm';
  const clips = buildClipsMap(dir, videoDir, config.video.clips);
  if (!clips.idle) {
    const err = new Error(
      `无法加载「${petId}」：缺少可用的 idle 视频（拒载）`,
    );
    /** @type {Error & { loadPolicy?: string }} */
    (err).loadPolicy = 'reject';
    throw err;
  }

  const behaviorMap = config.behaviorMap || config.video.behaviorMap || {};
  const payload = buildVideoPayload({
    id: config.id,
    displayName: config.displayName,
    petDir: dir,
    videoDir,
    clips,
    behaviorMap,
    size: config.size || { width: 180, height: 180 },
    renderer: 'video',
    audio,
    ai,
  });

  log.info(
    '[pet] clips 已加载:',
    Object.keys(payload.clips || {}).length,
    Object.keys(payload.clips || {}).join(', '),
    degraded ? '(降级)' : '',
    audio ? `audio=${Object.keys(audio.map).length}` : 'audio=0',
    ai ? 'ai=persona' : 'ai=0',
  );
  return withLoadMeta(payload, meta);
}

/**
 * 通过 @pet/schema 加载宠物；校验失败尽量降级；guga 可硬回退
 * @param {string} petId
 * @param {{ force?: boolean }} [opts] force=true 跳过缓存重新加载
 * @returns {Promise<PetPayload>}
 */
async function loadPetPayload(petId, opts) {
  const force = opts && opts.force === true;
  if (!petId || typeof petId !== 'string') {
    throw new Error('无效的宠物 id');
  }

  if (!force && payloadCache.has(petId)) {
    const cached = payloadCache.get(petId);
    log.info('[pet] payload 缓存命中:', petId);
    return /** @type {PetPayload} */ (cached);
  }

  try {
    const schema = await import('@pet/schema');
    const loaded = await schema.loadPet(getPetsRoot(), petId);
    const payload = buildPayloadFromLoaded(petId, loaded);
    payloadCache.set(payload.id || petId, payload);
    return payload;
  } catch (err) {
    const msg = formatErr(err);
    log.warn('[pet] 加载失败:', petId, msg);

    if (petId === 'guga') {
      log.warn('[pet] guga 使用硬编码 idle 回退');
      try {
        const fallback = buildGugaHardFallback(msg);
        payloadCache.set('guga', fallback);
        return fallback;
      } catch (fbErr) {
        log.error('[pet] guga 回退也失败:', formatErr(fbErr));
        throw fbErr;
      }
    }

    // 非 guga：拒载，带用户可读文案
    const userMsg =
      err instanceof Error && err.message && err.message.startsWith('无法加载')
        ? err.message
        : `无法加载「${petId}」：${msg}`;
    const rejectErr = new Error(userMsg);
    /** @type {Error & { loadPolicy?: string; cause?: unknown }} */
    (rejectErr).loadPolicy = 'reject';
    (rejectErr).cause = err;
    throw rejectErr;
  }
}

/**
 * 清除全部 payload 缓存
 */
function clearPetPayloadCache() {
  payloadCache.clear();
  log.info('[pet] payload 缓存已清空');
}

/**
 * 使指定宠缓存失效
 * @param {string} petId
 */
function invalidatePetPayloadCache(petId) {
  if (!petId) return;
  payloadCache.delete(petId);
  log.info('[pet] payload 缓存失效:', petId);
}

/**
 * @returns {string[]}
 */
function getCachedPetIds() {
  return Array.from(payloadCache.keys());
}

/**
 * 轻量读取单宠 catalog 元数据
 * @param {string} petsRoot
 * @param {string} id
 * @returns {PetCatalogItem}
 */
function loadCatalogEntry(petsRoot, id) {
  let displayName = id;
  /** @type {CatalogRenderer} */
  let renderer = 'spritesheet';
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(petsRoot, id, 'pet.json'), 'utf8'),
    );
    if (raw && typeof raw === 'object') {
      displayName =
        (typeof raw.displayName === 'string' && raw.displayName) ||
        (typeof raw.name === 'string' && raw.name) ||
        id;
      if (raw.renderer === 'video' || raw.renderer === 'spritesheet') {
        renderer = raw.renderer;
      } else if (raw.renderer === 'atlas') {
        renderer = 'spritesheet';
      } else if (raw.video) {
        renderer = 'video';
      } else if (
        raw.spritesheetPath ||
        raw.spritesheet ||
        raw.atlas
      ) {
        renderer = 'spritesheet';
      } else {
        renderer = 'unknown';
      }
    }
  } catch {
    /* pet.json 缺失或损坏时仍返回 id */
  }
  return { id, displayName, renderer };
}

/**
 * 加载 catalog（manifest id 列表 + 轻量 pet.json 元数据）
 * @returns {Promise<PetCatalogItem[]>}
 */
async function loadCatalog() {
  /** @type {PetCatalogItem[]} */
  const pets = [];
  const petsRoot = getPetsRoot();
  /** @type {string[]} */
  let ids = [];

  try {
    const schema = await import('@pet/schema');
    const manifest = await schema.loadManifest(petsRoot);
    ids = Array.isArray(manifest.pets) ? manifest.pets.slice() : [];
  } catch (err) {
    log.warn('[pet] loadManifest 失败，扫描目录回退:', formatErr(err));
    try {
      const entries = fs.readdirSync(petsRoot, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (fs.existsSync(path.join(petsRoot, ent.name, 'pet.json'))) {
          ids.push(ent.name);
        }
      }
    } catch (scanErr) {
      log.warn('[pet] 扫描 pets 目录失败:', formatErr(scanErr));
    }
  }

  for (const id of ids) {
    if (!id || typeof id !== 'string') continue;
    pets.push(loadCatalogEntry(petsRoot, id));
  }

  return pets;
}

/**
 * 解析启动宠物 id：PET_ID > prefs > guga
 * @param {string[]} knownIds
 * @param {string | null} prefsPetId
 */
function resolveStartupPetId(knownIds, prefsPetId) {
  if (ENV_PET_ID && (!knownIds.length || knownIds.includes(ENV_PET_ID))) {
    return ENV_PET_ID;
  }
  if (prefsPetId && (!knownIds.length || knownIds.includes(prefsPetId))) {
    return prefsPetId;
  }
  if (knownIds.includes('guga')) return 'guga';
  return knownIds[0] || 'guga';
}

module.exports = {
  PET_ASSET_SCHEME,
  ENV_PET_ID,
  getPetsRoot,
  resolvePetAssetPath,
  pathToPetAssetUrl,
  registerPetAssetSchemePrivileges,
  registerPetAssetProtocol,
  buildClipsMap,
  buildAudioPayload,
  buildAiPayload,
  buildVideoPayload,
  buildSpritesheetPayload,
  buildPayloadFromLoaded,
  buildGugaHardFallback,
  buildLoadMeta,
  formatValidationIssues,
  loadPetPayload,
  clearPetPayloadCache,
  invalidatePetPayloadCache,
  getCachedPetIds,
  loadCatalog,
  loadCatalogEntry,
  resolveStartupPetId,
};
