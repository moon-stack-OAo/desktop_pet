export type {
  AiConfig,
  AudioConfig,
  BehaviorMap,
  BehaviorClipRef,
  LoadAllPetsResult,
  LoadedPet,
  Manifest,
  PetColors,
  PetConfig,
  PetKind,
  RawPetConfig,
  RendererType,
  Size,
  SpritesheetAnimation,
  SpritesheetConfig,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
  VideoClip,
  VideoConfig,
} from './types.js';

export { normalizePet } from './normalize.js';
export { validatePet, validateRawPet, validateManifest } from './validate.js';
export { loadManifest, loadPet, loadAllPets } from './load.js';
