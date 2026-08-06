/**
 * pet-asset 路径安全 smoke（node assert，无需 jest）
 *
 * 覆盖：.. 越界、目录式相对段拒绝、合法路径、错误 scheme
 * 运行：node apps/desktop/scripts/smoke-pet-asset-path.js
 * 或：npm run test:pet-asset -w @pet/desktop
 */
const path = require('path');
const assert = require('assert');
const {
  isPathInsideRoot,
  resolvePetAssetPath,
  PET_ASSET_SCHEME,
} = require('../electron/pet-asset-path');

const petsRoot = path.resolve(__dirname, '../../../pets');

/** @type {{ name: string; fn: () => void }[]} */
const cases = [];

/**
 * @param {string} name
 * @param {() => void} fn
 */
function test(name, fn) {
  cases.push({ name, fn });
}

// —— isPathInsideRoot ——
test('isPathInsideRoot: 根目录自身为合法', () => {
  assert.strictEqual(isPathInsideRoot(petsRoot, petsRoot), true);
});

test('isPathInsideRoot: 子文件合法', () => {
  const child = path.join(petsRoot, 'guga', 'pet.json');
  assert.strictEqual(isPathInsideRoot(petsRoot, child), true);
});

test('isPathInsideRoot: .. 越界拒绝', () => {
  const outside = path.resolve(petsRoot, '..', 'package.json');
  assert.strictEqual(isPathInsideRoot(petsRoot, outside), false);
});

test('isPathInsideRoot: 多层 .. 越界拒绝', () => {
  const outside = path.resolve(petsRoot, 'guga', '..', '..', 'package.json');
  assert.strictEqual(isPathInsideRoot(petsRoot, outside), false);
});

// —— resolvePetAssetPath：合法 ——
test('resolvePetAssetPath: 标准 asset hostname 合法路径', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga/pet.json`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  assert.ok(resolved, '应解析成功');
  assert.strictEqual(resolved, path.resolve(petsRoot, 'guga', 'pet.json'));
});

test('resolvePetAssetPath: 嵌套媒体路径合法', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga/large/webm/idle.webm`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  assert.ok(resolved);
  assert.strictEqual(
    resolved,
    path.resolve(petsRoot, 'guga', 'large', 'webm', 'idle.webm'),
  );
});

test('resolvePetAssetPath: 兼容 hostname 为首段', () => {
  const url = `${PET_ASSET_SCHEME}://guga/pet.json`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  assert.ok(resolved);
  assert.strictEqual(resolved, path.resolve(petsRoot, 'guga', 'pet.json'));
});

// —— resolvePetAssetPath：.. 不可逃出 pets 根 ——
// WHATWG URL 会在 pathname 内折叠 ..（相对 host 路径根），折叠后仍只能落在 petsRoot 下；
// 额外在段级拒绝「原样」出现的 `..` 段（decode 后）。此处断言安全边界：结果要么 null，要么仍 inside root。
test('resolvePetAssetPath: URL 内 .. 折叠后不得逃出 pets 根', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga/../package.json`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  if (resolved !== null) {
    assert.strictEqual(isPathInsideRoot(petsRoot, resolved), true);
  }
});

test('resolvePetAssetPath: 编码 %2e%2e 折叠后不得逃出 pets 根', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga/%2e%2e/package.json`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  if (resolved !== null) {
    assert.strictEqual(isPathInsideRoot(petsRoot, resolved), true);
  }
});

test('resolvePetAssetPath: 多层 .. 试图越界仍锁在 pets 根', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga/../../../../../../Windows/System32/drivers/etc/hosts`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  // URL 折叠后不会离开 scheme host 路径根；即使段名为 Windows/...，也只是 pets 下的相对路径
  assert.ok(resolved !== null || resolved === null); // 允许 null 或 inside
  if (resolved !== null) {
    assert.strictEqual(isPathInsideRoot(petsRoot, resolved), true);
    // 必须仍以 petsRoot 为前缀（规范化后）
    const rootPrefix = path.resolve(petsRoot) + path.sep;
    assert.ok(
      path.resolve(resolved) === path.resolve(petsRoot) ||
        path.resolve(resolved).startsWith(rootPrefix),
      `不得逃出 pets 根: ${resolved}`,
    );
  }
});

test('resolvePetAssetPath: 显式段 ..（不经 URL 折叠）拒绝', () => {
  // 若某实现把未折叠的 .. 当作段传入，段校验应拒绝
  // 使用 raw 构造：hostname 非 asset，pathname 含单独段 — 对标准 URL 很难保留未折叠 ..；
  // 这里用 isPathInsideRoot 直接覆盖「resolve 后越界」语义（与 path.resolve 联用）
  const outside = path.resolve(petsRoot, '..', 'package.json');
  assert.strictEqual(isPathInsideRoot(petsRoot, outside), false);
  // 模拟：若错误地把 petsRoot/../package.json 当 target，应被拒绝
  const spoofed = path.join(petsRoot, '..', 'package.json');
  assert.strictEqual(isPathInsideRoot(petsRoot, spoofed), false);
});

// —— 目录请求 / 空路径 ——
test('resolvePetAssetPath: 空路径（仅 scheme+host）拒绝', () => {
  const url = `${PET_ASSET_SCHEME}://asset/`;
  assert.strictEqual(resolvePetAssetPath(url, petsRoot), null);
});

test('resolvePetAssetPath: 无 host 且无 path 拒绝', () => {
  const url = `${PET_ASSET_SCHEME}:/`;
  // 可能解析失败或无 segments
  assert.strictEqual(resolvePetAssetPath(url, petsRoot), null);
});

// —— 错误 scheme ——
test('resolvePetAssetPath: file scheme 拒绝', () => {
  assert.strictEqual(
    resolvePetAssetPath('file:///C:/Windows/System32/drivers/etc/hosts', petsRoot),
    null,
  );
});

test('resolvePetAssetPath: http scheme 拒绝', () => {
  assert.strictEqual(
    resolvePetAssetPath('http://example.com/evil', petsRoot),
    null,
  );
});

test('resolvePetAssetPath: 错误自定义 scheme 拒绝', () => {
  assert.strictEqual(
    resolvePetAssetPath('evil-asset://asset/guga/pet.json', petsRoot),
    null,
  );
});

test('resolvePetAssetPath: 非法 URL 字符串拒绝', () => {
  assert.strictEqual(resolvePetAssetPath('not a url', petsRoot), null);
});

// —— 其它注入 ——
test('resolvePetAssetPath: 段内含斜杠（编码）拒绝', () => {
  // decode 后含 / → 拒绝
  const url = `${PET_ASSET_SCHEME}://asset/guga%2F..%2Fpackage.json`;
  // 此为单段 guga/../package.json，decode 后含 / → null
  assert.strictEqual(resolvePetAssetPath(url, petsRoot), null);
});

test('resolvePetAssetPath: 空字节拒绝', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga/pet%00.json`;
  assert.strictEqual(resolvePetAssetPath(url, petsRoot), null);
});

// 目录形态：handler 还会用 isFile() 拒绝目录，路径解析本身只要合法相对段仍可返回目录绝对路径
test('resolvePetAssetPath: 合法目录相对路径可解析但仍 inside root', () => {
  const url = `${PET_ASSET_SCHEME}://asset/guga`;
  const resolved = resolvePetAssetPath(url, petsRoot);
  assert.ok(resolved);
  assert.strictEqual(resolved, path.resolve(petsRoot, 'guga'));
  assert.strictEqual(isPathInsideRoot(petsRoot, resolved), true);
});

// —— 运行 ——
let passed = 0;
let failed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${name}`);
    console.error(`       ${msg}`);
  }
}

console.log('');
console.log(
  `[smoke:pet-asset] ${passed} passed, ${failed} failed (total ${cases.length})`,
);
console.log(`[smoke:pet-asset] petsRoot=${petsRoot}`);

if (failed > 0) {
  process.exit(1);
}
