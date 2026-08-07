import type {PetConfig, RawPetConfig, ValidationIssue, ValidationResult,} from './types.js';
import {normalizePet} from './normalize.js';

function issue(
  path: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
  code?: string,
): ValidationIssue {
  return { path, message, severity, code };
}

/** 相对路径：非空字符串，且不含绝对盘符/根路径形态 */
function isRelativePath(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const t = value.trim();
  if (!t) {
    return false;
  }
  // Windows 绝对路径 C:\ 或 UNC \\
  if (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\')) {
    return false;
  }
  // POSIX 绝对路径
  if (t.startsWith('/')) {
    return false;
  }
  // file: URL
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) {
    return false;
  }
  return true;
}

function validateRelativePathField(
  issues: ValidationIssue[],
  path: string,
  value: string | undefined,
  required: boolean,
): void {
  if (value === undefined || value === '') {
    if (required) {
      issues.push(issue(path, '路径字段必填且不能为空', 'error', 'PATH_REQUIRED'));
    }
    return;
  }
  if (!isRelativePath(value)) {
    issues.push(
      issue(path, `必须是相对路径字符串，当前值: ${JSON.stringify(value)}`, 'error', 'PATH_NOT_RELATIVE'),
    );
  }
}

/**
 * 校验规范化后的 PetConfig
 */
export function validatePet(config: PetConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!config.id || !config.id.trim()) {
    issues.push(issue('id', 'id 必填且不能为空', 'error', 'ID_REQUIRED'));
  }

  if (!config.displayName || !config.displayName.trim()) {
    issues.push(issue('displayName', 'displayName 不能为空', 'error', 'DISPLAY_NAME_REQUIRED'));
  }

  if (config.renderer !== 'video' && config.renderer !== 'spritesheet') {
    issues.push(
      issue('renderer', `renderer 必须是 video 或 spritesheet，当前: ${String(config.renderer)}`, 'error', 'RENDERER_INVALID'),
    );
  }

  if (
    !config.size ||
    typeof config.size.width !== 'number' ||
    typeof config.size.height !== 'number' ||
    config.size.width <= 0 ||
    config.size.height <= 0
  ) {
    issues.push(issue('size', 'size.width / size.height 必须为正数', 'error', 'SIZE_INVALID'));
  }

  if (config.renderer === 'video') {
    if (!config.video) {
      issues.push(issue('video', 'video 型宠物必须包含 video 配置', 'error', 'VIDEO_REQUIRED'));
    } else {
      validateRelativePathField(issues, 'video.dir', config.video.dir, true);

      const clips = config.video.clips;
      if (!clips || typeof clips !== 'object' || Object.keys(clips).length === 0) {
        issues.push(
          issue('video.clips', 'video 型必须有 video.clips，且至少包含一个 clip', 'error', 'CLIPS_REQUIRED'),
        );
      } else {
        if (!clips.idle) {
          issues.push(
            issue(
              'video.clips.idle',
              '建议提供 idle clip；当前缺少 idle（已有其他 clip 时仅警告）',
              'warning',
              'IDLE_MISSING',
            ),
          );
        }
        for (const [name, clip] of Object.entries(clips)) {
          if (!clip || typeof clip.file !== 'string' || !clip.file.trim()) {
            issues.push(
              issue(`video.clips.${name}.file`, 'clip.file 必填', 'error', 'CLIP_FILE_REQUIRED'),
            );
          } else {
            validateRelativePathField(issues, `video.clips.${name}.file`, clip.file, true);
          }
        }
      }

      if (config.video.behaviorMap) {
        for (const [behavior, list] of Object.entries(config.video.behaviorMap)) {
          if (!Array.isArray(list) || list.length === 0) {
            issues.push(
              issue(
                `video.behaviorMap.${behavior}`,
                'behaviorMap 的值应为非空候选数组（string 或 {clip,weight}）',
                'warning',
                'BEHAVIOR_EMPTY',
              ),
            );
          }
        }
      }
    }
  }

  if (config.renderer === 'spritesheet') {
    const path = config.spritesheet?.path;
    if (!path || !path.trim()) {
      issues.push(
        issue(
          'spritesheet.path',
          'spritesheet 型必须有 spritesheet.path 或原始 spritesheetPath',
          'error',
          'SPRITESHEET_PATH_REQUIRED',
        ),
      );
    } else {
      validateRelativePathField(issues, 'spritesheet.path', path, true);
    }
  }

  if (config.audio) {
    if (config.audio.mapFile !== undefined) {
      validateRelativePathField(issues, 'audio.mapFile', config.audio.mapFile, false);
    }
    if (config.audio.dir !== undefined) {
      validateRelativePathField(issues, 'audio.dir', config.audio.dir, false);
    }
  }

  if (config.ai?.personaFile !== undefined) {
    validateRelativePathField(issues, 'ai.personaFile', config.ai.personaFile, false);
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return { ok: !hasError, issues };
}

/**
 * 对原始 JSON 先 normalize 再 validate
 */
export function validateRawPet(raw: RawPetConfig, fallbackId?: string): ValidationResult & { config: PetConfig } {
  const config = normalizePet(raw, fallbackId);
  const result = validatePet(config);
  return { ...result, config };
}

/**
 * 校验 manifest
 */
export function validateManifest(data: unknown): ValidationResult & { pets: string[] } {
  const issues: ValidationIssue[] = [];
  let pets: string[] = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    issues.push(issue('', 'manifest 必须是对象', 'error', 'MANIFEST_TYPE'));
    return { ok: false, issues, pets };
  }

  const rec = data as Record<string, unknown>;
  if (!Array.isArray(rec.pets)) {
    issues.push(issue('pets', 'manifest.pets 必须是字符串数组', 'error', 'MANIFEST_PETS'));
  } else {
    pets = rec.pets.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    if (pets.length === 0) {
      issues.push(issue('pets', 'manifest.pets 不能为空', 'error', 'MANIFEST_EMPTY'));
    }
    for (let i = 0; i < rec.pets.length; i++) {
      const item = rec.pets[i];
      if (typeof item !== 'string' || !item.trim()) {
        issues.push(issue(`pets[${i}]`, '宠物 id 必须是非空字符串', 'error', 'MANIFEST_ID'));
      }
    }
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return { ok: !hasError, issues, pets };
}
