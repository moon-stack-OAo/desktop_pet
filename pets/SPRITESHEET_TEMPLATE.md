# 精灵表宠物配置手册

本文说明如何为 desktop_pet 配置 **spritesheet** 型宠物（含历史 `atlas` 写法），以及切帧、行为映射与校验约定。

> **视频宠** `guga`（`renderer: video`）不在本文范围，见 `pets/guga/pet.json`。  
> **完成度一览**见 [COMPLETION.md](./COMPLETION.md)。  
> **schema 规范化**见 [packages/schema/README.md](../packages/schema/README.md)。

---

## 当前仓库状态（2026）

| 项          | 说明                                                                                              |
|------------|-------------------------------------------------------------------------------------------------|
| 现网 11 只精灵宠 | `doro` / `elaina` / `homie` / … / `wukong`，磁盘上多为 **`renderer: "atlas"` + `atlas`**              |
| 运行时        | `@pet/schema` 的 `normalizePet` 将 atlas **映射**为 `renderer: "spritesheet"` + `spritesheet`（B-804） |
| 网格（11 宠一致） | **8 列 × 9 行**，单格 **192×208**；`homie` 图为 `spritesheet.png`，其余多为 `spritesheet.webp`               |
| 多帧         | idle / walk / happy / eat 等已在 `atlas.states` 中配置并生效，**不再是全员 idle 占位**                           |
| 推荐新宠写法     | 直接写 `renderer: "spritesheet"` + `spritesheet`（见下文模板）；不必再写 atlas                                 |

---

## 目录约定

```
pets/
├── manifest.json          # 注册 id 列表
├── <petId>/
│   ├── pet.json           # 配置（必填）
│   ├── persona.md         # AI 人设（推荐）
│   └── spritesheet.webp   # 或 .png；路径与配置一致
└── …
```

1. 新建目录 `pets/<petId>/`
2. 放入精灵表图片与 `pet.json`、`persona.md`
3. 在 `pets/manifest.json` 的 `pets` 数组中加入 `<petId>`
4. 校验：`npm run test:schema`（含 `loadPet` / `loadAllPets`）或本地 `desktop:dev` 切宠

---

## 统一字段概览

| 字段                                | 说明                                                           |
|-----------------------------------|--------------------------------------------------------------|
| `id` / `displayName` / `name`     | 标识与展示名；`displayName ?? name ?? id`                           |
| `version`                         | 配置版本字符串（可选）                                                  |
| `greeting`                        | 开场问候                                                         |
| `description` / `kind` / `colors` | 元数据（可选）                                                      |
| `renderer`                        | 推荐 `"spritesheet"`；历史可用 `"atlas"`（normalize 后变为 spritesheet） |
| `size`                            | 窗口/逻辑尺寸，默认 **160×160**                                       |
| `spritesheet`                     | 推荐主配置（path / 帧尺寸 / animations）                               |
| `spritesheetPath`                 | 兼容旧字段；有则映射为 `spritesheet.path`                               |
| `atlas`                           | 历史格式；见下节映射表                                                  |
| `behaviorMap`                     | 行为名 → 动画名列表；缺省时由核心动画名推导                                      |
| `ai.personaFile`                  | 通常为 `persona.md`                                             |

---

## 历史 `atlas` → 运行时 `spritesheet`

`normalizePet` 映射关系：

| atlas             | spritesheet                                                 |
|-------------------|-------------------------------------------------------------|
| `image`（或 `path`） | `path`                                                      |
| `cellW` / `cellH` | `frameWidth` / `frameHeight`                                |
| `cols` / `rows`   | `columns` / `rows`                                          |
| `states.<name>`   | `animations.<name>`（保留 `row` / `frames` / `fps` / `loop` 等） |

- `renderer: "atlas"` → `renderer: "spritesheet"`
- 无顶层 `behaviorMap` 时：若存在 `idle`/`walk`/`happy`/`eat`/`sleep`/`play`/`hungry`/`sick`/`hunt` 动画名，则推导为
  `"walk": ["walk"]` 等形式
- **显式 `behaviorMap` 优先于推导**

现网 11 宠推荐 `states` 行号与参数（美术 9 行布局；**同 row 用 fps/loop 区分**）：

| 状态 | row | frames | fps | loop | 说明 |
|------|-----|--------|-----|------|------|
| idle | 0 | 6 | 4 | true | 待机 |
| walk | 1 | 8 | 8 | true | 走路 |
| run-right | 1 | 8 | **12** | true | 同 walk 行，更快 |
| run-left | 2 | 8 | 8 | true | 左跑 |
| eat | 3 | 4 | 8 | false | 喂食（独占 row3 语义） |
| waving | 3 | 4 | 10 | false | 同 eat 行，略快；作 happy 回退 |
| play | 4 | 5 | 8 | true | 玩耍 |
| jumping | 4 | 5 | 10 | true | 同 play 行，略快 |
| sick | 5 | 8 | 4 | true | 生病 |
| failed | 5 | 8 | 6 | true | 同 sick 行，略快 |
| sleep | 6 | 6 | 3 | true | 睡觉 |
| hungry | 6 | 6 | 5 | true | 同 sleep 行（仅 fps 不同，美术未拆行） |
| waiting | 6 | 6 | 4 | true | 同 sleep 行 |
| hunt | 7 | 6 | 8 | true | 狩猎/忙碌 |
| running | 7 | 6 | 12 | true | 同 hunt 行，更快 |
| **happy** | **8** | 6 | 6 | false | **独立 row8**，勿与 eat 同 row |
| review | 8 | 6 | 5 | true | 与 happy 同美术行，loop/fps 不同 |

### 菜单行为绑定建议（显式 `behaviorMap`）

**应写顶层显式 `behaviorMap`**（normalize 会尊重显式 map，优先于按动画名推导）。现网 11 宠统一推荐：

```json
"behaviorMap": {
  "idle": ["idle"],
  "walk": ["walk", "run-right"],
  "eat": ["eat"],
  "happy": ["happy", "review", "waving"],
  "play": ["play", "jumping"],
  "sleep": ["sleep"],
  "hungry": ["hungry", "waiting"],
  "sick": ["sick", "failed"],
  "hunt": ["hunt", "running"]
}
```

要点：

- **happy 用独立 row（建议 row8 / review 行）**，不要与 eat 共用 row3；菜单「摸摸头」与「喂食」才能明显区分。
- `happy` 优先 `happy(row8)`，其次 `review`，再 `waving`；`eat` 仅映射 `eat(row3)`。
- 同 row 别名用更高 fps 做视觉区分（如 walk 8 vs run-right 12）。
- 残留限制：hungry / sleep / waiting 仍同 row6，仅 fps 不同（待美术拆行）。

目视抽检、错行修正见 [COMPLETION.md](./COMPLETION.md)。

---

## 推荐：`spritesheet` 直写格式

### 动画字段（`SpritesheetAnimation`）

| 字段                 | 说明                                   |
|--------------------|--------------------------------------|
| `row`              | 行模式：第几行（从 0 起）                       |
| `start` / `column` | 行内起始列；同时存在时 **`start` 优先**           |
| `frames`           | 连续帧数                                 |
| `fps`              | 帧率                                   |
| `loop`             | 是否循环；`false` 时播完触发 FSM `onClipEnded` |

扩展字段可通过索引签名保留，normalize 会原样带入。

### 帧定位（与 `PetSpritesheet.tsx` 一致）

网格 **行优先（row-major）**：

```
linear = base + frameIndex
sx = (linear % columns) * frameWidth
sy = floor(linear / columns) * frameHeight
```

| 模式   | 条件        | `base`                                   |
|------|-----------|------------------------------------------|
| 行模式  | 配置了 `row` | `row * columns + (start ?? column ?? 0)` |
| 线性模式 | 未配置 `row` | `start ?? 0`                             |

`columns`：优先配置值；否则 `floor(图宽 / frameWidth)`（至少 1）。  
`frames === 1` 的 idle 可走单帧静态路径（不强制 canvas 切帧）。

示例：

```json
"walk": {"row": 1, "frames": 8, "loop": true, "fps": 8}
```

```json
"walk": {"start": 8, "frames": 8, "loop": true, "fps": 8}
```

同行从第 2 列起：`{ "row": 1, "start": 2, "frames": 3, "loop": true, "fps": 10 }`。

### `behaviorMap`

- 键：FSM 行为名（`idle` / `walk` / `eat` / `happy` / `play` / `sleep` / `hungry` …）
- 值：候选 **动画名** 列表（须存在于 `animations` / clips）
- 例：`"happy": ["happy", "idle"]` 表示优先 happy，缺失时回退 idle
- 仅写 `walk → idle` 时，画面仍是 idle，**不要**称为已补全走路动画（FSM 可能 fold 占位）

---

## 新增角色：推荐模板

```json
{
  "id": "<pet-id>",
  "displayName": "<展示名>",
  "name": "<展示名>",
  "version": "1.0.0",
  "greeting": "……",
  "description": "……",
  "renderer": "spritesheet",
  "size": {
    "width": 160,
    "height": 160
  },
  "spritesheetPath": "spritesheet.webp",
  "spritesheet": {
    "path": "spritesheet.webp",
    "frameWidth": 192,
    "frameHeight": 208,
    "columns": 8,
    "rows": 9,
    "animations": {
      "idle": {
        "row": 0,
        "frames": 6,
        "loop": true,
        "fps": 4
      },
      "walk": {
        "row": 1,
        "frames": 8,
        "loop": true,
        "fps": 8
      },
      "eat": {
        "row": 3,
        "frames": 4,
        "loop": false,
        "fps": 8
      },
      "happy": {
        "row": 8,
        "frames": 6,
        "loop": false,
        "fps": 6
      },
      "play": {
        "row": 4,
        "frames": 5,
        "loop": true,
        "fps": 8
      },
      "sleep": {
        "row": 6,
        "frames": 6,
        "loop": true,
        "fps": 3
      },
      "hungry": {
        "row": 6,
        "frames": 6,
        "loop": true,
        "fps": 5
      },
      "review": {
        "row": 8,
        "frames": 6,
        "loop": true,
        "fps": 5
      }
    }
  },
  "behaviorMap": {
    "idle": ["idle"],
    "walk": ["walk", "run-right"],
    "eat": ["eat"],
    "happy": ["happy", "review", "waving"],
    "play": ["play", "jumping"],
    "sleep": ["sleep"],
    "hungry": ["hungry", "waiting"],
    "sick": ["sick", "failed"],
    "hunt": ["hunt", "running"]
  },
  "ai": {
    "personaFile": "persona.md"
  }
}
```

> `frameWidth` / `columns` 等请按**实际量图**填写，上表数值对齐现网 11 宠网格，仅作参考。

### 兼容：仅占位单帧（应急）

美术未齐时可用最小可运行配置（**明确为占位**）：

```json
"spritesheet": {
"path": "spritesheet.webp",
"frameWidth": 128,
"frameHeight": 128,
"animations": {
"idle": {
"row": 0, "frames": 1, "loop": true, "fps": 8
}
}
},
"behaviorMap": {
"idle": ["idle"],
"walk": ["idle"],
"happy": ["idle"]
}
```

桌面端喂食/摸头等在动画不可辨时仍可能更新养成并 `flashStatus`；自主 `walk` 调度在 map 能解析到 clip 时仍会触发，画面可能仍是
idle。

---

## 量图与修正步骤

1. **量图**：查看 spritesheet 宽高；规则网格时  
   `frameWidth = 图宽 / columns`，`frameHeight = 图高 / rows`。
2. **写网格**：`frameWidth` / `frameHeight`，建议同时写 `columns` / `rows`。
3. **写 `animations`**：为各动作指定 `row` 或 `start`、`frames`、`fps`、`loop`。
4. **写 `behaviorMap`**：行为指向真实动画名，避免无意义的全 map→idle。
5. **校验**：`loadPet` / `loadAllPets` 无 error；`desktop:dev` 目视 walk / happy。
6. **勿删资源**：修正配置时不要误删 `persona.md`、原图、音频。

---

## 校验与加载

| 层                    | 行为                                                         |
|----------------------|------------------------------------------------------------|
| schema `validatePet` | spritesheet 型必须有非空相对路径 `spritesheet.path`；动画元数据错误**不**硬拦   |
| 主进程 `pet-loader`     | 图片必须存在；缺 idle / 无法构建则**拒载**；schema 有 error 但仍可构建则**降级**并提示 |
| 路径                   | 相对宠物目录；禁止绝对路径                                              |

路径变更时请同步：`spritesheet.path`、可选 `spritesheetPath`、实际文件名（如 webp/png）。

---

## 注意事项

- `pet.json` **不能写注释**；说明放在本文件或 COMPLETION。
- 保持 `spritesheetPath` 与 `spritesheet.path` 一致（若两者都写）。
- 未发 TAG 前勿随意改产品版本号；宠物 `version` 字段可按角色配置独立维护。
- AI 人设见各宠 `persona.md`；与动画配置解耦。

---

## 相关链接

| 文档                                                        | 内容                       |
|-----------------------------------------------------------|--------------------------|
| [COMPLETION.md](./COMPLETION.md)                          | 各宠动画完成度、目视验收             |
| [packages/schema/README.md](../packages/schema/README.md) | normalize / validate API |
| `apps/desktop/src/components/PetSpritesheet.tsx`          | 渲染切帧实现                   |
| 根 [README.md](../README.md)                               | monorepo 快速启动            |
