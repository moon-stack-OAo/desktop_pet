/**
 * 系统负载采样（CPU / 内存），供桌宠「加班 work」等自动行为。
 * CPU 用两次 os.cpus() 差分；首次调用 cpu 可能为 0（尚无基线）。
 */

'use strict';

const os = require('os');

/**
 * @returns {{ idle: number; total: number }}
 */
function readCpuSnapshot() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times || {};
    idle += Number(t.idle) || 0;
    total +=
      (Number(t.user) || 0) +
      (Number(t.nice) || 0) +
      (Number(t.sys) || 0) +
      (Number(t.idle) || 0) +
      (Number(t.irq) || 0);
  }
  return { idle, total };
}

/** @type {{ idle: number; total: number } | null} */
let lastCpu = null;

/**
 * @returns {{ cpu: number; memory: number; ready: boolean }}
 * cpu / memory 为 0–100 百分比；ready=false 表示 CPU 尚无差分基线
 */
function getSystemLoad() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memory =
    totalMem > 0
      ? Math.min(100, Math.max(0, (1 - freeMem / totalMem) * 100))
      : 0;

  const snap = readCpuSnapshot();
  let cpu = 0;
  let ready = false;
  if (lastCpu && snap.total > lastCpu.total) {
    const dIdle = snap.idle - lastCpu.idle;
    const dTotal = snap.total - lastCpu.total;
    if (dTotal > 0) {
      cpu = Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100));
      ready = true;
    }
  }
  lastCpu = snap;

  return {
    cpu: Math.round(cpu * 10) / 10,
    memory: Math.round(memory * 10) / 10,
    ready,
  };
}

/**
 * 预热 CPU 基线（可选，在 app ready 后调用一次）
 */
function warmSystemLoad() {
  lastCpu = readCpuSnapshot();
}

module.exports = {
  getSystemLoad,
  warmSystemLoad,
};
