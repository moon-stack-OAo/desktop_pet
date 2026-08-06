import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {LoadAllPetsResult, LoadedPet, Manifest, RawPetConfig,} from './types.js';
import {normalizePet} from './normalize.js';
import {validateManifest, validatePet} from './validate.js';

async function readJsonFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as unknown;
}

/**
 * 加载 pets/manifest.json
 */
export async function loadManifest(petsRoot: string): Promise<Manifest> {
  const filePath = path.join(petsRoot, 'manifest.json');
  const data = await readJsonFile(filePath);
  const result = validateManifest(data);
  if (!result.ok) {
    const msg = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`Invalid manifest at ${filePath}: ${msg}`);
  }
  return { pets: result.pets };
}

/**
 * 加载单只宠物：读取 pet.json → normalize → validate
 * 即使校验失败也会返回 LoadedPet（validation.ok === false）
 */
export async function loadPet(petsRoot: string, petId: string): Promise<LoadedPet> {
  const dir = path.join(petsRoot, petId);
  const filePath = path.join(dir, 'pet.json');
  const data = (await readJsonFile(filePath)) as RawPetConfig;
  const raw = data && typeof data === 'object' ? data : {};
  const config = normalizePet(raw, petId);
  // 若文件内 id 与目录不一致，以目录 id 为准并写回 config.id（仅当 id 为空时已用 fallback）
  if (!config.id) {
    config.id = petId;
  }
  const validation = validatePet(config);
  return {
    id: petId,
    dir,
    raw,
    config,
    validation,
  };
}

/**
 * 按 manifest 加载全部宠物并 normalize + validate
 */
export async function loadAllPets(petsRoot: string): Promise<LoadAllPetsResult> {
  const manifest = await loadManifest(petsRoot);
  const pets: LoadedPet[] = [];

  for (const petId of manifest.pets) {
    try {
      const loaded = await loadPet(petsRoot, petId);
      pets.push(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pets.push({
        id: petId,
        dir: path.join(petsRoot, petId),
        raw: {},
        config: normalizePet({}, petId),
        validation: {
          ok: false,
          issues: [
            {
              path: 'pet.json',
              message: `加载失败: ${message}`,
              severity: 'error',
              code: 'LOAD_FAILED',
            },
          ],
        },
      });
    }
  }

  const ok = pets.every((p) => p.validation.ok);
  return { manifest, pets, ok };
}
