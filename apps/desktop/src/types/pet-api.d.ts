/**
 * 渲染层全局类型：从 shared 同源 re-export，避免与主进程漂移
 * @see ../../shared/pet-payload.d.ts
 * @see ../../shared/ipc-channels.d.ts
 */

export {};

declare global {
  type PetRenderer = import('../../shared/pet-payload').PetRenderer;
  type CatalogRenderer = import('../../shared/pet-payload').CatalogRenderer;
  type PetClipInfo = import('../../shared/pet-payload').PetClipInfo;
  type PetIdleClip = import('../../shared/pet-payload').PetIdleClip;
  type PetSpritesheetAnim = import('../../shared/pet-payload').PetSpritesheetAnim;
  type PetSpritesheetPayload =
    import('../../shared/pet-payload').PetSpritesheetPayload;
  type PetAudioPayload = import('../../shared/pet-payload').PetAudioPayload;
  type PetAiPayload = import('../../shared/pet-payload').PetAiPayload;
  type PetLoadMeta = import('../../shared/pet-payload').PetLoadMeta;
  type PetPayload = import('../../shared/pet-payload').PetPayload;
  type PetCatalogItem = import('../../shared/pet-payload').PetCatalogItem;
  type PetCatalog = import('../../shared/pet-payload').PetCatalog;
  type PetSwitchResult = import('../../shared/pet-payload').PetSwitchResult;
  type PetChatContext = import('../../shared/pet-payload').PetChatContext;
  type PetChatResult = import('../../shared/pet-payload').PetChatResult;
  type UpdatePrefsSnapshot =
    import('../../shared/pet-payload').UpdatePrefsSnapshot;
  type PendingUpdateInfo = import('../../shared/pet-payload').PendingUpdateInfo;
  type UpdateState = import('../../shared/pet-payload').UpdateState;
  type UpdateStatusPhase = import('../../shared/pet-payload').UpdateStatusPhase;
  type UpdateStatusPayload =
    import('../../shared/pet-payload').UpdateStatusPayload;
  type OkResult = import('../../shared/pet-payload').OkResult;
  type AiCredentialSource =
    import('../../shared/pet-payload').AiCredentialSource;
  type AiSettingsPublic = import('../../shared/pet-payload').AiSettingsPublic;
  type AiSettingsSaveInput =
    import('../../shared/pet-payload').AiSettingsSaveInput;
  type PetAPI = import('../../shared/pet-payload').PetAPI;

  interface Window {
    petAPI?: PetAPI;
  }
}
