# Changelog

本文件记录项目的重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

版本规范：

- 未发 TAG 前不修改版本号（当前产品版本 **0.1.0**）
- 未 push 前的改动视为同一版本变动
- 进行中变更写在 `[Unreleased]`

---

## [Unreleased]

### 文档

- 根 `README.md` 按工程优化结果重写：结构 / 脚本（test·lint·smoke）/ CI / AI 设置优先级 / 架构要点 / 去掉失效 TODO 链接
- 更新 `pets/SPRITESHEET_TEMPLATE.md`：反映 atlas→spritesheet 现状、帧约定、推荐模板与校验流程
- 优化全部 12 只宠物 `pets/*/persona.md`：统一中文结构（身份/性格/说话风格/禁忌），区分角色辨识度
- 根 README 初版补齐：项目简介、monorepo、快速启动（B-101）
- 修正 `apps/desktop/README` 示例路径与仓库一致（B-102）
- 用户数据文档：prefs 路径、localStorage key、vitals/muted schema 版本与迁移行为（B-604）
- 宠物加载策略说明：校验失败拒载 / 降级 / 回退 guga、payload 缓存与失效（B-601 / B-602）

### 工程

- 选定 `node:test` 作为单测框架；根与子包统一 `test` / `typecheck` / `smoke` 脚本（B-301）
- `@pet/runtime` 单测：FSM 优先级、loop 超时、占位折叠、可注入 schedule / random（B-302）
- `@pet/schema` 单测：normalize / validate / loadPet 正常与异常路径（B-303）
- `pet-loader` / AI 规则 / user-storage 迁移单测；校验失败策略有断言（B-304）
- CI 门禁（`.github/workflows/ci.yml`）：install → lint → typecheck → smoke → 单测（Windows）（B-305 / B-703）
- 引入 Biome：`npm run format` / `lint` / `lint:fix`（B-701 / B-702）
- `build.yml` 增加 Lint job；PR / 主分支推送时跑 lint（B-703）

### 重构

- 主进程拆分：`main.js` 由约 1418 行降至约 194 行生命周期编排（E2）
  - 抽出 `pet-loader`（clips / audio / ai / video / spritesheet / `loadPetPayload`）（B-201）
  - 抽出 `ai-chat`（本地规则 / OpenAI 兼容 / `handleAiChat`）（B-202）
  - 抽出 `tray-menu`（托盘图标、菜单模板、行为请求）（B-203）
  - 抽出 `window`（`createWindow`、尺寸 / 穿透）（B-204）
  - IPC 注册收敛至 `ipc.js`；`main` 仅 `whenReady` 编排（B-205）
  - 拆分后回归：typecheck + pet-asset smoke + 启动 / 切宠 / 托盘 / AI / 更新入口（B-206）
- IPC / Payload 类型单一源（E4）
  - `shared/ipc-channels`：通道名常量单处导出（B-401）
  - `shared/pet-payload`：共享 `PetPayload` 与 invoke 签名（B-402）
  - 收紧 renderer 过宽类型（如 `'video' | 'spritesheet'`）（B-403）
  - 类型对齐回归 typecheck 通过（B-404）
- 渲染层瘦身与菜单统一（E5）
  - `shared/menu-model`：喂食 / 摸摸等行为项单源；托盘与右键共用（B-501）
  - 拆 `usePetMenu` / `useChatSession` / `useIgnoreMouse` 等 hooks（B-502 – B-504）
  - `useHungerAutoBehavior`：vitals → 自动行为从 Context 抽 hook（B-505）

### 修复

- 沙箱 preload 内联 IPC 通道常量：禁止 `require` 项目内模块，修复 `petAPI` 注入失败导致空白窗 / 右下角无宠物
- 打包/启动体验：穿透开启时托盘气泡提示；单击托盘显示窗口；打包态强制 `loadFile` 与加载失败日志

### 功能与性能

- 校验失败策略产品化：拒载 / 降级 / 回退 guga；日志与可感知提示（B-601）
- 切宠 payload 缓存：已加载宠再次切换可复用，支持 `force` 失效（B-602）
- vitals / muted localStorage schema 带 version，升级可迁移（B-603）
- AI 模式可感知：回复带 `mode` / `source` / `errorKind`；聊天 UI 区分本地 / 云端与超时文案（B-801）
- AI Key 配置入口：设置面板 + `safeStorage` 本地加密；优先级 env > 本地；聊天 ⚙ / 右键「AI 设置」（B-802）
- WebM 解码失败时 status 提示；文档说明透明策略（B-805）
- 更新与签名排期说明（NSIS / portable / 未签名）（B-806）
- 角色动画完成度表 `pets/COMPLETION.md`（B-803）
- 精灵表 atlas→spritesheet：normalize 映射 path/帧/animations，并推导核心 behaviorMap；11 只 atlas 宠可加载真多帧 walk/happy 等（B-804 P0）
- 精灵表 `document.hidden` 时停 rAF（B-901）
- 视频 clip 空闲预加载 / 缓存（B-902）
- 启动 `getPet` + `onReady` 去闪错误 status（B-903）
- 发版 checklist 含 `npm audit` / Electron 升级（B-904）

---

## [0.1.0] — 基线（产品能力）

> 尚未正式打 TAG；下列为当前桌面宠物产品已具备的能力基线，供对照 Unreleased 工程债清理。

### 功能

- Windows 透明置顶小窗、左键拖拽移动
- 行为状态机（`@pet/runtime`）：idle / walk / eat / play / sleep 等，支持用户交互与自主调度
- 双渲染：`renderer: video`（如 guga webm）与 `renderer: spritesheet`
- 本地养成：饱食 / 心情随时间衰减；喂食、摸摸头、玩耍可回升
- AI 对话：双击打开面板；有 API Key 走 OpenAI 兼容接口，否则本地关键词降级
- 系统托盘与右键菜单：行为、切换宠物、静音、点击穿透、检查更新、退出
- 自动更新：`electron-updater`（GitHub Releases）
- 宠物资源：`pets/` 下多角色（`manifest.json` 注册）
- monorepo：`apps/desktop` + `packages/schema` + `packages/runtime` + `pets/`

### 技术栈

- Electron ^33、Vite 5、React 18、TypeScript；npm workspaces
- `@pet/schema`：pet.json 类型 / 校验 / 加载
- `@pet/runtime`：纯 TS 行为 FSM + AutoScheduler
