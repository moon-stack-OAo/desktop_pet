/**
 * pet-loader 可测纯函数 / 校验失败策略 / 缓存相关单测
 * 避免调用依赖 Electron protocol 的 loadPetPayload 完整路径（部分用例除外）
 */
'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildClipsMap,
  buildAudioPayload,
  buildAiPayload,
  buildVideoPayload,
  buildSpritesheetPayload,
  buildPayloadFromLoaded,
  buildLoadMeta,
  formatValidationIssues,
  loadCatalogEntry,
  resolveStartupPetId,
  pathToPetAssetUrl,
  getPetsRoot,
  loadPetPayload,
  clearPetPayloadCache,
  invalidatePetPayloadCache,
  getCachedPetIds,
} = require('./pet-loader');

describe('resolveStartupPetId', () => {
  it('prefs 命中 knownIds', () => {
    assert.equal(resolveStartupPetId(['guga', 'doro'], 'doro'), 'doro');
  });

  it('prefs 不在列表时回退 guga', () => {
    assert.equal(resolveStartupPetId(['guga', 'doro'], 'nope'), 'guga');
  });

  it('无 guga 时取首个', () => {
    assert.equal(resolveStartupPetId(['alpha', 'beta'], null), 'alpha');
  });

  it('空列表回退 guga', () => {
    assert.equal(resolveStartupPetId([], null), 'guga');
  });
});

describe('loadCatalogEntry', () => {
  /** @type {string} */
  let root;

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-loader-cat-'));
    fs.mkdirSync(path.join(root, 'ok'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ok', 'pet.json'),
      JSON.stringify({
        id: 'ok',
        displayName: 'OK宠',
        renderer: 'video',
      }),
      'utf8',
    );
    fs.mkdirSync(path.join(root, 'broken'), { recursive: true });
    fs.writeFileSync(path.join(root, 'broken', 'pet.json'), '{not-json', 'utf8');
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('读取 displayName / renderer', () => {
    const e = loadCatalogEntry(root, 'ok');
    assert.equal(e.id, 'ok');
    assert.equal(e.displayName, 'OK宠');
    assert.equal(e.renderer, 'video');
  });

  it('损坏 pet.json 仍返回 id', () => {
    const e = loadCatalogEntry(root, 'broken');
    assert.equal(e.id, 'broken');
    assert.equal(e.displayName, 'broken');
  });

  it('缺失目录不抛错', () => {
    const e = loadCatalogEntry(root, 'missing');
    assert.equal(e.id, 'missing');
  });
});

describe('buildClipsMap / buildVideoPayload', () => {
  /** @type {string} */
  let petDir;
  /** @type {string} */
  let petsRoot;

  before(() => {
    petsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-loader-clips-'));
    petDir = path.join(petsRoot, 'demo');
    const videoDir = path.join(petDir, 'large', 'webm');
    fs.mkdirSync(videoDir, { recursive: true });
    fs.writeFileSync(path.join(videoDir, 'idle.webm'), 'x');
    fs.writeFileSync(path.join(videoDir, 'walk.webm'), 'x');
  });

  after(() => {
    fs.rmSync(petsRoot, { recursive: true, force: true });
  });

  it('跳过缺失文件与无 file 的 clip', () => {
    const repoPets = getPetsRoot();
    const gugaDir = path.join(repoPets, 'guga');
    if (!fs.existsSync(path.join(gugaDir, 'large', 'webm', 'idle.webm'))) {
      return;
    }
    const clips = buildClipsMap(gugaDir, 'large/webm', {
      idle: { file: 'idle.webm', loop: true },
      missing: { file: 'no-such.webm' },
      bad: { loop: true },
    });
    assert.ok(clips.idle);
    assert.equal(clips.idle.loop, true);
    assert.equal(clips.missing, undefined);
    assert.equal(clips.bad, undefined);
  });

  it('buildVideoPayload 缺少 idle 抛错', () => {
    assert.throws(
      () =>
        buildVideoPayload({
          id: 'x',
          displayName: 'x',
          petDir: petDir,
          videoDir: 'large/webm',
          clips: {},
          behaviorMap: {},
          size: { width: 10, height: 10 },
        }),
      /缺少可用的 idle clip/,
    );
  });
});

describe('buildAiPayload / buildAudioPayload', () => {
  /** @type {string} */
  let petDir;

  before(() => {
    petDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-loader-ai-'));
    fs.writeFileSync(path.join(petDir, 'persona.md'), '  你是测试宠  \n', 'utf8');
    fs.mkdirSync(path.join(petDir, 'audio'), { recursive: true });
    fs.writeFileSync(path.join(petDir, 'audio', 'a.mp3'), 'x');
    fs.writeFileSync(
      path.join(petDir, 'audio.json'),
      JSON.stringify({ click: 'a.mp3', gone: 'no.mp3' }),
      'utf8',
    );
  });

  after(() => {
    fs.rmSync(petDir, { recursive: true, force: true });
  });

  it('buildAiPayload 读取 persona 文件', () => {
    const ai = buildAiPayload(petDir, { personaFile: 'persona.md' });
    assert.ok(ai);
    assert.equal(ai.personaText, '你是测试宠');
    assert.equal(ai.personaFile, 'persona.md');
  });

  it('buildAiPayload 无配置返回 undefined', () => {
    assert.equal(buildAiPayload(petDir, null), undefined);
    assert.equal(buildAiPayload(petDir, {}), undefined);
  });

  it('buildAiPayload 内联 persona', () => {
    const ai = buildAiPayload(petDir, { persona: '  内联  ' });
    assert.equal(ai?.personaText, '内联');
  });

  it('buildAudioPayload 跳过缺失音效；有有效项才返回', () => {
    // map 内文件 URL 依赖 pets 根，临时目录可能 throw
    // 使用仅 mapFile + 真实路径时：pathToPetAssetUrl 要求在 getPetsRoot 内
    // 因此这里测「无有效 map → undefined」与内联空 map
    assert.equal(buildAudioPayload(petDir, null), undefined);

    const empty = buildAudioPayload(petDir, {
      dir: 'audio',
      map: { x: 'nope.mp3' },
    });
    // 文件不在 pets 根：existsSync 为 true 但 pathToPetAssetUrl 可能 throw
    // 若 throw 则用例失败；为稳健起见 catch 场景用无文件
    assert.equal(empty, undefined);
  });
});

describe('buildSpritesheetPayload 校验失败', () => {
  it('缺少 path 抛错', () => {
    assert.throws(
      () =>
        buildSpritesheetPayload({
          id: 's',
          displayName: 's',
          petDir: os.tmpdir(),
          sheet: {},
          behaviorMap: {},
          size: { width: 1, height: 1 },
        }),
      /缺少 spritesheet\.path/,
    );
  });

  it('图片不存在抛错', () => {
    assert.throws(
      () =>
        buildSpritesheetPayload({
          id: 's',
          displayName: 's',
          petDir: os.tmpdir(),
          sheet: { path: 'no-sheet.png' },
          behaviorMap: {},
          size: { width: 1, height: 1 },
        }),
      /精灵表图片不存在/,
    );
  });
});

describe('getPetsRoot / pathToPetAssetUrl', () => {
  it('getPetsRoot 指向仓库 pets（开发态）', () => {
    const root = getPetsRoot();
    assert.ok(fs.existsSync(root));
    assert.ok(fs.existsSync(path.join(root, 'manifest.json')));
  });

  it('pathToPetAssetUrl 生成 pet-asset URL', () => {
    const root = getPetsRoot();
    const idle = path.join(root, 'guga', 'large', 'webm', 'idle.webm');
    if (!fs.existsSync(idle)) return;
    const url = pathToPetAssetUrl(idle);
    assert.match(url, /^pet-asset:\/\/asset\//);
    assert.match(url, /guga/);
    assert.match(url, /idle\.webm/);
  });

  it('pathToPetAssetUrl 拒绝根外路径', () => {
    assert.throws(
      () => pathToPetAssetUrl(path.join(os.tmpdir(), 'outside.bin')),
      /不在 pets 根内/,
    );
  });
});

describe('schema 校验失败策略（loadPet 不阻断返回）', () => {
  it('通过 @pet/schema loadPet：校验失败仍有 config', async () => {
    const schema = await import('@pet/schema');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-loader-val-'));
    try {
      const id = 'broken-video';
      const dir = path.join(root, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'pet.json'),
        JSON.stringify({
          id,
          renderer: 'video',
          video: { dir: 'v', clips: {} },
        }),
        'utf8',
      );
      const loaded = await schema.loadPet(root, id);
      // 策略：不抛错，validation.ok === false，调用方可降级
      assert.equal(loaded.validation.ok, false);
      assert.ok(loaded.validation.issues.length > 0);
      assert.equal(loaded.config.id, id);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('buildLoadMeta / formatValidationIssues', () => {
  it('degraded 含用户提示', () => {
    const m = buildLoadMeta('doro', 'degraded', 'x');
    assert.equal(m.mode, 'degraded');
    assert.equal(m.degraded, true);
    assert.match(m.userMessage, /doro/);
    assert.match(m.userMessage, /降级/);
  });

  it('ok 无提示', () => {
    const m = buildLoadMeta('guga', 'ok');
    assert.equal(m.degraded, false);
    assert.equal(m.userMessage, '');
  });

  it('formatValidationIssues', () => {
    const s = formatValidationIssues([
      { severity: 'error', code: 'IDLE_MISSING', path: 'video', message: '缺 idle' },
    ]);
    assert.match(s, /IDLE_MISSING/);
    assert.match(s, /缺 idle/);
  });
});

describe('buildPayloadFromLoaded 拒载 / 降级', () => {
  /** @type {string} */
  let petsRoot;
  /** @type {string} */
  let petDir;

  before(() => {
    // 使用仓库 guga 真实 idle，保证 pathToPetAssetUrl 合法
    petsRoot = getPetsRoot();
    petDir = path.join(petsRoot, 'guga');
  });

  it('缺 idle 拒载', () => {
    assert.throws(
      () =>
        buildPayloadFromLoaded('ghost', {
          config: {
            id: 'ghost',
            displayName: 'ghost',
            renderer: 'video',
            video: { dir: 'large/webm', clips: { walk: { file: 'no.webm' } } },
            behaviorMap: {},
            size: { width: 10, height: 10 },
          },
          dir: petDir,
          validation: { ok: true, issues: [] },
        }),
      /拒载|缺少可用的 idle/,
    );
  });

  it('校验失败但有 idle 时降级加载', () => {
    const idlePath = path.join(petDir, 'large', 'webm', 'idle.webm');
    if (!fs.existsSync(idlePath)) return;

    const payload = buildPayloadFromLoaded('guga', {
      config: {
        id: 'guga',
        displayName: 'guga',
        renderer: 'video',
        video: {
          dir: 'large/webm',
          clips: { idle: { file: 'idle.webm', loop: true } },
        },
        behaviorMap: { idle: ['idle'] },
        size: { width: 180, height: 180 },
      },
      dir: petDir,
      validation: {
        ok: false,
        issues: [
          {
            severity: 'error',
            code: 'TEST',
            path: 'x',
            message: '模拟校验失败',
          },
        ],
      },
    });
    assert.ok(payload.clips?.idle);
    assert.equal(payload.loadMeta?.mode, 'degraded');
    assert.equal(payload.loadMeta?.degraded, true);
    assert.match(payload.loadMeta?.userMessage || '', /降级/);
  });

  it('校验通过 mode=ok', () => {
    const idlePath = path.join(petDir, 'large', 'webm', 'idle.webm');
    if (!fs.existsSync(idlePath)) return;

    const payload = buildPayloadFromLoaded('guga', {
      config: {
        id: 'guga',
        displayName: 'guga',
        renderer: 'video',
        video: {
          dir: 'large/webm',
          clips: { idle: { file: 'idle.webm', loop: true } },
        },
        behaviorMap: {},
        size: { width: 180, height: 180 },
      },
      dir: petDir,
      validation: { ok: true, issues: [] },
    });
    assert.equal(payload.loadMeta?.mode, 'ok');
    assert.equal(payload.loadMeta?.degraded, false);
  });
});

describe('payload 缓存（B-602）', () => {
  beforeEach(() => {
    clearPetPayloadCache();
  });

  after(() => {
    clearPetPayloadCache();
  });

  it('二次 load 命中缓存；invalidate 后重新加载', async () => {
    const idle = path.join(getPetsRoot(), 'guga', 'large', 'webm', 'idle.webm');
    if (!fs.existsSync(idle)) return;

    const a = await loadPetPayload('guga');
    assert.ok(a.clips?.idle || a.idle);
    assert.ok(getCachedPetIds().includes('guga'));

    const b = await loadPetPayload('guga');
    assert.strictEqual(a, b);

    invalidatePetPayloadCache('guga');
    assert.ok(!getCachedPetIds().includes('guga'));

    const c = await loadPetPayload('guga');
    assert.notStrictEqual(a, c);
    assert.equal(c.id, 'guga');
  });

  it('force 跳过缓存', async () => {
    const idle = path.join(getPetsRoot(), 'guga', 'large', 'webm', 'idle.webm');
    if (!fs.existsSync(idle)) return;

    const a = await loadPetPayload('guga');
    const b = await loadPetPayload('guga', { force: true });
    assert.notStrictEqual(a, b);
  });
});
