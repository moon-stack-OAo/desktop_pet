# desktop_pet

Windows 桌面宠物 monorepo：透明置顶小窗、拖拽、行为状态机（FSM）、精灵表 / 视频双渲染、本地养成、AI 对话、系统托盘与自动更新。

当前版本 **0.1.0**（尚未正式发版，变更见 [CHANGELOG.md](./CHANGELOG.md)）。

## 项目简介

- **透明置顶窗**：Electron 无边框透明窗口，左键拖拽移动
- **行为 FSM**：`@pet/runtime` 驱动 idle / walk / eat / play / sleep 等，支持用户交互与自主调度
- **双渲染**：`renderer: video`（如 guga 的 webm）与 `renderer: spritesheet`（其余角色）
- **本地养成**：饱食 / 心情随时间衰减，喂食、摸摸头、玩耍可回升
- **AI 对话**：双击打开面板；有 API Key 时走 OpenAI 兼容接口，否则本地关键词降级
- **托盘 / 右键菜单**：行为、切换宠物、静音、点击穿透、检查更新、退出
- **自动更新**：`electron-updater`（GitHub Releases）
- **宠物资源**：`pets/` 下 12 只角色（`manifest.json` 注册）

技术栈：Electron ^33、Vite 5、React 18、TypeScript；npm workspaces。

## Monorepo 结构

```
desktop_pet/
├── apps/
│   └── desktop/          # Electron 应用（@pet/desktop）
├── packages/
│   ├── schema/           # @pet/schema — pet.json 类型 / 校验 / 加载
│   └── runtime/          # @pet/runtime — 行为 FSM + AutoScheduler
├── pets/                 # 宠物资源（manifest + 各宠 pet.json / 素材）
├── scripts/              # 仓库级工具脚本（精灵表分析、changelog 等）
├── package.json          # workspaces 根
├── CHANGELOG.md
├── TODO.md
└── README.md
```

| 路径                                      | 说明                           |
|-----------------------------------------|------------------------------|
| [apps/desktop](./apps/desktop/)         | 主进程 + 渲染层，产品入口               |
| [packages/schema](./packages/schema/)   | `PetConfig` 规范化、校验、`loadPet` |
| [packages/runtime](./packages/runtime/) | 纯 TS 行为状态机与自主调度              |
| [pets](./pets/)                         | 运行时资源；打包进 `resources/pets`   |
| [scripts](./scripts/)                   | 开发辅助脚本（非 npm workspace 包）    |

## 环境要求

- **Node.js >= 18**
- **Windows 为主**（开发与 `electron-builder --win` 分发目标）；macOS / Linux 可跑开发态
- 首次 `npm install` 会下载 Electron 二进制（网络慢时可配镜像）

## 快速启动

在**仓库根目录**：

```bash
npm install
npm run desktop:dev
```

Electron 下载慢时（PowerShell 示例）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

指定启动宠物（优先于偏好文件）：

```powershell
$env:PET_ID="doro"; npm run desktop:dev
```

## 常用脚本

### 根目录（`package.json`）

| 脚本                          | 说明                                                |
|-----------------------------|---------------------------------------------------|
| `npm run desktop:dev`       | 开发：Vite HMR + Electron（转发 `@pet/desktop` 的 `dev`） |
| `npm run desktop`           | 构建渲染层后启动 Electron                                 |
| `npm run desktop:pack`      | 解包目录打包（`electron-builder --dir`）                  |
| `npm run desktop:dist`      | Windows 安装包 + portable（`electron-builder --win`）  |
| `npm run typecheck`         | schema + runtime + desktop 类型检查                   |
| `npm run typecheck:schema`  | 仅 `@pet/schema`                                   |
| `npm run typecheck:runtime` | 仅 `@pet/runtime`                                  |
| `npm run typecheck:desktop` | 仅 `@pet/desktop`                                  |
| `npm run test:pet-asset`    | pet-asset 路径安全 smoke                              |

### `@pet/desktop`（`apps/desktop`）

| 脚本                       | 说明                                               |
|--------------------------|--------------------------------------------------|
| `npm run dev`            | 并行 `dev:renderer` + `dev:electron`               |
| `npm run dev:renderer`   | 仅 Vite（默认端口 5173）                                |
| `npm run dev:electron`   | `ELECTRON_DEV=1 electron .`                      |
| `npm run build:renderer` | `tsc --noEmit` + `vite build` → `dist-renderer/` |
| `npm start`              | `electron .`（需已有 `dist-renderer`）                |
| `npm run desktop`        | `build:renderer` 再 `electron .`                  |
| `npm run pack`           | 先 build schema/runtime + renderer，再 `--dir`      |
| `npm run dist`           | 同上，再 `--win`（nsis + portable）                    |
| `npm run typecheck`      | 渲染层 / vite 配置 / 主进程 JS 三段检查                      |
| `npm run test:pet-asset` | `node scripts/smoke-pet-asset-path.js`           |

### 子包

| 包              | 常用脚本                                                    |
|----------------|---------------------------------------------------------|
| `@pet/schema`  | `npm run build` / `npm run typecheck`                   |
| `@pet/runtime` | `npm run build` / `npm run typecheck` / `npm run smoke` |

## 子包与文档

| 文档                                                             | 内容                            |
|----------------------------------------------------------------|-------------------------------|
| [apps/desktop/README.md](./apps/desktop/README.md)             | 应用架构、交互、环境变量、打包细节             |
| [packages/schema/README.md](./packages/schema/README.md)       | pet.json 模型与 `loadPet` API    |
| [packages/runtime/README.md](./packages/runtime/README.md)     | `BehaviorFSM` / AutoScheduler |
| [pets/SPRITESHEET_TEMPLATE.md](./pets/SPRITESHEET_TEMPLATE.md) | 精灵表配置手册（atlas 映射、切帧、新增角色模板） |
| [CHANGELOG.md](./CHANGELOG.md)                                 | 版本变更记录                        |

## 宠物资源目录

```
pets/
├── manifest.json          # 注册列表（当前 12 只）
├── SPRITESHEET_TEMPLATE.md   # 精灵表配置手册
├── guga/                  # video 型示例
│   ├── pet.json
│   ├── persona.md
│   ├── audio.json / audio/
│   └── large/webm/        # 运行时 webm（打包排除 .mov）
└── <petId>/               # spritesheet 型
    ├── pet.json
    ├── persona.md
    └── spritesheet.webp   # 或 .png
```

- 清单：`pets/manifest.json` 的 `pets` 数组（guga、doro、elaina、homie、linnea、mambo、naruto、nezuko、phoebe、skirk、taffy、wukong）
- 单宠配置：`pets/<id>/pet.json`（由 `@pet/schema` 规范化为 `PetConfig`）
- 人设：`ai.personaFile`（通常 `persona.md`）供 AI 对话使用
- 新增角色：写入目录 + 更新 `manifest.json`；精灵表字段见 [SPRITESHEET_TEMPLATE.md](./pets/SPRITESHEET_TEMPLATE.md)

## 开发 / 构建 / 打包

```bash
# 开发（推荐）
npm run desktop:dev

# 类型检查（CI 门禁同类）
npm run typecheck
npm run test:pet-asset

# 生产构建后本地跑
npm run desktop

# 快速验证打包目录
npm run desktop:pack
# 产物：apps/desktop/release/win-unpacked/

# Windows 安装包 + portable
npm run desktop:dist
# 产物：apps/desktop/release/*.exe
```

打包会自动 `prepack:packages`（构建 `@pet/schema` / `@pet/runtime` 的 `dist`），并将 `pets/` 作为 `extraResources` 打入（排除
`**/large/mov/**` 与 `*.mov`）。

镜像加速（可选）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run desktop:pack
```

更多路径差异、签名与图标说明见 [apps/desktop/README.md](./apps/desktop/README.md)。

## 环境变量（可选）

完整列表与说明以 [apps/desktop/README.md](./apps/desktop/README.md) 为准。常用：

| 变量                                  | 说明                                         |
|-------------------------------------|--------------------------------------------|
| `PET_ID`                            | 启动指定宠物（优先于 `desktop-prefs.json`）           |
| `PET_AI_API_KEY` / `OPENAI_API_KEY` | AI 密钥（**勿提交**）                             |
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

未设置 API Key 时仍可双击对话（本地规则降级）。也可在应用内 **AI 设置**（聊天面板 ⚙ / 右键菜单）配置 Key（本地加密存储；**环境变量优先**）。

## 交互速览

| 操作      | 说明                    |
|---------|-----------------------|
| 左键拖拽    | 移动窗口                  |
| 双击      | AI 对话面板               |
| 右键 / 托盘 | 行为、切换宠物、AI 设置、静音、点击穿透、更新、退出 |
| Esc     | 关聊天 → 关菜单 → 退出        |
| 数字键 1–7 | 调试行为（聊天打开时禁用）         |

点击穿透开启后窗口点不到，请用托盘关闭。

## 版本说明

- 应用与子包版本：**0.1.0**
- 未打正式 TAG / 未正式发版前，变更按同一版本记录，详见 [CHANGELOG.md](./CHANGELOG.md)
- 工程债与后续计划：[TODO.md](./TODO.md)

## 许可证与贡献

内部 / 个人项目（Moon）。贡献前请阅读 [TODO.md](./TODO.md) 中的 Epic 优先级；提交信息使用中文。
