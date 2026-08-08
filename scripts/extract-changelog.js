#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本段落，供 GitHub Release body 使用。
 *
 * 用法：
 *   node scripts/extract-changelog.js <version> [changelogPath] [outPath]
 * 示例：
 *   node scripts/extract-changelog.js 0.1.0 CHANGELOG.md release-notes.md
 *
 * version 可带或不带前缀 v（v0.1.0 / 0.1.0 等价）。
 * 匹配标题形如：## [0.1.0] 或 ## [0.1.0] — 说明
 * 截取到下一个 ## 标题（含 --- 分隔线之前）为止。
 */

const fs = require('node:fs');
const path = require('node:path');

function usage(code = 1) {
  console.error(
    'Usage: node scripts/extract-changelog.js <version> [changelogPath] [outPath]',
  );
  process.exit(code);
}

function normalizeVersion(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.startsWith('v') || s.startsWith('V') ? s.slice(1) : s;
}

function extractSection(markdown, version) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  // ## [0.1.0] 或 ## [0.1.0] — xxx 或 ## [0.1.0] - xxx
  const startRe = new RegExp(
    `^##\\s*\\[${escapeRegExp(version)}\\](?:\\s*[—–-].*)?\\s*$`,
  );
  const anyH2 = /^##\s+/;

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (anyH2.test(lines[i])) {
      end = i;
      break;
    }
  }

  // 去掉段尾仅由 --- 与空行构成的分隔
  let bodyLines = lines.slice(start, end);
  while (bodyLines.length > 0) {
    const last = bodyLines[bodyLines.length - 1].trim();
    if (last === '' || last === '---') {
      bodyLines.pop();
      continue;
    }
    break;
  }

  return bodyLines.join('\n').trim() + '\n';
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const versionArg = process.argv[2];
  if (!versionArg || versionArg === '-h' || versionArg === '--help') {
    usage(versionArg ? 0 : 1);
  }

  const version = normalizeVersion(versionArg);
  if (!version) {
    console.error('error: empty version');
    usage(1);
  }

  const changelogPath = path.resolve(
    process.argv[3] || path.join(process.cwd(), 'CHANGELOG.md'),
  );
  const outPath = path.resolve(
    process.argv[4] || path.join(process.cwd(), 'release-notes.md'),
  );

  if (!fs.existsSync(changelogPath)) {
    console.error(`error: changelog not found: ${changelogPath}`);
    process.exit(1);
  }

  const md = fs.readFileSync(changelogPath, 'utf8');
  const section = extractSection(md, version);

  let body;
  if (section) {
    body = section;
  } else {
    console.warn(
      `warn: no ## [${version}] section in ${changelogPath}; writing fallback notes`,
    );
    body = [
      `## MoonPet v${version}`,
      '',
      `未在 CHANGELOG.md 中找到 \`## [${version}]\` 段落。`,
      '请查看 GitHub 自动生成的提交摘要与仓库 CHANGELOG。',
      '',
    ].join('\n');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  console.log(`wrote ${outPath} (${body.length} bytes) for version ${version}`);
}

main();
