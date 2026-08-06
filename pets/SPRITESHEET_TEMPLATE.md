# 精灵表宠物配置模板说明

本文说明 11 只 `renderer: "spritesheet"` 宠物的 `pet.json` 扩展字段含义，以及**占位动画**日后如何按真实切帧修正。

> `guga` 为 `video` 型完整配置，不在本文范围。

## 统一字段概览

| 字段                            | 说明                                  |
|-------------------------------|-------------------------------------|
| `id` / `displayName` / `name` | 标识与展示名；`name` 可与 `displayName` 相同   |
| `version`                     | 配置版本，占位 `1.0.0`                     |
| `greeting`                    | 开场问候语                               |
| `description` / `kind`        | 保留原描述；`kind` 仅在原有时保留                |
| `renderer`                    | 固定 `"spritesheet"`                  |
| `size`                        | desktop_pet 窗口/逻辑尺寸，默认 `160×160`    |
| `spritesheetPath`             | 兼容旧字段，与 `spritesheet.path` **必须一致** |
| `spritesheet`                 | 精灵表元数据（见下）                          |
| `behaviorMap`                 | 行为名 → 动画名列表                         |
| `ai.personaFile`              | 人设文件，通常为 `persona.md`               |

## 占位动画约定（当前状态）

真实 spritesheet 的**行列数、单帧像素、各动作帧数尚未标定**，因此统一使用最小可运行占位：

```json
"spritesheet":{"path": "spritesheet.webp", "frameWidth": 128, "frameHeight": 128, "animations": {"idle": {"row": 0, "frames": 1, "loop": true, "fps": 8}}}
```

含义：

- `frameWidth` / `frameHeight`：默认按 **128×128** 单帧估算（非实测）
- `idle`：第 0 行、**仅 1 帧**、循环；渲染器可先把整图或左上角一格当静态 idle
- 其余行为在 `behaviorMap` 中暂时全部映射到 `"idle"`，避免缺动画报错——**这是占位，不是多帧 walk/happy/eat/sleep**
- **`play` / `hungry` 等**：与 walk 相同，当前占位映射到 `idle`；桌面端喂食/摸头/玩耍在动画不可辨时仍更新养成值并显示短时 status（`flashStatus`）
- **自主走动**：只要 `behaviorMap.walk` 能解析到已有动画（含映射到 `idle`），`AutoScheduler` 就会定时 `request('walk')`。占位阶段画面仍是 idle 单帧，仅 FSM behavior 变为 `walk`；**不要**把这说成已补全走路动画

**homie** 的图片为 `spritesheet.png`，其余多为 `spritesheet.webp`。改路径时务必同步 `spritesheetPath` 与
`spritesheet.path`。

## schema 中的动画字段

`packages/schema` 的 `SpritesheetAnimation` 一等字段为：

- `start`：起始帧索引（可选）
- `frames`：帧数（可选）
- `fps`：帧率（可选）
- `loop`：是否循环（可选）

扩展字段（如 `row`、`column`）可通过索引签名保留，normalize 会原样带入 `animations`。

渲染器帧定位约定（**行优先 / row-major**，见 `PetSpritesheet.tsx`）：

| 模式 | 条件 | 起始线性索引 `base` | 第 i 帧源点 |
|------|------|---------------------|-------------|
| 行模式 | 配置了 `row` | `row * columns + (start ?? column ?? 0)` | `sx/sy` 由 `base + i` 行优先换算 |
| 线性模式 | 未配置 `row` | `start ?? 0` | 同上 |

`columns` 优先取精灵表配置；否则 `floor(图宽 / frameWidth)`。

推荐日后写法（二选一）：

```json
"walk": {"row": 1, "frames": 4, "loop": true, "fps": 10}
```

或：

```json
"walk": {"start": 8, "frames": 4, "loop": true, "fps": 10}
```

同行动画从第 2 列起可写：`{"row": 1, "start": 2, "frames": 3, ...}`（`column` 与 `start` 在行模式下等价作起始列；同时存在时 **`start` 优先**）。

`SpritesheetConfig` 还可补充：

- `columns` / `rows`：整张表的列数、行数
- 与 `frameWidth` / `frameHeight` 一起用于自动切片

## 如何按真实切帧修正

1. **量图**：用图片工具查看 spritesheet 宽高；若为规则网格，则  
   `frameWidth = 图宽 / columns`，`frameHeight = 图高 / rows`。
2. **标定网格**：写入 `frameWidth`、`frameHeight`，以及可选的 `columns`、`rows`。
3. **逐动作填写 `animations`**：为 `idle` / `walk` / `happy` / `eat` / `sleep` 等指定 `row` 或 `start`、`frames`、`fps`、
   `loop`。
4. **更新 `behaviorMap`**：把各行为指向真实动画名，例如：  
   `"walk": ["walk"]`，`"happy": ["happy", "idle"]`。
5. **校验**：在 `packages/schema` 下对 `pets` 根目录执行 `loadAllPets`，确保无 error。
6. **勿删资源**：`persona.md`、原图、音频等与配置解耦，修正动画时不要删除它们。

## 最小扩展模板（复制用）

```json
{
  "id": "<pet-id>",
  "displayName": "<Display Name>",
  "name": "<Display Name>",
  "version": "1.0.0",
  "greeting": "...",
  "description": "...",
  "renderer": "spritesheet",
  "size": {
    "width": 200,
    "height": 200
  },
  "spritesheetPath": "spritesheet.webp",
  "spritesheet": {
    "path": "spritesheet.webp",
    "frameWidth": 128,
    "frameHeight": 128,
    "animations": {
      "idle": {
        "row": 0,
        "frames": 1,
        "loop": true,
        "fps": 8
      }
    }
  },
  "behaviorMap": {
    "idle": ["idle"],
    "walk": ["idle"],
    "happy": ["idle"],
    "eat": ["idle"],
    "sleep": ["idle"],
    "play": ["idle"],
    "hungry": ["idle"]
  },
  "ai": {
    "personaFile": "persona.md"
  }
}
```

> 上表中 `walk`/`happy`/`eat`/`sleep`/`play`/`hungry` → `idle` **全部为占位映射**；仅在真正标定多行/多帧 spritesheet 后，才把对应项改成真实动画名。当前 desktop_pet **没有**为这些宠补全多帧美术资源。

## 注意事项

- JSON **不能写注释**；说明统一放在本文件。
- 保持 `spritesheetPath` 与 `spritesheet.path` 一致，便于旧代码与新 normalize 双轨兼容。
- 校验只要求 spritesheet 型具备非空相对路径 `spritesheet.path`；动画元数据错误不会被 schema 硬拦，需渲染侧与人工核对。
- 未 PUSH 前的改动视为同一版本；无 TAG 前勿随意改 `version` 语义（当前统一占位 `1.0.0`）。
- 现网 11 只 spritesheet 宠的 `behaviorMap` 仍是「全映射 idle」的最小占位；若日后扩展 `play`/`hungry` 映射，优先保证 `animations` 里已有对应 key，再改 map。
