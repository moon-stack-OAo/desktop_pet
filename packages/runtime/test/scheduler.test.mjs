/**
 * @pet/runtime createAutoScheduler 单测
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { BehaviorFSM, createAutoScheduler } from '../dist/index.js';

function createIdleFsm(extra = {}) {
  return new BehaviorFSM({
    behaviorMap: {
      idle: ['idle'],
      walk: ['walk'],
      happy: ['happy'],
      play: ['play'],
      ...extra.behaviorMap,
    },
    clips: {
      idle: { loop: true },
      walk: { loop: true },
      happy: { loop: false },
      play: { loop: true },
      ...extra.clips,
    },
    schedule: () => () => {},
    random: () => 0,
  });
}

describe('createAutoScheduler', () => {
  it('start/stop 切换 isRunning', () => {
    const fsm = createIdleFsm();
    const sch = createAutoScheduler(fsm, {
      minMs: 60_000,
      maxMs: 60_000,
      behaviors: ['walk'],
      random: () => 0,
    });
    assert.equal(sch.isRunning(), false);
    sch.start();
    assert.equal(sch.isRunning(), true);
    sch.start(); // 幂等
    assert.equal(sch.isRunning(), true);
    sch.stop();
    assert.equal(sch.isRunning(), false);
    fsm.dispose();
  });

  it('idle 时 tick 会 request 候选行为', async () => {
    const fsm = createIdleFsm();
    /** @type {Array<{ cb: () => void; ms: number }>} */
    const queue = [];
    mock.method(global, 'setTimeout', (cb, ms) => {
      queue.push({ cb: /** @type {() => void} */ (cb), ms: Number(ms) });
      return 1;
    });
    mock.method(global, 'clearTimeout', () => {});

    try {
      const sch = createAutoScheduler(fsm, {
        minMs: 10,
        maxMs: 10,
        behaviors: ['walk'],
        random: () => 0,
      });
      sch.start();
      assert.equal(queue.length, 1);
      assert.equal(queue[0].ms, 10);
      queue[0].cb();
      assert.equal(fsm.getState().behavior, 'walk');
      sch.stop();
    } finally {
      mock.restoreAll();
      fsm.dispose();
    }
  });

  it('非 idle 时 tick 不打断', async () => {
    const fsm = createIdleFsm();
    /** @type {Array<() => void>} */
    const queue = [];
    mock.method(global, 'setTimeout', (cb) => {
      queue.push(/** @type {() => void} */ (cb));
      return 1;
    });
    mock.method(global, 'clearTimeout', () => {});

    try {
      fsm.request('walk', 'user');
      const sch = createAutoScheduler(fsm, {
        minMs: 10,
        maxMs: 10,
        behaviors: ['walk'],
        random: () => 0,
      });
      sch.start();
      assert.equal(queue.length, 1);
      queue[0]();
      assert.equal(fsm.getState().behavior, 'walk');
      assert.equal(fsm.getPetState().priority, 'user');
      sch.stop();
    } finally {
      mock.restoreAll();
      fsm.dispose();
    }
  });

  it('默认候选含 walk/happy/play（不传 behaviors）', async () => {
    const fsm = createIdleFsm();
    /** @type {Array<() => void>} */
    const queue = [];
    mock.method(global, 'setTimeout', (cb) => {
      queue.push(/** @type {() => void} */ (cb));
      return 1;
    });
    mock.method(global, 'clearTimeout', () => {});

    try {
      // random=0 → 权重池第一个 ready 为 walk（最高权）
      const sch = createAutoScheduler(fsm, {
        minMs: 10,
        maxMs: 10,
        random: () => 0,
      });
      sch.start();
      queue[0]();
      assert.equal(fsm.getState().behavior, 'walk');
      sch.stop();
    } finally {
      mock.restoreAll();
      fsm.dispose();
    }
  });

  it('权重选取：random 偏大时选中更高索引候选', async () => {
    const fsm = createIdleFsm();
    /** @type {Array<() => void>} */
    const queue = [];
    mock.method(global, 'setTimeout', (cb) => {
      queue.push(/** @type {() => void} */ (cb));
      return 1;
    });
    mock.method(global, 'clearTimeout', () => {});

    try {
      // 等权 3 候选，random≈0.99 → 最后一个 play
      const sch = createAutoScheduler(fsm, {
        minMs: 10,
        maxMs: 10,
        behaviors: [
          { name: 'walk', weight: 1 },
          { name: 'happy', weight: 1 },
          { name: 'play', weight: 1 },
        ],
        random: () => 0.99,
      });
      sch.start();
      queue[0]();
      assert.equal(fsm.getState().behavior, 'play');
      sch.stop();
    } finally {
      mock.restoreAll();
      fsm.dispose();
    }
  });

  it('冷却：刚触发的行为不会立刻再被选', async () => {
    const fsm = createIdleFsm();
    /** @type {Array<() => void>} */
    const queue = [];
    mock.method(global, 'setTimeout', (cb) => {
      queue.push(/** @type {() => void} */ (cb));
      return 1;
    });
    mock.method(global, 'clearTimeout', () => {});

    let t = 1000;
    try {
      const sch = createAutoScheduler(fsm, {
        minMs: 10,
        maxMs: 10,
        behaviors: [
          { name: 'walk', weight: 100, cooldownMs: 60_000 },
          { name: 'happy', weight: 1, cooldownMs: 0 },
        ],
        random: () => 0,
        now: () => t,
      });
      sch.start();
      // 第一次：walk 权重极大 → walk
      queue[0]();
      assert.equal(fsm.getState().behavior, 'walk');

      // 回到 idle 后第二次 tick：walk 冷却中 → happy
      fsm.request('idle', 'user');
      t = 2000;
      const n = queue.length;
      queue[n - 1]();
      assert.equal(fsm.getState().behavior, 'happy');
      sch.stop();
    } finally {
      mock.restoreAll();
      fsm.dispose();
    }
  });

  it('兼容 minIntervalMs / maxIntervalMs 别名', async () => {
    const fsm = createIdleFsm();
    /** @type {number[]} */
    const delays = [];
    mock.method(global, 'setTimeout', (cb, ms) => {
      delays.push(Number(ms));
      return 1;
    });
    mock.method(global, 'clearTimeout', () => {});

    try {
      const sch = createAutoScheduler(fsm, {
        minIntervalMs: 42,
        maxIntervalMs: 42,
        behaviors: ['walk'],
        random: () => 0,
      });
      sch.start();
      assert.equal(delays[0], 42);
      sch.stop();
    } finally {
      mock.restoreAll();
      fsm.dispose();
    }
  });
});
