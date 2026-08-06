/**
 * FSM 修复后回归探测（需 npm run build）
 */
import {BehaviorFSM, inferPriority} from '../dist/index.js';

function assert(c, m) {
  if (!c) throw new Error(m);
}

// 1) loop walk：超时回调回 idle
{
  let cb = null;
  const fsm = new BehaviorFSM({
    behaviorMap: { idle: ['idle'], walk: ['walk'] },
    clips: { idle: { loop: true }, walk: { loop: true } },
    loopMinMs: 10,
    loopMaxMs: 10,
    schedule: (fn) => {
      cb = fn;
      return () => {
        cb = null;
      };
    },
  });
  assert(fsm.request('walk', 'auto') === true, 'walk ok');
  assert(fsm.getState().behavior === 'walk', 'walking');
  assert(typeof cb === 'function', 'timeout armed');
  cb();
  assert(fsm.getState().behavior === 'idle', 'timeout → idle');
  fsm.dispose();
}

// 2) spritesheet 占位：walk→idle 折叠为 idle
{
  const fsm = new BehaviorFSM({
    behaviorMap: {
      idle: ['idle'],
      walk: ['idle'],
      eat: ['idle'],
    },
    clips: { idle: { loop: true } },
    schedule: () => () => {},
  });
  assert(fsm.request('walk', 'auto') === true, 'placeholder walk');
  assert(fsm.getState().behavior === 'idle', 'folded idle (not stuck walk)');
  assert(fsm.getState().clip === 'idle', 'clip idle');
  fsm.dispose();
}

// 3) happy dance loop → 超时回 idle
{
  let cb = null;
  const fsm = new BehaviorFSM({
    behaviorMap: { idle: ['idle'], happy: ['dance'] },
    clips: { idle: { loop: true }, dance: { loop: true } },
    loopMinMs: 10,
    loopMaxMs: 10,
    schedule: (fn) => {
      cb = fn;
      return () => {
        cb = null;
      };
    },
  });
  fsm.request('happy', 'user');
  assert(fsm.getState().behavior === 'happy', 'happy dance');
  cb();
  assert(fsm.getState().behavior === 'idle', 'not stuck happy');
  fsm.dispose();
}

// 4) inferPriority
assert(inferPriority('ai:chat:eat') === 'ai', 'ai chat');
assert(inferPriority('auto:hunger') === 'auto', 'auto hunger');

console.log('probe-fsm OK (fixes verified)');
