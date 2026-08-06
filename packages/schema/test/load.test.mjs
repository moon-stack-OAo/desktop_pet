/**
 * @pet/schema loadPet / loadManifest / loadAllPets 单测
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, after } from 'node:test';
import { loadAllPets, loadManifest, loadPet } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_PETS = path.resolve(__dirname, '../../../pets');

describe('loadManifest / loadPet（仓库 pets）', () => {
  it('loadManifest 读取真实 manifest', async () => {
    const manifest = await loadManifest(REPO_PETS);
    assert.ok(Array.isArray(manifest.pets));
    assert.ok(manifest.pets.includes('guga'));
  });

  it('loadPet(guga) 校验通过', async () => {
    const loaded = await loadPet(REPO_PETS, 'guga');
    assert.equal(loaded.id, 'guga');
    assert.equal(loaded.config.id, 'guga');
    assert.equal(loaded.config.renderer, 'video');
    assert.equal(loaded.validation.ok, true);
    assert.ok(loaded.config.video?.clips?.idle);
  });

  it('loadPet(doro) atlas 映射为 spritesheet 且校验通过', async () => {
    const loaded = await loadPet(REPO_PETS, 'doro');
    assert.equal(loaded.id, 'doro');
    assert.equal(loaded.config.renderer, 'spritesheet');
    assert.equal(loaded.validation.ok, true);
    assert.equal(loaded.config.spritesheet?.path, 'spritesheet.webp');
    assert.equal(loaded.config.spritesheet?.frameWidth, 192);
    assert.ok(loaded.config.spritesheet?.animations?.walk);
    assert.equal(loaded.config.spritesheet?.animations?.walk?.frames, 8);
    assert.deepEqual(loaded.config.behaviorMap?.walk, ['walk']);
    assert.deepEqual(loaded.config.behaviorMap?.happy, ['happy']);
  });

  it('loadPet 不存在目录抛错', async () => {
    await assert.rejects(
      () => loadPet(REPO_PETS, '__no_such_pet__'),
      /ENOENT|no such file|找不到/i,
    );
  });
});

describe('loadAllPets / 异常路径（临时目录）', () => {
  /** @type {string | null} */
  let tempRoot = null;

  after(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('校验失败仍返回 LoadedPet 且 validation.ok=false', async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'pet-schema-'));
    const petId = 'badpet';
    const dir = path.join(tempRoot, petId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(tempRoot, 'manifest.json'),
      JSON.stringify({ pets: [petId] }),
      'utf8',
    );
    // video 型但 clips 为空 → 校验失败
    await writeFile(
      path.join(dir, 'pet.json'),
      JSON.stringify({
        id: petId,
        renderer: 'video',
        video: { dir: 'v', clips: {} },
      }),
      'utf8',
    );

    const loaded = await loadPet(tempRoot, petId);
    assert.equal(loaded.validation.ok, false);
    assert.ok(loaded.validation.issues.some((i) => i.severity === 'error'));

    const all = await loadAllPets(tempRoot);
    assert.equal(all.ok, false);
    assert.equal(all.pets.length, 1);
    assert.equal(all.pets[0]?.validation.ok, false);
  });

  it('pet.json 缺失时 loadAllPets 捕获为 LOAD_FAILED', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pet-schema-miss-'));
    tempRoot = root;
    await writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({ pets: ['ghost'] }),
      'utf8',
    );
    // 不创建 ghost/pet.json
    const all = await loadAllPets(root);
    assert.equal(all.ok, false);
    assert.equal(all.pets[0]?.id, 'ghost');
    assert.equal(all.pets[0]?.validation.ok, false);
    assert.ok(
      all.pets[0]?.validation.issues.some((i) => i.code === 'LOAD_FAILED'),
    );
  });

  it('非法 manifest 抛错', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pet-schema-man-'));
    tempRoot = root;
    await writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({ pets: [] }),
      'utf8',
    );
    await assert.rejects(() => loadManifest(root), /Invalid manifest/);
  });
});
