# desktop_pet

Windows 桌面宠物 monorepo：透明置顶小窗、拖拽、行为状态机（FSM）、精灵表 / 视频双渲染、本地养成、AI 对话、系统托盘与自动更新。

当前版本 **0.1.0**（未打正式 TAG；变更见 [CHANGELOG.md](./CHANGELOG.md)）。

## 项目简介

| 能力      | 说明                                                             |
|---------|----------------------------------------------------------------|
| 透明置顶窗   | Electron 无边框透明窗，左键拖拽                                           |
| 行为 FSM  | `@pet/runtime`：idle / walk / eat / play / sleep 等；用户交互 + 自主调度  |
| 双渲染     | `video`（guga webm）与 `spritesheet`（其余角色；历史 `atlas` 由 schema 映射） |
| 本地养成    | 饱食 / 心情衰减；喂食、摸摸、玩耍回升                                           |
| AI 对话   | 双击打开面板；云端 OpenAI 兼容或本地关键词；设置页可配 Key（加密存储）                      |
| 托盘 / 右键 | 行为、切宠、AI 设置、静音、点击穿透、更新、退出                                      |
| 自动更新    | `electron-updater`（GitHub Releases；当前以 NSIS 为主）                |
| 宠物资源    | `pets/` 共 **12** 只（`manifest.json`）                            |

**技术栈：** Electron ^33 · Vite 5 · React 18 · TypeScript · npm workspaces · Biome · `node:test`

## Monorepo 结构

```
desktop_pet/
├── apps/desktop/           # @pet/desktop — Electron 主进程 + React 渲染
│   ├── electron/           # main / ipc / pet-loader / ai-chat / tray / window …
│   ├── shared/             # IPC 通道、菜单模型、payload 类型（CJS，供主进程 + 渲染）
│   └── src/                # React UI / hooks / FSM 接入
├── packages/
│   ├── schema/             # @pet/schema — pet.json 规范化 / 校验 / 加载
│   └── runtime/            # @pet/runtime — BehaviorFSM + AutoScheduler
├── pets/                   # 运行时资源（打包进 extraResources）
├── .github/workflows/      # ci.yml（门禁）+ build.yml（Windows 发版）
├── biome.json
├── package.json            # workspaces 根
├── CHANGELOG.md
└── README.md
```

| 路径                                      | 说明                                                 |
|-----------------------------------------|----------------------------------------------------|
| [apps/desktop](./apps/desktop/)         | 产品入口；架构细节见其 README                                 |
| [packages/schema](./packages/schema/)   | `PetConfig`、`loadPet`、atlas→spritesheet            |
| [packages/runtime](./packages/runtime/) | 纯 TS 行为状态机与自主调度                                    |
| [pets](./pets/)                         | 配置 + 素材；完成度见 [COMPLETION.md](./pets/COMPLETION.md) |

## 环境要求

- **Node.js >= 18**（CI 使用 20）
- **Windows 为主**（`electron-builder --win`）；其他平台可跑开发态
- 首次 `npm install` 会下载 Electron 二进制

## 快速启动

在**仓库根目录**：

```bash
npm install
npm run desktop:dev
```

Electron 下载慢时（PowerShell）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

指定启动宠物（优先于偏好文件）：

```powershell
$env:PET_ID="doro"; npm run desktop:dev
```

## 常用脚本

### 根目录

| 脚本                       | 说明                                 |
|--------------------------|------------------------------------|
| `npm run desktop:dev`    | 开发：Vite HMR + Electron             |
| `npm run desktop`        | 构建渲染层后启动                           |
| `npm run desktop:pack`   | 解包目录（`electron-builder --dir`）     |
| `npm run desktop:dist`   | Windows NSIS + portable            |
| `npm run typecheck`      | schema + runtime + desktop         |
| `npm test`               | 全部单测（schema / runtime / desktop）   |
| `npm run smoke`          | runtime smoke + pet-asset 路径 smoke |
| `npm run test:pet-asset` | 仅 pet-asset 路径安全                   |
| `npm run lint`           | Biome lint（`apps` + `packages`）    |
| `npm run format`         | Biome format 写回                    |
| `npm run format:check`   | 仅检查格式                              |
| `npm run audit:pets`     | 宠物资质/尺寸审计；guga 需 ffprobe 校验 VP9+alpha |
| `npm run reencode:guga-alpha` | 将 guga WebM 重导为 VP9+alpha（需 ffmpeg） |

### 子包（在根目录用 `-w` 亦可）

| 包              | 常用                                                                |
|----------------|-------------------------------------------------------------------|
| `@pet/desktop` | `dev` / `build:renderer` / `pack` / `dist` / `test` / `typecheck` |
| `@pet/schema`  | `build` / `test` / `typecheck`                                    |
| `@pet/runtime` | `build` / `test` / `typecheck` / `smoke`                          |

## 质量门禁

本地建议在提交 / 打包前：

```bash
npm run lint
npm run typecheck
npm run smoke
npm test
```

CI（Windows）：

| Workflow                                   | 触发               | 内容                              |
|--------------------------------------------|------------------|---------------------------------|
| [ci.yml](./.github/workflows/ci.yml)       | PR / push 到 main | lint → typecheck → smoke → test |
| [build.yml](./.github/workflows/build.yml) | tag `v*` / 手动    | Lint job + Windows 打包发布         |

## 宠物资源

```
pets/
├── manifest.json
├── COMPLETION.md              # 动画完成度
├── SPRITESHEET_TEMPLATE.md    # 精灵表配置手册
├── guga/                      # video：webm + audio + persona
└── <petId>/                   # spritesheet / 历史 atlas
    ├── pet.json
    ├── persona.md
    └── spritesheet.webp|png
```

- 清单：`manifest.json` → guga、doro、elaina、homie、linnea、mambo、naruto、nezuko、phoebe、skirk、taffy、wukong
- 配置：`@pet/schema` 规范化；`renderer: "atlas"` 会映射为 spritesheet 多帧
- 人设：各宠 `persona.md`（统一中文结构：身份 / 性格 / 说话风格 / 禁忌）
- **guga WebM 透明**：需 VP9 + `alpha_mode=1`。黑底/方块先分清「资源无 alpha」与「解码丢 alpha」（见 [apps/desktop/README.md](./apps/desktop/README.md) B-805）。重导：`npm run reencode:guga-alpha`；门禁：`npm run audit:pets`（需 ffprobe）
- **新增角色**：建目录 → 写 `pet.json` + 素材 + `persona.md` → 更新 manifest →
  见 [SPRITESHEET_TEMPLATE.md](./pets/SPRITESHEET_TEMPLATE.md)

## 开发 / 构建 / 打包

```bash
# 开发
npm run desktop:dev

# 门禁
npm run lint && npm run typecheck && npm run smoke && npm test

# 生产构建后本地跑
npm run desktop

# 验证打包目录 → apps/desktop/release/win-unpacked/
npm run desktop:pack

# 安装包 + portable → apps/desktop/release/*.exe
npm run desktop:dist
```

打包会先 `prepack:packages`（构建 schema / runtime `dist`），并将 `pets/` 打入 `extraResources`（排除 `**/large/mov/**`、
`*.mov`）。

镜像加速（可选）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run desktop:pack
```

路径、签名、图标与发版 checklist 见 [apps/desktop/README.md](./apps/desktop/README.md)。

### 渲染构建说明

- `shared/*.js` 为 **CJS**（主进程 `require` 与渲染层共用）；Vite 已配置 `build.commonjsOptions.include` 覆盖 `shared/`
  ，避免命名导出打包失败。
- 日志中 `Vite CJS Node API is deprecated` 为警告，不阻断构建。

## 环境变量（可选）

完整列表见 [apps/desktop/README.md](./apps/desktop/README.md)。常用：

| 变量                                  | 说明                                         |
|-------------------------------------|--------------------------------------------|
| `PET_ID`                            | 启动指定宠物（优先于 `desktop-prefs.json`）           |
| `PET_AI_API_KEY` / `OPENAI_API_KEY` | AI 密钥（**勿提交仓库**）                           |
| `PET_AI_BASE_URL`                   | OpenAI 兼容基址，默认 `https://api.openai.com/v1` |
| `PET_AI_MODEL`                      | 模型名，默认 `gpt-4o-mini`                       |
| `PET_LOG_LEVEL`                     | 主进程日志：`debug` / `info` / `warn` / `error`  |
| `ELECTRON_DEV=1`                    | 开发态加载 Vite dev server                      |
| `ELECTRON_OPEN_DEVTOOLS=1`          | 开发态打开 DevTools                             |
| `VITE_DEV_SERVER_URL`               | 覆盖默认 `http://localhost:5173`               |

```powershell
$env:PET_AI_API_KEY="sk-..."
$env:PET_ID="guga"
npm run desktop:dev
```

**AI 凭证优先级：** 环境变量 **>** 应用内「AI 设置」（`safeStorage` 加密写入 `userData`）**>** 无 Key 则本地规则。入口：聊天面板
⚙ 或右键「AI 设置…」。

## 交互速览

| 操作      | 说明                      |
|---------|-------------------------|
| 左键拖拽    | 移动窗口                    |
| 双击      | AI 对话（标题可显示本地 / 云端）     |
| 右键 / 托盘 | 行为、切宠、AI 设置、静音、穿透、更新、退出 |
| Esc     | 关聊天 → 关菜单 → 退出          |
| 数字键 1–7 | 调试行为（聊天打开时禁用）           |

点击穿透开启后窗口点不到，请用托盘关闭。

## 架构要点（优化后）

| 层       | 职责                                         |
|---------|--------------------------------------------|
| 主进程     | 生命周期编排（`main.js`）；资源加载、AI、托盘、窗口、IPC、更新已拆模块 |
| 渲染层     | FSM / 养成 / 音效 / UI；菜单与聊天等拆为 hooks          |
| schema  | 配置唯一真相；atlas 映射、校验                         |
| runtime | 与 UI 解耦的行为 FSM                             |
| shared  | 通道名、菜单文案、类型、localStorage 迁移纯函数             |

加载策略摘要：schema 失败但可构建 → **降级**提示；缺 idle / 资源 → **拒载**；guga 硬失败 → **默认资源回退**；切宠命中进程内
payload **缓存**。细节见 desktop README。

## 文档索引

| 文档                                                             | 内容                            |
|----------------------------------------------------------------|-------------------------------|
| [apps/desktop/README.md](./apps/desktop/README.md)             | 架构、交互、用户数据、AI、打包与发版 checklist |
| [packages/schema/README.md](./packages/schema/README.md)       | pet.json 模型与 load API         |
| [packages/runtime/README.md](./packages/runtime/README.md)     | BehaviorFSM / AutoScheduler   |
| [pets/SPRITESHEET_TEMPLATE.md](./pets/SPRITESHEET_TEMPLATE.md) | 精灵表配置手册                       |
| [pets/COMPLETION.md](./pets/COMPLETION.md)                     | 角色动画完成度                       |
| [CHANGELOG.md](./CHANGELOG.md)                                 | 版本变更（含 Unreleased 工程债清理记录）    |

## 版本与贡献

- 应用与子包版本：**0.1.0**；未发 TAG 前不改版本号，未 push 前改动视为同一版本
- 提交信息使用**中文**；勿提交 `.env`、密钥与 `userData` 中的 `ai-settings.json`
- 许可证：内部 / 个人项目（Moon）
