/**
 * localStorage schema 迁移单测（vitals / muted）
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  VITALS_SCHEMA_VERSION,
  MUTED_SCHEMA_VERSION,
  migrateVitalsRecord,
  parseVitalsRaw,
  serializeVitals,
  parseMutedRaw,
  serializeMuted,
  vitalsStorageKey,
} = require('../shared/user-storage-migrate');

describe('vitalsStorageKey', () => {
  it('按 petId 分 key', () => {
    assert.equal(vitalsStorageKey('guga'), 'pet-vitals:guga');
    assert.equal(vitalsStorageKey('doro'), 'pet-vitals:doro');
  });
});

describe('migrateVitalsRecord', () => {
  const now = 1_700_000_000_000;

  it('v0 扁平无 version → 升到当前版', () => {
    const { record, migrated } = migrateVitalsRecord(
      { hunger: 50, mood: 40, updatedAt: now - 1000 },
      now,
    );
    assert.equal(migrated, true);
    assert.equal(record.version, VITALS_SCHEMA_VERSION);
    assert.equal(record.hunger, 50);
    assert.equal(record.mood, 40);
    assert.equal(record.updatedAt, now - 1000);
  });

  it('已是当前 version 不标记 migrated', () => {
    const { record, migrated } = migrateVitalsRecord(
      {
        version: VITALS_SCHEMA_VERSION,
        hunger: 10,
        mood: 20,
        updatedAt: now,
      },
      now,
    );
    assert.equal(migrated, false);
    assert.equal(record.hunger, 10);
    assert.equal(record.mood, 20);
  });

  it('非法输入回退默认', () => {
    const { record, migrated } = migrateVitalsRecord(null, now);
    assert.equal(migrated, true);
    assert.equal(record.version, VITALS_SCHEMA_VERSION);
    assert.equal(record.hunger, 80);
    assert.equal(record.mood, 70);
  });

  it('数值 clamp 到 0–100', () => {
    const { record } = migrateVitalsRecord(
      { hunger: 200, mood: -5, updatedAt: now },
      now,
    );
    assert.equal(record.hunger, 100);
    assert.equal(record.mood, 0);
  });
});

describe('parseVitalsRaw / serializeVitals', () => {
  it('空 raw 给默认且不迁移写标记为 false（首次）', () => {
    const { migrated } = parseVitalsRaw(null);
    assert.equal(migrated, false);
  });

  it('损坏 JSON 迁移为默认', () => {
    const { record, migrated } = parseVitalsRaw('{bad');
    assert.equal(migrated, true);
    assert.equal(record.version, VITALS_SCHEMA_VERSION);
  });

  it('serialize 始终带 version', () => {
    const s = serializeVitals({ hunger: 1, mood: 2, updatedAt: 3 });
    const o = JSON.parse(s);
    assert.equal(o.version, VITALS_SCHEMA_VERSION);
    assert.equal(o.hunger, 1);
    assert.equal(o.mood, 2);
    assert.equal(o.updatedAt, 3);
  });

  it('round-trip 不二次迁移', () => {
    const raw = serializeVitals({ hunger: 33, mood: 44, updatedAt: 55 });
    const { record, migrated } = parseVitalsRaw(raw);
    assert.equal(migrated, false);
    assert.equal(record.hunger, 33);
  });
});

describe('parseMutedRaw / serializeMuted', () => {
  it('旧 schema "1"/"0" 迁移', () => {
    const a = parseMutedRaw('1');
    assert.equal(a.migrated, true);
    assert.equal(a.record.muted, true);
    assert.equal(a.record.version, MUTED_SCHEMA_VERSION);

    const b = parseMutedRaw('0');
    assert.equal(b.migrated, true);
    assert.equal(b.record.muted, false);
  });

  it('新 schema JSON', () => {
    const raw = serializeMuted(true);
    const { record, migrated } = parseMutedRaw(raw);
    assert.equal(migrated, false);
    assert.equal(record.muted, true);
    assert.equal(record.version, MUTED_SCHEMA_VERSION);
  });

  it('空值默认非静音', () => {
    const { record, migrated } = parseMutedRaw(null);
    assert.equal(migrated, false);
    assert.equal(record.muted, false);
  });
});
