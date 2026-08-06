/**
 * @pet/schema normalize / validate 单测
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePet,
  validateManifest,
  validatePet,
  validateRawPet,
} from '../dist/index.js';

describe('normalizePet', () => {
  it('video 宠：补全 displayName / size / 提升 behaviorMap', () => {
    const config = normalizePet(
      {
        id: 'demo',
        name: '演示',
        renderer: 'video',
        video: {
          dir: 'clips',
          clips: {
            idle: { file: 'idle.webm', loop: true },
            walk: 'walk.webm',
          },
          behaviorMap: { walk: ['walk'] },
        },
      },
      'fallback',
    );
    assert.equal(config.id, 'demo');
    assert.equal(config.displayName, '演示');
    assert.equal(config.renderer, 'video');
    assert.equal(config.size.width, 160);
    assert.equal(config.video?.dir, 'clips');
    assert.equal(config.video?.clips.idle?.file, 'idle.webm');
    assert.equal(config.video?.clips.walk?.file, 'walk.webm');
    assert.deepEqual(config.behaviorMap?.walk, ['walk']);
  });

  it('spritesheetPath 推断 renderer', () => {
    const config = normalizePet({
      id: 's1',
      spritesheetPath: 'sheet.png',
    });
    assert.equal(config.renderer, 'spritesheet');
    assert.equal(config.spritesheet?.path, 'sheet.png');
  });

  it('无 id 时使用 fallbackId', () => {
    const config = normalizePet({}, 'from-dir');
    assert.equal(config.id, 'from-dir');
    assert.equal(config.displayName, 'from-dir');
  });

  it('displayName 优先于 name', () => {
    const config = normalizePet({
      id: 'x',
      name: 'n',
      displayName: 'D',
      spritesheetPath: 'a.png',
    });
    assert.equal(config.displayName, 'D');
    assert.equal(config.name, 'n');
  });

  it('非法 size 回退默认', () => {
    const config = normalizePet({
      id: 'x',
      size: { width: -1, height: 0 },
      spritesheetPath: 'a.png',
    });
    assert.equal(config.size.width, 160);
    assert.equal(config.size.height, 160);
  });

  it('atlas → spritesheet（renderer/path/帧/animations/behaviorMap）', () => {
    const config = normalizePet({
      id: 'doro-like',
      name: 'Doro',
      renderer: 'atlas',
      atlas: {
        image: 'spritesheet.webp',
        cellW: 192,
        cellH: 208,
        cols: 8,
        rows: 9,
        states: {
          idle: { row: 0, frames: 6, fps: 4, loop: true },
          walk: { row: 1, frames: 8, fps: 8, loop: true },
          happy: { row: 3, frames: 4, fps: 8, loop: false },
          eat: { row: 3, frames: 4, fps: 8, loop: false },
        },
      },
    });
    assert.equal(config.renderer, 'spritesheet');
    assert.equal(config.spritesheet?.path, 'spritesheet.webp');
    assert.equal(config.spritesheet?.frameWidth, 192);
    assert.equal(config.spritesheet?.frameHeight, 208);
    assert.equal(config.spritesheet?.columns, 8);
    assert.equal(config.spritesheet?.rows, 9);
    assert.equal(config.spritesheet?.animations?.idle?.frames, 6);
    assert.equal(config.spritesheet?.animations?.walk?.row, 1);
    assert.equal(config.spritesheet?.animations?.happy?.loop, false);
    assert.deepEqual(config.behaviorMap?.walk, ['walk']);
    assert.deepEqual(config.behaviorMap?.happy, ['happy']);
    assert.deepEqual(config.behaviorMap?.eat, ['eat']);
  });

  it('显式 behaviorMap 优先于 atlas 推导', () => {
    const config = normalizePet({
      id: 'x',
      renderer: 'atlas',
      behaviorMap: { walk: ['run-right'] },
      atlas: {
        image: 's.webp',
        states: {
          idle: { row: 0, frames: 1, loop: true },
          walk: { row: 1, frames: 2, loop: true },
          'run-right': { row: 1, frames: 2, loop: true },
        },
      },
    });
    assert.deepEqual(config.behaviorMap?.walk, ['run-right']);
    assert.equal(config.behaviorMap?.idle, undefined);
  });
});

describe('validatePet', () => {
  it('合法 video 配置 ok', () => {
    const config = normalizePet({
      id: 'guga',
      name: '咕嘎',
      renderer: 'video',
      video: {
        dir: 'large/webm',
        clips: {
          idle: { file: 'idle.webm', loop: true },
          walk: { file: 'walk.webm', loop: true },
        },
      },
    });
    const result = validatePet(config);
    assert.equal(result.ok, true);
    assert.equal(result.issues.filter((i) => i.severity === 'error').length, 0);
  });

  it('缺少 id 报错', () => {
    const config = normalizePet({ spritesheetPath: 'a.png' });
    config.id = '';
    const result = validatePet(config);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'ID_REQUIRED'));
  });

  it('video 缺少 clips 报错', () => {
    const config = normalizePet({
      id: 'v',
      renderer: 'video',
      video: { dir: 'x', clips: {} },
    });
    // normalize 会保留空 clips
    const result = validatePet({
      ...config,
      video: { dir: 'x', clips: {} },
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'CLIPS_REQUIRED'));
  });

  it('video 缺少 idle 仅警告', () => {
    const result = validatePet({
      id: 'v',
      displayName: 'v',
      size: { width: 10, height: 10 },
      renderer: 'video',
      video: {
        dir: 'clips',
        clips: { walk: { file: 'walk.webm' } },
      },
    });
    assert.equal(result.ok, true);
    assert.ok(result.issues.some((i) => i.code === 'IDLE_MISSING'));
  });

  it('绝对路径报 PATH_NOT_RELATIVE', () => {
    const result = validatePet({
      id: 'v',
      displayName: 'v',
      size: { width: 10, height: 10 },
      renderer: 'video',
      video: {
        dir: 'C:\\abs',
        clips: { idle: { file: '/etc/passwd' } },
      },
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'PATH_NOT_RELATIVE'));
  });

  it('spritesheet 缺少 path 报错', () => {
    const result = validatePet({
      id: 's',
      displayName: 's',
      size: { width: 10, height: 10 },
      renderer: 'spritesheet',
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'SPRITESHEET_PATH_REQUIRED'));
  });
});

describe('validateRawPet', () => {
  it('串联 normalize + validate', () => {
    const { ok, config, issues } = validateRawPet(
      {
        name: '仅 name',
        video: {
          dir: 'v',
          clips: { idle: 'idle.webm' },
        },
      },
      'raw1',
    );
    assert.equal(ok, true);
    assert.equal(config.id, 'raw1');
    assert.equal(config.displayName, '仅 name');
    assert.equal(config.renderer, 'video');
    assert.ok(Array.isArray(issues));
  });
});

describe('validateManifest', () => {
  it('合法 manifest', () => {
    const result = validateManifest({ pets: ['guga', 'doro'] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.pets, ['guga', 'doro']);
  });

  it('非对象失败', () => {
    const result = validateManifest(null);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'MANIFEST_TYPE'));
  });

  it('空 pets 失败', () => {
    const result = validateManifest({ pets: [] });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'MANIFEST_EMPTY'));
  });

  it('非法 id 项失败', () => {
    const result = validateManifest({ pets: ['ok', ''] });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'MANIFEST_ID'));
  });
});
