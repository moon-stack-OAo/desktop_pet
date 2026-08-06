# @pet/schema

desktop_pet `pet.json` 的 TypeScript 类型、规范化（normalize）与校验（validate），以及 Node 侧加载工具。

## 安装

在 monorepo 根目录或本包内：

```bash
cd packages/schema
npm install
```

类型检查：

```bash
npx tsc --noEmit
# 或
npm run typecheck
```

构建：

```bash
npm run build
```

## 统一模型

所有宠物最终规范为 **`PetConfig`**，兼容：

| 原始字段                                     | 规范化结果                                     |
|------------------------------------------|-------------------------------------------|
| `name` / `displayName`                   | `displayName = displayName ?? name ?? id` |
| `renderer` 或 `video` / `spritesheetPath` | `renderer: 'video' \| 'spritesheet'`      |
| `renderer: "atlas"` / `atlas`            | `renderer: 'spritesheet'` + 映射 `spritesheet`（B-804） |
| `atlas.image` / `cellW` / `states`       | `path` / `frameWidth` / `animations`      |
| `spritesheetPath`                        | `spritesheet.path`                        |
| 缺 `size`                                 | 默认 `{ width: 160, height: 160 }`        |
| `video.behaviorMap`                      | 提升到顶层 `behaviorMap`（`video` 内仍保留）         |
| 无 `behaviorMap` 时的 animations 名        | 为核心行为推导 `behaviorMap`（idle/walk/happy…） |

## API

### 类型（`types`）

- `PetConfig` / `RawPetConfig`
- `RendererType`、`VideoConfig`、`VideoClip`、`BehaviorMap`
- `SpritesheetConfig`、`AudioConfig`、`AiConfig`
- `Manifest`
- `ValidationIssue` / `ValidationResult`
- `LoadedPet` / `LoadAllPetsResult`

### `normalizePet(raw, fallbackId?)`

将原始 JSON 转为统一 `PetConfig`，不抛错。

### `validatePet(config)` / `validateRawPet(raw, fallbackId?)`

返回 `{ ok, issues }`。规则摘要：

- `id` 必填非空
- video：必须有 `video.clips` 且至少一个 clip；缺 `idle` 为 warning
- spritesheet：必须有 `spritesheet.path`
- 路径字段须为相对路径

### `loadManifest` / `loadPet` / `loadAllPets`

基于 Node `fs` 从 `petsRoot` 读取资源：

```ts
import path from 'node:path';
import {loadAllPets, loadPet, normalizePet, validatePet} from '@pet/schema';

const petsRoot = path.resolve('../../pets'); // 按实际路径调整

const all = await loadAllPets(petsRoot);
console.log(all.ok, all.pets.map((p) => [p.id, p.validation.ok]));

const one = await loadPet(petsRoot, 'guga');
console.log(one.config.renderer, one.config.displayName);
```

纯校验（不读盘）：

```ts
import {normalizePet, validatePet} from '@pet/schema';

const config = normalizePet({
    id: 'doro',
    displayName: 'Doro',
    spritesheetPath: 'spritesheet.webp',
});
const result = validatePet(config);
// result.ok === true
```

## 目录约定

```
pets/
  manifest.json          # { "pets": ["guga", "doro", ...] }
  <petId>/
    pet.json
    ...
```

本包**不修改** `pets/` 下资源文件，仅读取与解析。
