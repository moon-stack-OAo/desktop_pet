'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getSystemLoad, warmSystemLoad } = require('./system-metrics');

describe('system-metrics', () => {
  it('warm + 两次采样后 ready 且百分比在 0–100', () => {
    warmSystemLoad();
    const a = getSystemLoad();
    assert.equal(typeof a.cpu, 'number');
    assert.equal(typeof a.memory, 'number');
    assert.ok(a.memory >= 0 && a.memory <= 100);
    // 忙等一小段再采，确保有差分
    const end = Date.now() + 30;
    while (Date.now() < end) {
      /* spin */
    }
    const b = getSystemLoad();
    assert.ok(b.ready === true);
    assert.ok(b.cpu >= 0 && b.cpu <= 100);
    assert.ok(b.memory >= 0 && b.memory <= 100);
  });
});
