/**
 * ai-settings 单测（node:test；注入 deps，不依赖 Electron 运行时）
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  maskApiKey,
  loadAiSettings,
  saveAiSettings,
  resolveAiCredentials,
  setAiSettingsDepsForTest,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
} = require('./ai-settings.js');

/** @returns {{ dir: string; file: string; encryptCalls: number; decryptCalls: number }} */
function makeTempDeps(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-ai-settings-'));
  const file = path.join(dir, 'ai-settings.json');
  const encryptionAvailable = opts.encryptionAvailable !== false;
  let encryptCalls = 0;
  let decryptCalls = 0;
  const warns = [];

  const safeStorage = {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (s) => {
      encryptCalls += 1;
      return Buffer.from(`ENC:${s}`, 'utf8');
    },
    decryptString: (buf) => {
      decryptCalls += 1;
      const t = Buffer.from(buf).toString('utf8');
      if (!t.startsWith('ENC:')) throw new Error('bad cipher');
      return t.slice(4);
    },
  };

  setAiSettingsDepsForTest({
    getPath: () => file,
    safeStorage,
    warn: (...a) => {
      warns.push(a.map(String).join(' '));
    },
  });

  return {
    dir,
    file,
    get encryptCalls() {
      return encryptCalls;
    },
    get decryptCalls() {
      return decryptCalls;
    },
    warns,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

describe('maskApiKey', () => {
  it('空与短 key', () => {
    assert.equal(maskApiKey(''), '');
    assert.equal(maskApiKey('short'), '***');
  });

  it('长 key 保留头尾', () => {
    assert.equal(maskApiKey('sk-abcdefghij'), 'sk-***ghij');
  });
});

describe('save / load / resolve（加密可用）', () => {
  /** @type {ReturnType<typeof makeTempDeps>} */
  let tmp;
  /** @type {Record<string, string | undefined>} */
  let envSnap;

  beforeEach(() => {
    envSnap = {
      PET_AI_API_KEY: process.env.PET_AI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      PET_AI_BASE_URL: process.env.PET_AI_BASE_URL,
      PET_AI_MODEL: process.env.PET_AI_MODEL,
    };
    delete process.env.PET_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.PET_AI_BASE_URL;
    delete process.env.PET_AI_MODEL;
    tmp = makeTempDeps({ encryptionAvailable: true });
  });

  afterEach(() => {
    setAiSettingsDepsForTest(null);
    tmp.cleanup();
    for (const [k, v] of Object.entries(envSnap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('加密保存 key，load 仅 hasKey/hint，resolve 可还原', () => {
    const r = saveAiSettings({
      apiKey: 'sk-test-secret-key-1234',
      baseUrl: 'https://api.example.com/v1',
      model: 'my-model',
    });
    assert.equal(r.ok, true);
    assert.ok(tmp.encryptCalls >= 1);

    const raw = JSON.parse(fs.readFileSync(tmp.file, 'utf8'));
    assert.ok(raw.apiKeyEnc);
    assert.equal(raw.apiKeyPlain, undefined);
    assert.ok(!JSON.stringify(raw).includes('sk-test-secret-key-1234'));

    const pub = loadAiSettings();
    assert.equal(pub.hasKey, true);
    assert.equal(pub.source, 'local');
    assert.equal(pub.baseUrl, 'https://api.example.com/v1');
    assert.equal(pub.model, 'my-model');
    assert.ok(pub.keyHint && !pub.keyHint.includes('secret-key'));
    assert.equal(pub.encryptionAvailable, true);

    const cred = resolveAiCredentials();
    assert.equal(cred.apiKey, 'sk-test-secret-key-1234');
    assert.equal(cred.baseUrl, 'https://api.example.com/v1');
    assert.equal(cred.model, 'my-model');
    assert.equal(cred.source, 'local');
  });

  it('clearKey 清除本地 key', () => {
    saveAiSettings({ apiKey: 'sk-abc-clear-me-xx' });
    assert.equal(loadAiSettings().hasKey, true);
    const r = saveAiSettings({ clearKey: true });
    assert.equal(r.ok, true);
    assert.equal(loadAiSettings().hasKey, false);
    assert.equal(resolveAiCredentials().apiKey, '');
    assert.equal(resolveAiCredentials().source, 'none');
  });

  it('环境变量优先于本地', () => {
    saveAiSettings({
      apiKey: 'sk-local-aaaaaaaa',
      baseUrl: 'https://local.example/v1',
      model: 'local-model',
    });
    process.env.PET_AI_API_KEY = 'sk-env-bbbbbbbb';
    process.env.PET_AI_BASE_URL = 'https://env.example/v1';
    process.env.PET_AI_MODEL = 'env-model';

    const pub = loadAiSettings();
    assert.equal(pub.source, 'env');
    assert.equal(pub.hasKey, true);
    assert.ok(pub.keyHint);
    assert.ok(!pub.keyHint.includes('bbbbbbbb'));

    const cred = resolveAiCredentials();
    assert.equal(cred.apiKey, 'sk-env-bbbbbbbb');
    assert.equal(cred.baseUrl, 'https://env.example/v1');
    assert.equal(cred.model, 'env-model');
    assert.equal(cred.source, 'env');
  });

  it('无配置时默认 baseUrl/model，source none', () => {
    const pub = loadAiSettings();
    assert.equal(pub.hasKey, false);
    assert.equal(pub.source, 'none');
    assert.equal(pub.baseUrl, DEFAULT_BASE_URL);
    assert.equal(pub.model, DEFAULT_MODEL);
    const cred = resolveAiCredentials();
    assert.equal(cred.apiKey, '');
    assert.equal(cred.source, 'none');
  });

  it('仅更新 baseUrl/model 不改 key', () => {
    saveAiSettings({ apiKey: 'sk-keep-this-key-zz' });
    saveAiSettings({ baseUrl: 'https://new.example/v1', model: 'm2' });
    const cred = resolveAiCredentials();
    assert.equal(cred.apiKey, 'sk-keep-this-key-zz');
    assert.equal(cred.baseUrl, 'https://new.example/v1');
    assert.equal(cred.model, 'm2');
  });
});

describe('无加密时明文回退', () => {
  /** @type {ReturnType<typeof makeTempDeps>} */
  let tmp;
  /** @type {Record<string, string | undefined>} */
  let envSnap;

  beforeEach(() => {
    envSnap = {
      PET_AI_API_KEY: process.env.PET_AI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    delete process.env.PET_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    tmp = makeTempDeps({ encryptionAvailable: false });
  });

  afterEach(() => {
    setAiSettingsDepsForTest(null);
    tmp.cleanup();
    for (const [k, v] of Object.entries(envSnap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('写入 apiKeyPlain 并 warn 一次', () => {
    const r = saveAiSettings({ apiKey: 'sk-plain-key-9999' });
    assert.equal(r.ok, true);
    const raw = JSON.parse(fs.readFileSync(tmp.file, 'utf8'));
    assert.equal(raw.apiKeyPlain, 'sk-plain-key-9999');
    assert.equal(raw.apiKeyEnc, undefined);
    assert.ok(tmp.warns.some((w) => /无安全加密|safeStorage/i.test(w)));
    assert.equal(resolveAiCredentials().apiKey, 'sk-plain-key-9999');
    assert.equal(loadAiSettings().encryptionAvailable, false);
  });
});
