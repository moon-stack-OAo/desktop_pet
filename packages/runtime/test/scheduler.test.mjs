/**
 * @pet/runtime createAutoScheduler 单测
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { BehaviorFSM, createAutoScheduler } from '../dist/index.js';

function createIdleFsm() {
  return new BehaviorFSM({
    behaviorMap: { idle: ['idle'], walk: ['walk'] },
    clips: { idle: { loop: true }, walk: { loop: true } },
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
    const original = setTimeout;
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
      // 确保恢复
      if (global.setTimeout !== original) {
        /* restored by mock.restoreAll in node:test */
      }
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
});
