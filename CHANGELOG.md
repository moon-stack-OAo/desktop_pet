# Changelog

本文件记录项目的重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

版本规范：

- 产品版本以 `apps/desktop/package.json` 为准；发版时打 TAG（如 `v0.1.0`）
- 未 push 前的改动视为同一版本变动
- 进行中变更写在 `[Unreleased]`；发版时并入对应版本小节

---

## [Unreleased]

（暂无）

---

## [0.1.0] — 2026-08-07

首个正式 TAG 候选版本：Windows 桌面宠物可运行基线 + 工程债清理与交互/资源对齐。

### 功能

- Windows 透明置顶小窗、自定义左键拖拽移动（避免系统窗口菜单）
- 行为状态机（`@pet/runtime`）：idle / walk / eat / play / sleep / hungry 等
- 双渲染：`renderer: video`（guga WebM）与 `renderer: atlas/spritesheet`（11 只精灵表宠）
- 本地养成：饱食 / 心情随时间衰减；喂食、摸摸头、玩耍可回升
- AI 对话：双击或托盘打开；凭证优先级 **环境变量 > safeStorage > 本地规则**
- 系统托盘与小窗右键：**原生 `Menu.popup`** 共用菜单模板（行为、切宠、静音、穿透、AI、更新、退出）
- 自动更新：`electron-updater`（GitHub Releases；portable 跳过启动检查）
- 12 只宠物资源（`pets/manifest.json`）：guga + doro / elaina / homie / linnea / mambo / naruto / nezuko / phoebe / skirk / taffy / wukong
- monorepo：`apps/desktop` + `packages/schema` + `packages/runtime` + `pets/`

### 修复

- 沙箱 preload 内联 IPC 通道常量，修复 `petAPI` 注入失败导致空白窗
- 打包 WebM 被 autoplay 拦截导致看不见宠物
- portable 单文件启动与 `unpackDirName` / 产物命名
- 切宠回 guga：强制重载、清 FSM、video 回落 idle；托盘切宠用普通菜单项
- `desktop:dev` 端口 5173 占用（`scripts/free-port.js`）；窗口 `ready-to-show` / 托盘可见性
- Windows 控制台中文乱码（`chcp 65001` / logger）
- 小窗去掉 HTML 自定义右键菜单与 `-webkit-app-region: drag` 冲突

### 宠物与人设

- 全部 12 宠 `persona.md` 加厚：身份 / 外观 / 性格 / 说话风格 / 禁忌
- 精灵表显式 `behaviorMap`；`happy` 独立 row8，与 eat 分行
- description / colors / persona 与 spritesheet 像素对齐（含 linnea / homie / mambo 等）
- 清理 Codex / Genshin 等模板残留文案；skirk 中文笔误修正
- 记录 **row6** 美术债：`sleep` / `hungry` / `waiting` 同列仅 fps 区分（禁止无美术假拆行）
- 新增 `scripts/pet-pixel-audit.ps1` 与 `npm run audit:pets`（依赖 ImageMagick）

### 工程

- 主进程拆分：`pet-loader` / `ai-chat` / `tray-menu` / `window` / `ipc` 等；`main` 仅生命周期编排
- IPC / Payload 类型单一源：`shared/ipc-channels`、`shared/pet-payload`、`shared/menu-model`
- 渲染层 hooks：`useChatSession` / `useWindowDrag` / `useContextQuit` 等
- 单测：`node:test`；schema / runtime / desktop 关键路径
- CI：`ci.yml` 门禁（lint / typecheck / smoke / test）；`build.yml` tag 推送构建 Windows 并发布 Release
- Biome：`format` / `lint` / `lint:fix`
- atlas → spritesheet：`normalizePet` 映射；11 宠真多帧 walk / happy 等
- 发版辅助：`scripts/extract-changelog.js` 从本文件抽取 Release notes

### 文档

- 根 `README.md`：结构、脚本、AI 优先级、打包说明
- `pets/SPRITESHEET_TEMPLATE.md` / `pets/COMPLETION.md`：帧约定、完成度与美术债
- `apps/desktop/README`：架构、用户数据、发版 checklist

### 技术栈

- Electron ^33、Vite 5、React 18、TypeScript；npm workspaces
- `@pet/schema`：pet.json 类型 / 校验 / 加载
- `@pet/runtime`：纯 TS 行为 FSM + AutoScheduler
- 打包：electron-builder → NSIS（`desktop_pet-Setup-0.1.0.exe`）+ portable（`desktop_pet-0.1.0-portable.exe`）；当前未代码签名

### 已知限制

- Windows 未签名，SmartScreen 可能提示
- atlas 宠 `hungry` 与 `sleep` 共用 row6（待美术）
- 非 guga 宠音频资源仍有限
