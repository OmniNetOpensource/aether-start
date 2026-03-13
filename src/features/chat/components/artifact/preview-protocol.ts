import type { ArtifactLanguage } from "@/types/chat-api";

export const ARTIFACT_PREVIEW_MESSAGE_TYPE = "aether:artifact-preview:update";

export type ArtifactPreviewPayload = {
  type: typeof ARTIFACT_PREVIEW_MESSAGE_TYPE;
  artifactId: string;
  language: ArtifactLanguage;
  code: string;
};
