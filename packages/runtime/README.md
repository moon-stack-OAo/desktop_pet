# @pet/runtime

desktop_pet **行为状态机（FSM）**与自主调度，纯 TypeScript，无 Electron/DOM 依赖。  
已由 `apps/desktop` 渲染层接入（`PetContext`）。

## 安装

根 monorepo workspaces 已包含 `packages/*`，在仓库根目录：

```bash
npm install
```

## 核心 API

### `BehaviorFSM`

```ts
import { BehaviorFSM } from '@pet/runtime';

const fsm = new BehaviorFSM({
  behaviorMap: {
    idle: ['idle'],
    walk: ['walk'],
    eat: ['eat', 'milktea'],
    happy: ['headpat', 'spin', 'dance'],
  },
  clips: {
    idle: { loop: true },
    walk: { loop: true },
    eat: { loop: false },
    milktea: { loop: false },
    headpat: { loop: false },
    spin: { loop: false },
    dance: { loop: true },
  },
  defaultBehavior: 'idle',
  loopMinMs: 5000,
  loopMaxMs: 12000,
  onChange(state, meta) {
    console.log(state.behavior, state.clip, meta.reason);
  },
});

fsm.request('happy', 'user:headpat'); // 用户交互
fsm.request('walk', 'auto'); // 自主行为（loop 将在 5–12s 超时回 idle）
fsm.playClip('spin', 'ai');
fsm.onClipEnded(); // 非 loop 结束 → idle
fsm.dispose(); // 切宠 / 卸载时清 loop 定时器
```

### 优先级

`user > ai > auto`（`PRIORITY_RANK`）

- 从 `reason` 推断：`auto` / `auto:*` → auto；`ai` / `ai:*` → ai；其余 → user
- 当前为 `idle` 时任意来源可切入
- 非 idle 时需 **≥ 当前优先级** 才能打断

### 规则

1. `request(behavior)`：从 `behaviorMap[behavior]` 过滤存在于 `clips` 的候选并随机选取；map 无效则尝试同名 clip
2. `loop !== true` 的 clip 在 `onClipEnded()` 后回到 `defaultBehavior`（默认 idle）
3. **`loop === true` 且非 idle、非 sustained（默认 hungry/sleep/sick）**：在 `loopMinMs`–`loopMaxMs`（默认 5–12s）超时后以 `auto:loop-timeout` 回 idle  
   - clip 可设 `maxDurationMs` 覆盖全局区间  
   - 注入 `schedule` 便于单测
4. **占位折叠**：若 `behavior ≠ idle` 且解析到的 clip 就是 loop 的 `idle`，则记为仍在 `idle`（避免 spritesheet `walk→idle` 卡死调度）
5. 相同 behavior 默认 **允许重入换 clip**（`sameBehaviorPolicy: 'reenter'`）；`ignore` 时用 `PRIORITY_RANK` 比较

### `createAutoScheduler`

```ts
import { createAutoScheduler } from '@pet/runtime';

const scheduler = createAutoScheduler(fsm, {
  minMs: 8000,
  maxMs: 20000,
  behaviors: ['walk'],
});
scheduler.start();
scheduler.stop();
```

仅在当前为 `idle` 且 `canInterrupt('auto')` 时 `request(behavior, 'auto')`。  
依赖 FSM 的 loop 超时，否则 walk 切入后无法回到 idle。

## 脚本

```bash
cd packages/runtime
npm run typecheck
npm run build
node scripts/smoke.mjs
```

## 设计说明

- 与 `@pet/schema` 的 `BehaviorMap` / `VideoClip` 字段对齐，但不强制依赖 schema 包
- 可注入 `random` / `now` / `schedule`
- `dispose()` 须在切宠或组件卸载时调用，避免泄漏 loop 定时器
