/**
 * @pet/runtime BehaviorFSM 单测
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BehaviorFSM,
  PRIORITY_RANK,
  inferPriority,
} from '../dist/index.js';

const baseClips = {
  idle: { loop: true },
  walk: { loop: true },
  eat: { loop: false },
  milktea: { loop: false },
  headpat: { loop: false },
  spin: { loop: false },
  dance: { loop: true },
  rest: { loop: true },
  hungry: { loop: true },
  sleep: { loop: true },
  sick: { loop: true },
};

const baseMap = {
  idle: ['idle'],
  walk: ['walk'],
  eat: ['eat', 'milktea'],
  sleep: ['rest', 'idle'],
  happy: ['headpat', 'spin', 'dance'],
  hungry: ['hungry'],
  sick: ['sick'],
};

function createFsm(overrides = {}) {
  return new BehaviorFSM({
    behaviorMap: baseMap,
    clips: baseClips,
    defaultBehavior: 'idle',
    schedule: () => () => {},
    random: () => 0,
    now: () => 1000,
    ...overrides,
  });
}

describe('inferPriority / PRIORITY_RANK', () => {
  it('从 reason 推断优先级', () => {
    assert.equal(inferPriority(undefined), 'user');
    assert.equal(inferPriority('auto'), 'auto');
    assert.equal(inferPriority('auto:tick'), 'auto');
    assert.equal(inferPriority('ai:chat'), 'ai');
    assert.equal(inferPriority('user:feed'), 'user');
    assert.equal(inferPriority('menu'), 'user');
  });

  it('优先级数值 user > ai > auto', () => {
    assert.ok(PRIORITY_RANK.user > PRIORITY_RANK.ai);
    assert.ok(PRIORITY_RANK.ai > PRIORITY_RANK.auto);
  });
});

describe('BehaviorFSM 初始与 request', () => {
  it('初始为 idle', () => {
    const fsm = createFsm();
    assert.equal(fsm.getState().behavior, 'idle');
    assert.equal(fsm.getState().clip, 'idle');
    assert.equal(fsm.getPetState().priority, 'auto');
    assert.equal(fsm.getPetState().loop, true);
    fsm.dispose();
  });

  it('request 成功切换行为并从 map 选 clip', () => {
    const fsm = createFsm({ random: () => 0 });
    assert.equal(fsm.request('walk', 'auto'), true);
    assert.equal(fsm.getState().behavior, 'walk');
    assert.equal(fsm.getState().clip, 'walk');
    assert.equal(fsm.getPetState().priority, 'auto');
    fsm.dispose();
  });

  it('behaviorMap 支持 {clip,weight} 加权（低权 clip 更难被选中）', () => {
    // random=0.99 落在权重末段；question weight 0.35 vs idle 1 + peek 1 → 总 2.35
    // 0.99*2.35≈2.32 → 越过 idle(1)、peek(1) 才到 question
    const clips = {
      idle: { loop: true },
      peek: { loop: false },
      question: { loop: false },
    };
    const map = {
      idle: [
        'idle',
        'peek',
        { clip: 'question', weight: 0.35 },
      ],
    };
    // random 很小 → 必中 idle（首段）
    const fsmLow = createFsm({
      clips,
      behaviorMap: map,
      random: () => 0.01,
    });
    assert.equal(fsmLow.request('idle', 'user'), true);
    assert.equal(fsmLow.getState().clip, 'idle');
    fsmLow.dispose();

    // random 很大 → 落到 question
    const fsmHigh = createFsm({
      clips,
      behaviorMap: map,
      random: () => 0.99,
    });
    assert.equal(fsmHigh.request('idle', 'user'), true);
    assert.equal(fsmHigh.getState().clip, 'question');
    fsmHigh.dispose();
  });

  it('多候选时按 random 选取', () => {
    const fsm = createFsm({ random: () => 0.9 });
    assert.equal(fsm.request('eat', 'user'), true);
    assert.ok(['eat', 'milktea'].includes(fsm.getState().clip));
    fsm.dispose();
  });

  it('无 map 时同名 clip 可播', () => {
    const fsm = createFsm({ behaviorMap: { idle: ['idle'] } });
    assert.equal(fsm.request('spin', 'user'), true);
    assert.equal(fsm.getState().behavior, 'spin');
    assert.equal(fsm.getState().clip, 'spin');
    fsm.dispose();
  });

  it('不存在的行为返回 false', () => {
    const fsm = createFsm();
    assert.equal(fsm.request('nope', 'user'), false);
    assert.equal(fsm.getState().behavior, 'idle');
    fsm.dispose();
  });
});

describe('FSM 优先级打断', () => {
  it('idle 上任意来源可切入', () => {
    const fsm = createFsm();
    assert.equal(fsm.canInterrupt('auto'), true);
    assert.equal(fsm.canInterrupt('ai'), true);
    assert.equal(fsm.canInterrupt('user'), true);
    fsm.dispose();
  });

  it('auto 占用时 user/ai/auto 均可打断', () => {
    const fsm = createFsm();
    fsm.request('walk', 'auto');
    assert.equal(fsm.canInterrupt('auto'), true);
    assert.equal(fsm.canInterrupt('ai'), true);
    assert.equal(fsm.canInterrupt('user'), true);
    fsm.dispose();
  });

  it('user 占用时 auto 不可打断', () => {
    const fsm = createFsm();
    assert.equal(fsm.request('happy', 'user:click'), true);
    assert.equal(fsm.canInterrupt('auto'), false);
    assert.equal(fsm.request('walk', 'auto'), false);
    assert.equal(fsm.getState().behavior, 'happy');
    assert.equal(fsm.canInterrupt('user'), true);
    assert.equal(fsm.request('walk', 'user'), true);
    assert.equal(fsm.getState().behavior, 'walk');
    fsm.dispose();
  });

  it('ai 占用时 auto 不可、user 可打断', () => {
    const fsm = createFsm();
    assert.equal(fsm.request('walk', 'ai:chat'), true);
    assert.equal(fsm.getPetState().priority, 'ai');
    assert.equal(fsm.canInterrupt('auto'), false);
    assert.equal(fsm.request('eat', 'auto'), false);
    assert.equal(fsm.request('happy', 'user'), true);
    assert.equal(fsm.getState().behavior, 'happy');
    fsm.dispose();
  });
});

describe('onClipEnded / playClip', () => {
  it('非 loop clip 结束后回到 idle', () => {
    const fsm = createFsm();
    fsm.request('eat', 'user');
    assert.equal(fsm.getPetState().loop, false);
    fsm.onClipEnded();
    assert.equal(fsm.getState().behavior, 'idle');
    assert.equal(fsm.getState().clip, 'idle');
    fsm.dispose();
  });

  it('loop clip 的 onClipEnded 忽略', () => {
    const fsm = createFsm();
    fsm.request('walk', 'auto');
    fsm.onClipEnded();
    assert.equal(fsm.getState().behavior, 'walk');
    fsm.dispose();
  });

  it('playClip 直接播 clip', () => {
    const fsm = createFsm();
    assert.equal(fsm.playClip('spin', 'ai'), true);
    assert.equal(fsm.getState().clip, 'spin');
    assert.equal(fsm.getState().behavior, 'spin');
    assert.equal(fsm.playClip('nope'), false);
    fsm.dispose();
  });
});

describe('loop 超时与 schedule 注入', () => {
  it('loop 非 sustained 行为超时后回 idle', () => {
    /** @type {(() => void) | null} */
    let fired = null;
    /** @type {number[]} */
    const timeouts = [];
    const fsm = new BehaviorFSM({
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
    assert.equal(fsm.request('walk', 'auto'), true);
    assert.deepEqual(timeouts, [100]);
    assert.equal(typeof fired, 'function');
    fired();
    assert.equal(fsm.getState().behavior, 'idle');
    assert.equal(fsm.getState().clip, 'idle');
    fsm.dispose();
  });

  it('clip.maxDurationMs 覆盖全局 loop 区间', () => {
    /** @type {number[]} */
    const timeouts = [];
    const fsm = new BehaviorFSM({
      behaviorMap: { idle: ['idle'], walk: ['walk'] },
      clips: {
        idle: { loop: true },
        walk: { loop: true, maxDurationMs: 333 },
      },
      loopMinMs: 1000,
      loopMaxMs: 2000,
      schedule: (cb, ms) => {
        timeouts.push(ms);
        return () => {};
      },
    });
    fsm.request('walk', 'auto');
    assert.deepEqual(timeouts, [333]);
    fsm.dispose();
  });

  it('sustained 行为（hungry/sleep/sick）不排程超时', () => {
    for (const behavior of ['hungry', 'sleep', 'sick']) {
      let armed = false;
      const fsm = new BehaviorFSM({
        behaviorMap: {
          idle: ['idle'],
          [behavior]: [behavior === 'sleep' ? 'rest' : behavior],
        },
        clips: {
          idle: { loop: true },
          hungry: { loop: true },
          rest: { loop: true },
          sick: { loop: true },
        },
        schedule: () => {
          armed = true;
          return () => {};
        },
      });
      assert.equal(fsm.request(behavior, 'auto:hunger'), true, behavior);
      assert.equal(armed, false, `${behavior} should not arm timeout`);
      fsm.dispose();
    }
  });

  it('idle 自身 loop 不排程超时', () => {
    let armed = false;
    const fsm = new BehaviorFSM({
      behaviorMap: { idle: ['idle'] },
      clips: { idle: { loop: true } },
      schedule: () => {
        armed = true;
        return () => {};
      },
    });
    assert.equal(armed, false);
    fsm.dispose();
  });

  it('状态被打断后超时回调失效', () => {
    /** @type {(() => void) | null} */
    let fired = null;
    let t = 0;
    const fsm = new BehaviorFSM({
      behaviorMap: { idle: ['idle'], walk: ['walk'], eat: ['eat'] },
      clips: {
        idle: { loop: true },
        walk: { loop: true },
        eat: { loop: false },
      },
      loopMinMs: 50,
      loopMaxMs: 50,
      now: () => ++t,
      schedule: (cb) => {
        fired = cb;
        return () => {
          fired = null;
        };
      },
    });
    fsm.request('walk', 'auto');
    const walkCb = fired;
    assert.equal(typeof walkCb, 'function');
    fsm.request('eat', 'user');
    walkCb();
    assert.equal(fsm.getState().behavior, 'eat');
    fsm.dispose();
  });
});

describe('占位折叠', () => {
  it('walk→idle loop 折叠为 idle，仍可被 auto 打断', () => {
    const fsm = new BehaviorFSM({
      behaviorMap: {
        idle: ['idle'],
        walk: ['idle'],
        eat: ['idle'],
      },
      clips: { idle: { loop: true } },
      schedule: () => () => {},
    });
    assert.equal(fsm.request('walk', 'auto'), true);
    assert.equal(fsm.getState().behavior, 'idle');
    assert.equal(fsm.getState().clip, 'idle');
    assert.equal(fsm.canInterrupt('auto'), true);
    fsm.dispose();
  });
});

describe('sameBehaviorPolicy', () => {
  it('ignore 策略拒绝同 behavior 同/低优先级重入', () => {
    const fsm = createFsm({
      sameBehaviorPolicy: 'ignore',
      behaviorMap: { idle: ['idle'], happy: ['headpat'] },
      clips: { idle: { loop: true }, headpat: { loop: false } },
    });
    assert.equal(fsm.request('happy', 'user'), true);
    assert.equal(fsm.request('happy', 'user:again'), false);
    assert.equal(fsm.request('happy', 'ai:x'), false);
    fsm.onClipEnded();
    fsm.dispose();
  });

  it('reenter 默认允许同 behavior 重入', () => {
    let n = 0;
    const fsm = createFsm({
      sameBehaviorPolicy: 'reenter',
      random: () => (n++ === 0 ? 0 : 0.99),
      behaviorMap: { idle: ['idle'], happy: ['headpat', 'spin'] },
      clips: {
        idle: { loop: true },
        headpat: { loop: false },
        spin: { loop: false },
      },
    });
    assert.equal(fsm.request('happy', 'user'), true);
    const first = fsm.getState().clip;
    assert.equal(fsm.request('happy', 'user:again'), true);
    // 至少成功重入（clip 可能相同或不同）
    assert.ok(['headpat', 'spin'].includes(fsm.getState().clip));
    assert.ok(first);
    fsm.dispose();
  });
});

describe('onChange 回调', () => {
  it('切换时触发 onChange 并带 previous/priority', () => {
    /** @type {object[]} */
    const changes = [];
    const fsm = createFsm({
      onChange(state, meta) {
        changes.push({ state, meta });
      },
    });
    fsm.request('walk', 'auto');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].state.behavior, 'walk');
    assert.equal(changes[0].meta.previous.behavior, 'idle');
    assert.equal(changes[0].meta.priority, 'auto');
    fsm.dispose();
  });
});
