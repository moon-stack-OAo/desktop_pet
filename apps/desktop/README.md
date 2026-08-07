# @pet/desktop

Electron + Vite + React **desktop_pet**：透明置顶窗、行为状态机、视频/精灵表双渲染、右键与托盘菜单、切换宠物。

## 项目简介

- **主进程**：`electron/` — 透明置顶窗、托盘、`pet-asset` 协议、prefs/logger、`@pet/schema` 加载宠物、切宠 IPC
- **渲染层**：`src/` — React + TypeScript + `@pet/runtime` FSM / AutoScheduler
- **资源**：仓库根 `pets/`（`manifest.json` + 12 只宠物）

## 目录结构

```
apps/desktop/
├── package.json
├── tsconfig.json / tsconfig.node.json / tsconfig.electron.json
├── vite.config.ts
├── index.html                 # Vite 入口 HTML
├── electron/
│   ├── main.js                # 主进程：窗口 / loadPet / 托盘 / IPC / pet-asset 协议
│   ├── preload.js             # contextBridge → window.petAPI
│   ├── updater.js             # electron-updater 自动更新
│   ├── prefs.js               # 统一 userData/desktop-prefs.json（pet + update）
│   ├── logger.js              # 主进程日志分级（PET_LOG_LEVEL）
│   └── pet-asset-path.js      # pet-asset:// 路径解析与越界校验（可 node smoke）
├── scripts/
│   └── smoke-pet-asset-path.js  # pet-asset 路径安全 smoke（npm run test:pet-asset）
├── src/                       # React 源码
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles.css
│   ├── pet/                   # PetContext（FSM + AutoScheduler）
│   ├── components/            # PetStage / PetVideo / PetSpritesheet / StatusOverlay …
│   ├── hooks/                 # usePet / useContextQuit / useAudio / useVitals
│   ├── utils/log.ts           # 渲染层日志分级
│   ├── types/pet-api.d.ts
│   └── vite-env.d.ts
├── dist-renderer/             # Vite 生产构建产物（gitignore 建议忽略）
│   ├── index.html
│   └── assets/
└── README.md
```

> 支持 `renderer: video`（guga）与 `renderer: spritesheet`（其余角色，占位动画/静态浮动）。

## 环境要求

- Node.js >= 18
- Windows / macOS / Linux
- 首次安装会下载 Electron 二进制（网络慢时可配镜像）

## 安装

在**仓库根目录**（workspaces）：

```bash
# 在 monorepo 根目录 desktop_pet 下执行
npm install
```

Electron 下载慢时（PowerShell 淘宝镜像示例）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 启动

### 开发（推荐）

根目录一键：Vite HMR + Electron（`ELECTRON_DEV=1`，加载 `http://localhost:5173`）：

```bash
npm run desktop:dev
```

等价于在 `apps/desktop` 内：

```bash
npm run dev
# = concurrently：dev:renderer + wait-on 5173 后 dev:electron
```

### 生产（构建后启动）

根目录：

```bash
npm run desktop
```

等价于：

```bash
npm run build:renderer -w @pet/desktop
# 或：cd apps/desktop && npm run build:renderer
# 再：electron .  （加载 dist-renderer/index.html）
```

也可在包内：

```bash
cd apps/desktop
npm run desktop    # build:renderer && electron .
npm start          # 仅 electron .（需已有 dist-renderer）
```

## 脚本说明

| 位置 | 脚本                       | 说明                                                                      |
|----|--------------------------|-------------------------------------------------------------------------|
| 根  | `npm run desktop:dev`    | 开发：Vite + Electron                                                      |
| 根  | `npm run desktop`        | 构建渲染层后启动 Electron                                                       |
| 根  | `npm run typecheck`      | schema + runtime + desktop（含主进程 JS）类型检查                                 |
| 根  | `npm run test:pet-asset` | pet-asset 路径 smoke（转发到包内脚本）                                             |
| 包  | `npm run typecheck`      | 三配置串联：`tsconfig.json` + `tsconfig.node.json` + `tsconfig.electron.json` |
| 包  | `npm run test:pet-asset` | `node scripts/smoke-pet-asset-path.js`                                  |
| 包  | `npm run dev:renderer`   | 仅 Vite（端口 5173）                                                         |
| 包  | `npm run build:renderer` | `tsc --noEmit` + `vite build` → `dist-renderer/`                        |
| 包  | `npm run dev:electron`   | `ELECTRON_DEV=1 electron .`                                             |
| 包  | `npm run dev`            | 并行 renderer + electron（开发）                                              |
| 包  | `npm start`              | `electron .`（生产加载 dist）                                                 |
| 包  | `npm run desktop`        | `build:renderer` 再 `electron .`                                         |
| 包  | `npm run pack`           | 构建依赖 + renderer 后 `electron-builder --dir`                              |
| 包  | `npm run dist`           | 构建依赖 + renderer 后 `electron-builder --win`                              |
| 根  | `npm run desktop:pack`   | 解包目录打包（快速验证）                                                            |
| 根  | `npm run desktop:dist`   | Windows NSIS 安装包 + zip 解压版                                              |

### 类型检查（三配置）

`@pet/desktop` 的 `typecheck` 分三段串联（与包内 `package.json` scripts 一致）：

| 配置                       | 覆盖                                                     |
|--------------------------|--------------------------------------------------------|
| `tsconfig.json`          | 渲染层 `src/**/*.ts(x)`                                   |
| `tsconfig.node.json`     | `vite.config.ts`                                       |
| `tsconfig.electron.json` | 主进程 CommonJS `electron/**/*.js`（`allowJs` + `checkJs`） |

主进程保持 JS，用 JSDoc + `// @ts-check` 风格约束；未整包迁移为 TypeScript。Electron 类型来自 `electron` 包自带的
`electron.d.ts`，Node 用 `@types/node`。

根目录 `npm run typecheck` = schema + runtime + 上述 desktop 三段。

## 交互

| 操作      | 说明                                                                    |
|---------|-----------------------------------------------------------------------|
| 左键拖拽    | 移动窗口                                                                  |
| **双击**  | 打开 AI 对话面板（输入框 + 最近历史）                                                |
| 右键      | 菜单：喂食 / 摸摸头 / 玩耍 / 休息 / 走动 / **静音** / **点击穿透** / **切换宠物** / 检查更新 / 退出 |
| Esc     | 先关聊天 → 再关菜单 → 无菜单再退出                                                  |
| 托盘      | 行为、切换宠物、**点击穿透**、显示/隐藏、检查更新、退出                                        |
| 数字键 1–7 | 调试行为（idle/walk/happy/eat/play/sleep/hungry；聊天打开时禁用）                   |

### 点击穿透

- 右键或托盘开关；`petAPI.setIgnoreMouse` / `getIgnoreMouse` / `onIgnoreMouseChanged`
- 状态写入 `desktop-prefs.json` 的 `pet.ignoreMouse`；启动时先恢复再建窗
- **开启后窗体点不到**，只能用托盘关闭穿透

### 用户数据与迁移

更完整说明见 [用户数据](#用户数据-prefs--localstorage)（prefs 路径、localStorage key、schema 版本与迁移）。

### 日志

| 层   | 模块                   | 默认                           | 覆盖                                                  |
|-----|----------------------|------------------------------|-----------------------------------------------------|
| 主进程 | `electron/logger.js` | 开发 info/debug，打包仅 warn/error | 环境变量 `PET_LOG_LEVEL`                                |
| 渲染层 | `src/utils/log.ts`   | 同上                           | `localStorage.PET_LOG_LEVEL` 或 `VITE_PET_LOG_LEVEL` |

**音效**：`pet.json` 的 `audio.mapFile`（如 guga `audio.json`）将 clip/behavior 映射到 `audio/*.mp3`；FSM 切换 clip
时播放。右键「静音」写入 `localStorage.pet-muted`（schema 见下节）。

**本地养成**：每宠独立 `localStorage`（`pet-vitals:{petId}`）存饱食/心情；约每 30s 饥饿 -2、每 60s 心情 -1；喂食/摸摸头/玩耍会回升；饥饿
≤20 时自动 `hungry` 并提示「好饿…」。

**AI 对话**：主进程读取 `ai.personaFile`（如 `persona.md`）进 payload；`petAPI.chat(message)` 走 IPC `ai:chat`。无 API Key
时本地关键词降级（饿/摸/玩/再见等）；有 Key 时调 OpenAI 兼容 Chat Completions，并解析 `{"reply","action"}` 触发行为。

### 宠物加载策略（校验失败 / 缓存）

实现：`electron/pet-loader.js`。

| 场景 | 策略 | 用户提示（`payload.loadMeta` / status） |
|------|------|----------------------------------------|
| schema 校验有 error，但仍能构建可播放资源（如有 idle） | **降级**加载，`loadMeta.mode=degraded` | 「{id}」配置有问题，已降级加载 |
| 缺 idle / 精灵表 path / 渲染器不可用 | **拒载**（切宠 `ok:false`；启动非 guga 则回退 guga） | 无法加载「{id}」：… |
| guga 硬失败 | **回退**硬编码 `idle.webm`，`mode=fallback` | 「guga」加载失败，已使用默认资源 |
| 已成功加载过的宠再次切换 | **进程内缓存**命中 | 无 |

**缓存失效**：`clearPetPayloadCache()` / `invalidatePetPayloadCache(id)`；进程重启清空。改磁盘资源后需重启或主动 invalidate（当前 UI 无入口）。
`loadPetPayload(id, { force: true })` 可强制重载。

## 切换宠物

- 右键 →「切换宠物 →」选择角色（来自 `pets/manifest.json`）
- 托盘 →「切换宠物」子菜单
- 当前选择写入 Electron `userData/desktop-prefs.json`（`pet.currentPetId`），下次启动恢复；首次会从旧 `pet-prefs.json` /
  `update-prefs.json` 自动迁移
- 环境变量 **`PET_ID`** 优先于 prefs，例如：

```powershell
$env:PET_ID="doro"; npm run desktop
# 或
npx cross-env PET_ID=doro npm run desktop -w @pet/desktop
```

| 托盘菜单 | 显示/隐藏、退出；双击托盘显示窗口 |
| 点击舞台 | autoplay 被拦时重试播放 |

## 环境变量

| 变量                         | 说明                                           |
|----------------------------|----------------------------------------------|
| `ELECTRON_DEV=1`           | 开发态：`loadURL` 连 Vite，而非 `dist-renderer`      |
| `NODE_ENV=development`     | 同开发态判定（与 `ELECTRON_DEV` 二选一即可）               |
| `VITE_DEV_SERVER_URL`      | 覆盖默认 `http://localhost:5173`                 |
| `ELECTRON_OPEN_DEVTOOLS=1` | 开发态打开分离式 DevTools（默认关闭，避免挡透明窗）               |
| `PET_AI_API_KEY`           | AI 对话密钥（优先；**勿写入代码或提交**）                     |
| `OPENAI_API_KEY`           | 同上，兼容 OpenAI 官方命名                            |
| `PET_AI_BASE_URL`          | OpenAI 兼容接口基址，默认 `https://api.openai.com/v1` |
| `PET_AI_MODEL`             | 模型名，默认 `gpt-4o-mini`                         |
| `PET_LOG_LEVEL`            | 主进程日志级别：`debug` / `info` / `warn` / `error`  |
| `PET_ID`                   | 启动指定宠物（优先于 `desktop-prefs.json`）             |

示例（包内）：

```bash
# 自定义 dev server 地址
cross-env ELECTRON_DEV=1 VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .

# 打开 DevTools
cross-env ELECTRON_DEV=1 ELECTRON_OPEN_DEVTOOLS=1 electron .
```

### 配置 AI（可选）

PowerShell：

```powershell
$env:PET_AI_API_KEY="sk-..."
# 可选：第三方兼容端点
# $env:PET_AI_BASE_URL="https://api.example.com/v1"
# $env:PET_AI_MODEL="gpt-4o-mini"
npm run desktop:dev
```

未设置 Key 时仍可双击对话：本地规则话术 + 可选行为（如「摸摸」→ happy）。网络/超时失败会自动降级本地。

### AI 模式可感知（B-801）

| 场景 | `mode` / `source` | UI |
|------|-------------------|-----|
| 无 Key | `local`（`errorKind: no-key`） | 对话标题徽标「本地」 |
| 云端成功 | `cloud` | 徽标「云端」 |
| 云端超时/网络/HTTP 失败 | `local` + `errorKind` | 回复末尾附中文提示（如「云端超时，已用本地回复」） |

### AI Key 配置（B-802，已实现）

入口：

- 聊天面板标题旁 **⚙**
- 右键菜单 **「AI 设置…」**

可配置：API Key（password）、Base URL、Model；支持保存 / 清除本地 Key。

**优先级（高 → 低）**：

1. **环境变量**（覆盖本地）：`PET_AI_API_KEY` 或 `OPENAI_API_KEY`；`PET_AI_BASE_URL`；`PET_AI_MODEL`
2. **本地安全存储** `userData/ai-settings.json`：有 `safeStorage` 时 Key 加密（base64 密文）；不可用时明文回退并 warn 一次
3. 均无 Key → 本地规则对话（`errorKind: no-key`）

安全：

- Key **永不**进仓库、不写日志明文；UI 仅展示 `hasKey` / 掩码 `keyHint`
- `.env` 含真实 Key 勿提交（仓库已 ignore `.env*`）

## 技术栈

- Electron ^33
- Vite 5 + React 18 + TypeScript
- `@pet/schema`：`loadPet` 解析 `pets/<id>/pet.json`
- 工作区：npm workspaces（`apps/*`、`packages/*`）

## 资源与加载

默认宠物：`pets/guga`

- 配置：`pets/guga/pet.json`（`renderer: video`，`video.dir = large/webm`，`clips.idle`）
- 视频：`pets/guga/large/webm/idle.webm`

主进程优先 `import('@pet/schema').loadPet(petsRoot, 'guga')`；失败则回退硬编码 `idle.webm` 路径。  
就绪后经 IPC `pet:ready` 推送；渲染层 `usePet` 亦可用 `petAPI.getPet` 兜底。

## 安全与本地资源

- 协议：`pet-asset://asset/<相对 pets 根路径>`（`protocol.handle` + `electron/pet-asset-path.js` 越界校验）
- 窗口：`webSecurity: true`、`sandbox: true`；协议 `bypassCSP: false`，渲染层 meta CSP 最小放行 `pet-asset:` 媒体
- 门禁：`npm run test:pet-asset`（路径 smoke）；CI 在 install 后、build 前跑 `typecheck` + `test:pet-asset`

## 已知限制

1. **本地资源协议**：见上；不再用 `file://` 关同源策略。
2. **透明通道 / WebM**：见下节「WebM 透明失败策略」。
3. **托盘图标**：占位图，后续可换宠物图标。
4. **窗口尺寸**：约 160–180 小窗范围，未做 DPI 精细适配。
5. **AI 对话**：环境变量或设置页本地加密 Key；无 Key / 失败时本地降级；UI 可区分本地/云端（B-801 / B-802）。
6. **打包体积**：`extraResources` 排除 `**/large/mov/**`，仅打包 webm 等运行时资源。
7. **精灵表**：多数宠仍为历史 `atlas` 配置；完成度见仓库 `pets/COMPLETION.md`。运行时需 `spritesheet` 字段或后续 normalize 映射。

## WebM 透明失败策略（B-805）

仅 **guga** 使用 `renderer: video`（WebM）。透明桌宠依赖三层同时正确：

1. **资源本身带 alpha**（VP9 + WebM `alpha_mode=1` / yuva 轨）  
2. **运行时解码保留 alpha**（Chromium/GPU 不丢透明轨）  
3. **透明窗 + 页面透明底**（`window.js` + `styles.css`）

### 两类问题务必区分

| 类型 | 表现 | 根因 | 运行时能否自动发现 |
|------|------|------|-------------------|
| **A. 资源无 alpha** | 能播，但有方块/黑底/实心底 | 导出为 `yuv420p` 等不透明像素格式；或源素材即黑底未抠透明 | **否**（`error` 不触发）。用 `ffprobe` / `npm run audit:pets` 门禁 |
| **B. 解码丢 alpha** | 资源已是 VP9+alpha，部分机器上仍黑底 | Chromium / 系统解码器 / GPU 驱动对 WebM alpha 支持不一致 | **否**（silent）。与 A 症状相似，需对照「同文件在 Chrome 是否透明」 |
| **C. 硬解码/加载失败** | 无画面；status 提示 | `MEDIA_ERR_DECODE` / `SRC_NOT_SUPPORTED` 等 | **是** → `PetVideo` `onDecodeError` |
| **D. autoplay 被拦** | 透明窗像「没有宠物」 | 打包后策略拦截；暂停时透明帧 0 可见像素 | 已用 `autoplay-policy` + muted + 首帧兜底缓解 |

历史说明：仓库内 guga 源 MOV/旧 WebM 曾为 **HEVC/VP9 + `yuv420p`（无 alpha）**。黑底方块首先应按 **类型 A** 排查，勿一律归因为「解码丢 alpha」。  
重导脚本：`scripts/reencode-guga-webm-alpha.ps1`（近黑 colorkey → VP9+alpha）。门禁：`npm run audit:pets`（需本机 `ffprobe`，检查 `codec=vp9` 且 `alpha_mode=1`）。

### 运行时（已实现）

| 层级 | 行为 |
|------|------|
| `PetVideo` | `error` 事件 → 中文 `onDecodeError`（解码失败 / 格式不支持 / 网络等）——仅覆盖 **类型 C** |
| `App` | `setStatus` 展示短提示；成功 `playing` 时清除解码类提示 |
| 日志 | `[renderer] 视频解码/加载失败` + clip 名 |
| 资源门禁 | `pet-pixel-audit.ps1` 对 guga 校验 VP9 + `alpha_mode=1`（无 ffprobe 时 WARN） |

**未实现：** 静态 PNG 回退；「有画面但无透明」的运行时探测；clip 级失败自动切 idle。

### 产品 / 资源建议

1. **入库标准**：WebM **VP9 + alpha**（`alpha_mode=1`）；避免仅 mov 进包（打包已排除 `**/large/mov/**`）。  
2. **自测透明**：用 **Chrome** 打开 `pets/guga/large/webm/idle.webm`（页面设透明底）；系统影片应用常忽略 alpha，**不能**作为透明是否成功的依据。  
3. **ffprobe 注意**：默认 native VP9 解码器可能报 `pix_fmt=yuv420p` 并忽略 alpha 侧数据；以 **`TAG:alpha_mode=1`** 为准，或用 `ffmpeg -c:v libvpx-vp9 -i …` 解码验证。  
4. 单 clip 硬失败：用户可见 status；FSM 仍可结束/切行为；**不**静默白屏。  
5. 极端环境：后续可加静态 PNG 回退 / 切其它 clip。

## 打包分发（Windows）

使用 [electron-builder](https://www.electron.build/) 产出 NSIS 安装包与 zip 解压版（不再发布 portable）。

### 命令

在**仓库根目录**：

```bash
# 仅解包目录（较快，便于自测）
npm run desktop:pack
# 等价：npm run pack -w @pet/desktop

# 完整 Windows NSIS + zip
npm run desktop:dist
# 等价：npm run dist -w @pet/desktop
```

包内脚本（`apps/desktop`）：

| 脚本             | 说明                                                           |
|----------------|--------------------------------------------------------------|
| `npm run pack` | 先 build schema/runtime + renderer，再 `electron-builder --dir` |
| `npm run dist` | 同上，再 `electron-builder --win`（nsis + zip）                      |

### 产物位置

```
apps/desktop/release/
├── desktop_pet-Setup-x.x.x.exe       # NSIS 安装包（dist）
├── desktop_pet-x.x.x-win-x64.zip     # zip 解压版（dist，解压即用）
└── win-unpacked/                     # pack / dist 的解包目录，可直接运行 desktop_pet.exe
```

### 打包路径说明

| 资源            | 开发                                 | 打包后                                     |
|---------------|------------------------------------|-----------------------------------------|
| `pets/`       | 仓库根 `pets/`                        | `resources/pets`（extraResources，排除 mov） |
| 渲染页           | Vite dev server 或 `dist-renderer/` | asar 内 `dist-renderer/`                 |
| `@pet/schema` | workspace 链接                       | 打入 asar 的 `node_modules/@pet/schema`    |

主进程 `getPetsRoot()`：`app.isPackaged` 时用 `process.resourcesPath/pets`。

### 打包版环境变量

安装包/便携版启动时**不会**自动读开发机 shell 环境。可选方式：

1. 从终端启动并注入（示例）：
   ```powershell
   $env:PET_ID="doro"
   $env:PET_AI_API_KEY="sk-..."
   & ".\apps\desktop\release\win-unpacked\desktop_pet.exe"
   ```
2. 系统/用户环境变量中设置 `PET_ID`、`PET_AI_API_KEY`、`PET_AI_BASE_URL`、`PET_AI_MODEL` 后，从开始菜单或快捷方式启动也会生效。
3. 无 API Key 时 AI 仍走本地关键词降级；宠物选择仍可读 `userData/desktop-prefs.json` 的 `pet` 分区（`PET_ID` 优先）。

### 已知

- **首次打包**会下载 Electron 二进制与 builder 缓存，可能较慢；可配镜像：
  ```powershell
  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
  npm run desktop:pack
  ```
- 需先保证 `@pet/schema` / `@pet/runtime` 的 `dist` 已构建（`pack`/`dist` 脚本会自动 `prepack:packages`）。
- monorepo 下已设 `electronVersion`、`npmRebuild: false`，避免 hoist 后找不到 Electron / 重装依赖打坏 `app-builder-bin`。
- Windows 未开「开发人员模式」时，winCodeSign 解压符号链接会失败；已设 `win.signAndEditExecutable: false`
  跳过（无代码签名）。若需签名，请开启开发人员模式或以管理员运行后去掉该选项。
- 应用图标位于 `apps/desktop/build/`（`icon.ico` / `tray.png`）；可替换为正式设计稿后重新 `desktop:pack`。

### 更新与签名排期说明（B-806，不改版本号）

| 项 | 现状 | 后续计划 |
|----|------|----------|
| **目标产物** | **nsis** + **zip**（x64） | 安装包 `*-Setup-*.exe`；解压包默认名 `*-win-x64.zip`（无顶层 `zip` 配置块） |
| **NSIS** | `oneClick: false`，可改安装目录 | 稳定后再考虑一键安装默认 |
| **自动更新** | `electron-updater` + `publish.provider: github`（`moon-stack-OAo/desktop_pet`） | 需 GitHub Release 资产命名与 builder 一致；未 TAG 前不发正式更新通道 |
| **代码签名** | **`signAndEditExecutable: false`**，**当前无 Authenticode 签名** | 取得证书后：开开发人员模式 → 去掉该开关 → 配置 `certificateSubjectName` / CI 密钥；未签名时 SmartScreen 可能告警属预期 |
| **版本号** | 以 package 为准；**未打 TAG 前不随意改版本** | 与 CHANGELOG / Release 同步发版 |
| **托盘检查更新** | 开发态可能 `dev-skip` | 仅 packaged 走完整检查 |

**发版前请走下方 checklist（含 audit）。**

## 发版 Checklist（含 B-904 依赖 audit）

发 Windows 包 / GitHub Release 前建议按序执行：

1. **干净树**：确认无误提交密钥、`release/`、本地 `.env`。
2. **质量门禁**（仓库根）：
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run smoke
   ```
3. **依赖审计（B-904）**：
   ```bash
   npm audit --omit=dev
   # 或全量：npm audit
   ```
   - 对 **critical / high** 评估是否阻断发版；能修则 `npm audit fix`（避免 semver 大跳未测）。
   - **Electron 主版本**升级单独排期：核对 `electron-builder` / `electron-updater` 兼容、透明窗与 `pet-asset` 协议回归。
   - 记录 audit 残留风险到 Release notes（可选）。
4. **打包**：`npm run desktop:pack` 自测 `win-unpacked`；通过后 `npm run desktop:dist`。
5. **冒烟**：启动 / 切宠 / 托盘 / 对话（本地徽标）/ guga 视频 / 更新入口（packaged）。
6. **签名**（若本版仍跳过）：在 Release 说明写明「未代码签名」。
7. **TAG / Release**：仅在准备对外版本时打 TAG；上传 nsis + zip；确认 updater 能解析到该版本。

## 用户数据（prefs / localStorage）

实现参考：`electron/prefs.js`、`shared/user-storage-migrate.js`、`src/hooks/useVitals.ts`、`src/hooks/useAudio.ts`。

### Electron userData 文件

路径：`app.getPath('userData')` 下（Windows 常见为 `%APPDATA%/desktop_pet/`，以实际 `productName` / `name` 为准）。

| 文件 | 说明 |
|------|------|
| `desktop-prefs.json` | **当前**统一偏好：`{ "pet": { "currentPetId"?, "ignoreMouse"? }, "update": { "checkOnStart", "lastCheckDate", "ignoredVersion" } }` |
| `ai-settings.json` | AI 凭证（B-802）：`baseUrl` / `model`；`apiKeyEnc`（safeStorage）或 `apiKeyPlain`（加密不可用时）；**勿复制到仓库** |
| `pet-prefs.json` | **旧**宠物偏好；首次读到且无新文件时合并进 `desktop-prefs.json` |
| `update-prefs.json` | **旧**更新偏好；同上一次性迁移 |

读写 API：`readPetPrefs` / `writePetPrefs` / `readUpdatePrefs` / `writeUpdatePrefs`（`electron/prefs.js`）。

**迁移行为**：

1. 若已存在 `desktop-prefs.json`：直接读；兼容误把扁平字段写进新文件的情况。
2. 否则若存在旧 `pet-prefs.json` / `update-prefs.json`：合并写入 `desktop-prefs.json`（旧文件保留不删）。
3. 都没有：内存默认值，按需写回。

### 渲染层 localStorage

| Key | Schema | 说明 |
|-----|--------|------|
| `pet-vitals:{petId}` | v1 JSON：`{ version: 1, hunger, mood, updatedAt }` | 每宠养成；`hunger`/`mood` 0–100 |
| `pet-muted` | v1 JSON：`{ version: 1, muted: boolean }` | 全局静音 |
| `PET_LOG_LEVEL` | 字符串 | 可选，覆盖渲染层日志级别 |

迁移逻辑（`shared/user-storage-migrate.js`，读写时自动）：

| 数据 | 旧格式 | 迁移后 |
|------|--------|--------|
| vitals | 无 `version` 的 `{ hunger, mood, updatedAt }` | 补 `version: 1` 写回 |
| vitals | 损坏 JSON / 非法 | 默认 hunger=80 mood=70，带 version |
| muted | 纯字符串 `"1"` / `"0"` | `{ version: 1, muted: true/false }` |
| muted | 已是 v1 JSON | 不改 |

**向后兼容**：读路径同时识别旧格式；写路径始终写当前 version。升级应用后用户数值与静音状态保留。

### 与切宠的关系

- `pet.currentPetId` 在主进程 prefs；切宠成功后写回。
- vitals 按 id 分 key，切宠只切换读取的 key，不互相覆盖。
- muted 全局一份，与当前宠无关。
