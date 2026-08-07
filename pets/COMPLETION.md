# 角色动画完成度表（B-803 / B-804）

> 更新：B-804 P0 已落地 — `normalizePet` 将历史 `atlas` 映射为 `spritesheet`，11 只 atlas 宠可正常加载并播多帧。  
> 说明：纸面帧数来自 `atlas.states`；**视觉是否与切图一致**仍需人工抽检（P1）。

## 图例

| 标记 | 含义 |
|------|------|
| ✅ 真 | 多帧 / 独立 clip，配置可驱动 |
| 🎬 video | WebM clip 列表 |
| 👁 待目视 | 配置多帧已接入，建议对照 spritesheet 目视 walk/happy |

## 总表

| 宠物 | 渲染 | 资源 | idle | walk | happy | eat | sleep | play | hungry | 备注 |
|------|------|------|------|------|-------|-----|-------|------|--------|------|
| **guga** | video | `large/webm/*.webm` | ✅ | ✅ | ✅ headpat 等 | ✅ | ✅ rest | ✅ dance/spin | ✅ | 完成度最高 |
| **doro** | spritesheet（原 atlas） | spritesheet.webp | ✅ 6f | ✅ 8f | ✅ 4f | ✅ | ✅ | ✅ | ✅ | B-804 已映射 |
| **elaina** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **homie** | 同上 | spritesheet.png | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | png |
| **linnea** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **mambo** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **naruto** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **nezuko** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **phoebe** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **skirk** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **taffy** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |
| **wukong** | 同上 | spritesheet.webp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上 |

## atlas → spritesheet 映射（运行时）

| atlas 字段 | spritesheet 字段 |
|------------|------------------|
| `image` | `path` |
| `cellW` / `cellH` | `frameWidth` / `frameHeight` |
| `cols` / `rows` | `columns` / `rows` |
| `states.*` | `animations.*`（保留 `row` / `frames` / `fps` / `loop`） |
| （无顶层 behaviorMap） | 由核心动画名推导 `walk→[walk]` 等 |

网格约定（11 宠一致）：**8×9**，单格 **192×208**。

| 状态 | row | frames | loop |
|------|-----|--------|------|
| idle | 0 | 6 | true |
| walk | 1 | 8 | true |
| happy / eat | 3 | 4 | false |
| play | 4 | 5 | true |
| sick | 5 | 8 | true |
| sleep / hungry | 6 | 6 | true |

## guga（video）clip 完成度

见 `pets/guga/pet.json` 与历史 CHANGELOG；idle / walk / eat / hungry / rest / dance 等均有独立 webm。

## B-804 状态

| 优先级 | 内容 | 状态 |
|--------|------|------|
| **P0** | schema `atlas` → `spritesheet` + 默认 behaviorMap | ✅ 完成 |
| **P1** | 目视抽检 doro 等 1–2 只 walk/happy 与行号一致 | 👁 建议本地 `desktop:dev` 切宠验收 |
| **P2** | 其余宠逐只目视；修正个别错行配置 | 可选后续 |

## 未完成 / 美术债

| 项 | 说明 | 状态 |
|----|------|------|
| **row6 三态共用** | 11 只 atlas 宠：`sleep` / `hungry` / `waiting` 同 row6，仅 fps 区分（3 / 5 / 4）；**无第 10 行**，不可假拆 | ⏳ 待美术新增行或重排网格后再改配置 |
| 像素文案对齐 | linnea / homie / mambo 等 description、colors、persona 外观与 spritesheet 像素一致 | 🔄 持续按像素审计修正 |

## 相关文档

- `pets/SPRITESHEET_TEMPLATE.md` — 精灵表配置手册（映射、切帧、新增模板）
- `packages/schema/README.md` — normalize 映射表
