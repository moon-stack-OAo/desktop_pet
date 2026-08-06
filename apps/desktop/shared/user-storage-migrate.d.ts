/** 当前 vitals schema 版本 */
export const VITALS_SCHEMA_VERSION: number;
/** 当前 muted schema 版本 */
export const MUTED_SCHEMA_VERSION: number;
export const DEFAULT_HUNGER: number;
export const DEFAULT_MOOD: number;
export const MUTED_STORAGE_KEY: string;

export interface VitalsRecord {
  version: number;
  hunger: number;
  mood: number;
  updatedAt: number;
}

export interface MutedRecord {
  version: number;
  muted: boolean;
}

export function vitalsStorageKey(petId: string): string;
export function defaultVitalsRecord(now?: number): VitalsRecord;
export function migrateVitalsRecord(
  parsed: unknown,
  now?: number,
): { record: VitalsRecord; migrated: boolean };
export function parseVitalsRaw(
  raw: string | null,
  now?: number,
): { record: VitalsRecord; migrated: boolean };
export function serializeVitals(
  stats: Omit<VitalsRecord, 'version'> | VitalsRecord,
): string;
export function parseMutedRaw(raw: string | null | undefined): {
  record: MutedRecord;
  migrated: boolean;
};
export function serializeMuted(muted: boolean): string;
export function clamp(n: number, min?: number, max?: number): number;
