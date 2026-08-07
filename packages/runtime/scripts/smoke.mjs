/**
 * 冒烟：request / playClip / onClipEnded / 优先级 / loop 超时 / 占位折叠
 * 用法：node scripts/smoke.mjs（需先 npm run build）
 */
import {BehaviorFSM, createAutoScheduler, inferPriority, PRIORITY_RANK,} from '../dist/index.js';

const clips = {
  idle: { loop: true },
  walk: { loop: true },
  eat: { loop: false },
  milktea: { loop: false },
  headpat: { loop: false },
  spin: { loop: false },
  dance: { loop: true },
  rest: { loop: true },
  hungry: { loop: true },
};

const behaviorMap = {
  idle: ['idle'],
  walk: ['walk'],
  eat: ['eat', 'milktea'],
  sleep: ['rest', 'idle'],
  happy: ['headpat', 'spin', 'dance'],
  hungry: ['hungry'],
};

let seq = 0;
const rand = () => {
  const table = [0.1, 0.6, 0.2, 0.9, 0.3];
  return table[seq++ % table.length];
};

const changes = [];
const fsm = new BehaviorFSM({
  behaviorMap,
  clips,
  defaultBehavior: 'idle',
  random: rand,
  now: () => 1000 + changes.length,
  // 固定时长避免 armLoopTimeout 消耗 random（保持 clip 选取可重复）
  loopMinMs: 9999,
  loopMaxMs: 9999,
  // 不真正计时，下面单独测 loop timeout
  schedule: () => () => {},
  onChange(state, meta) {
    changes.push({ ...state, reason: meta.reason, priority: meta.priority });
  },
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 初始 idle
assert(fsm.getState().behavior === 'idle', 'init idle');
assert(fsm.getState().clip === 'idle', 'init clip idle');

// auto walk
assert(fsm.request('walk', 'auto') === true, 'auto walk');
assert(fsm.getState().behavior === 'walk', 'now walk');

// auto 可打断 auto walk
assert(fsm.canInterrupt('auto') === true, 'auto can interrupt auto');
assert(fsm.canInterrupt('user') === true, 'user can interrupt');

// user happy（3 候选，rand 0.1 → headpat）
assert(fsm.request('happy', 'user:click') === true, 'user happy');
assert(fsm.getState().behavior === 'happy', 'now happy');
assert(
  fsm.getState().clip === 'headpat',
  `happy clip headpat got ${fsm.getState().clip}`,
);

// auto 不可打断 user 的 happy（非 idle）
assert(fsm.canInterrupt('auto') === false, 'auto cannot interrupt user');
assert(fsm.request('walk', 'auto') === false, 'auto walk blocked');
assert(fsm.getState().behavior === 'happy', 'still happy');

// 非 loop 结束 → idle
fsm.onClipEnded();
assert(fsm.getState().behavior === 'idle', 'after end idle');
assert(fsm.getState().clip === 'idle', 'after end clip idle');

// playClip
assert(fsm.playClip('spin', 'ai') === true, 'play spin');
assert(fsm.getState().clip === 'spin', 'clip spin');
assert(fsm.getState().behavior === 'spin', 'behavior spin');

// 不存在的 clip
assert(fsm.playClip('nope') === false, 'missing clip');

// eat 从 map 选
assert(fsm.request('eat', 'user') === true, 'eat');
assert(['eat', 'milktea'].includes(fsm.getState().clip), 'eat candidates');

// inferPriority
assert(inferPriority('auto') === 'auto', 'infer auto');
assert(inferPriority('ai:chat') === 'ai', 'infer ai');
assert(inferPriority('user:feed') === 'user', 'infer user');
assert(PRIORITY_RANK.user > PRIORITY_RANK.ai, 'rank order');

// scheduler 仅创建/启停（默认多候选 + 显式 walk）
const sch = createAutoScheduler(fsm, {
  minMs: 10,
  maxMs: 10,
  behaviors: ['walk', 'happy', 'play'],
  random: () => 0,
});
assert(sch.isRunning() === false, 'sch not running');
sch.start();
assert(sch.isRunning() === true, 'sch running');
sch.stop();
assert(sch.isRunning() === false, 'sch stopped');

// ── loop 超时回 idle（注入 schedule）─────────────────
{
  let fired = null;
  const timeouts = [];
  const fsm2 = new BehaviorFSM({
    behaviorMap: { idle: ['idle'], walk: ['walk'] },
    clips: { idle: { loop: true }, walk: { loop: true } },
    loopMinMs: 100,
    loopMaxMs: 100,
    random: () => 0,
    now: () => 0,
    schedule: (cb, ms) => {
      timeouts.push(ms);
      fired = cb;
      return () => {
        fired = null;
      };
    },
  });
  assert(fsm2.request('walk', 'auto') === true, 'walk for timeout');
  assert(fsm2.getState().behavior === 'walk', 'walking');
  assert(timeouts.length === 1 && timeouts[0] === 100, 'armed 100ms');
  assert(typeof fired === 'function', 'timeout callback armed');
  fired();
  assert(fsm2.getState().behavior === 'idle', 'loop-timeout → idle');
  assert(fsm2.getState().clip === 'idle', 'loop-timeout clip idle');
  fsm2.dispose();
}

// ── sustained hungry 不超时 ──────────────────────────
{
  let armed = false;
  const fsm3 = new BehaviorFSM({
    behaviorMap: { idle: ['idle'], hungry: ['hungry'] },
    clips: { idle: { loop: true }, hungry: { loop: true } },
    schedule: (cb) => {
      armed = true;
      return () => {};
    },
  });
  assert(fsm3.request('hungry', 'auto:hunger') === true, 'hungry ok');
  assert(armed === false, 'hungry not armed for timeout');
  fsm3.dispose();
}

// ── 占位 walk→idle 折叠为 idle ───────────────────────
{
  const fsm4 = new BehaviorFSM({
    behaviorMap: {
      idle: ['idle'],
      walk: ['idle'],
      eat: ['idle'],
    },
    clips: { idle: { loop: true } },
    schedule: () => () => {},
  });
  assert(fsm4.request('walk', 'auto') === true, 'placeholder walk');
  assert(fsm4.getState().behavior === 'idle', 'folded to idle behavior');
  assert(fsm4.getState().clip === 'idle', 'folded idle clip');
  // 仍 idle → scheduler 可继续 tick
  assert(fsm4.canInterrupt('auto') === true, 'still interruptible as idle');
  fsm4.dispose();
}

// ── happy + dance(loop) 会排程超时 ───────────────────
{
  let armedMs = 0;
  let cb = null;
  const fsm5 = new BehaviorFSM({
    behaviorMap: { idle: ['idle'], happy: ['dance'] },
    clips: { idle: { loop: true }, dance: { loop: true } },
    loopMinMs: 50,
    loopMaxMs: 50,
    schedule: (fn, ms) => {
      armedMs = ms;
      cb = fn;
      return () => {
        cb = null;
      };
    },
  });
  assert(fsm5.request('happy', 'user') === true, 'happy dance');
  assert(fsm5.getState().behavior === 'happy', 'happy');
  assert(armedMs === 50, 'dance loop armed');
  cb();
  assert(fsm5.getState().behavior === 'idle', 'dance timeout → idle');
  fsm5.dispose();
}

// ── sameBehaviorPolicy ignore 用 PRIORITY_RANK ───────
{
  const fsm6 = new BehaviorFSM({
    behaviorMap: { idle: ['idle'], happy: ['headpat'] },
    clips: { idle: { loop: true }, headpat: { loop: false } },
    sameBehaviorPolicy: 'ignore',
    schedule: () => () => {},
  });
  assert(fsm6.request('happy', 'user') === true, 'happy1');
  assert(fsm6.request('happy', 'user:again') === false, 'ignore same user');
  // ai 优先级更低，仍 ignore
  assert(fsm6.request('happy', 'ai:x') === false, 'ignore lower priority');
  fsm6.onClipEnded();
  fsm6.dispose();
}

fsm.dispose();
console.log('smoke OK', {
  changes: changes.length,
  last: fsm.getState(),
});
