/**
 * 释放指定 TCP 端口（Windows / Unix），供 desktop:dev 启动前清理残留 Vite
 * 用法: node scripts/free-port.js 5173
 *
 * Windows 上顺带 chcp 65001，减轻同控制台会话内中文日志乱码
 */
'use strict';

const { execSync } = require('child_process');

if (process.platform === 'win32' && process.env.PET_CONSOLE_UTF8 !== '0') {
  try {
    execSync('chcp 65001', { stdio: 'ignore', windowsHide: true });
  } catch {
    /* ignore */
  }
}

const port = Number(process.argv[2] || 5173);
if (!Number.isFinite(port) || port <= 0) {
  console.warn('[free-port] 无效端口:', process.argv[2]);
  process.exit(0);
}

function pidsOnPortWin(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function pidsOnPortUnix(p) {
  try {
    const out = execSync(`lsof -ti tcp:${p} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
  } catch {
    return [];
  }
}

const isWin = process.platform === 'win32';
const pids = isWin ? pidsOnPortWin(port) : pidsOnPortUnix(port);

if (!pids.length) {
  console.log(`[free-port] 端口 ${port} 空闲`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWin) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(Number(pid), 'SIGTERM');
    }
    console.log(`[free-port] 已结束占用 ${port} 的进程 PID=${pid}`);
  } catch (err) {
    console.warn(
      `[free-port] 无法结束 PID=${pid}（可能需管理员权限）:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

process.exit(0);
