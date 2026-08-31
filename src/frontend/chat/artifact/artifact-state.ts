import { useSyncExternalStore } from 'react';
import type { ArtifactLanguage } from '@/shared/chat/chat-api';
import type { ConversationArtifact } from '@/shared/conversations/conversation';
import { conversationId } from '@/frontend/conversations/session/conversation-meta';

export type ArtifactStatus = 'streaming' | 'completed' | 'failed';
export type ArtifactView = 'code' | 'preview';

export type ArtifactRecord = ConversationArtifact & {
  status: ArtifactStatus;
  errorMessage: string | null;
};

type ArtifactState = {
  artifacts: ArtifactRecord[];
  selectedArtifactId: string | null;
  artifactPanelOpen: boolean;
  activeStreamingArtifactId: string | null;
  artifactView: ArtifactView;
};

const createInitialArtifactState = (): ArtifactState => ({
  artifacts: [],
  selectedArtifactId: null,
  artifactPanelOpen: false,
  activeStreamingArtifactId: null,
  artifactView: 'code',
});

let artifactState = createInitialArtifactState();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const replaceArtifactState = (next: ArtifactState) => {
  if (next === artifactState) return;
  artifactState = next;
  for (const listener of listeners) listener();
};

export const artifacts = () => artifactState.artifacts;
export const selectedArtifactId = () => artifactState.selectedArtifactId;
export const artifactPanelOpen = () => artifactState.artifactPanelOpen;
export const activeStreamingArtifactId = () => artifactState.activeStreamingArtifactId;
export const artifactView = () => artifactState.artifactView;
export const selectedArtifact = () =>
  artifactState.artifacts.find((artifact) => artifact.id === artifactState.selectedArtifactId);

export const useArtifacts = () => useSyncExternalStore(subscribe, artifacts, artifacts);
export const useArtifact = (artifactId: string | null) =>
  useSyncExternalStore(
    subscribe,
    () => artifactState.artifacts.find((artifact) => artifact.id === artifactId),
    () => artifactState.artifacts.find((artifact) => artifact.id === artifactId),
  );
export const useSelectedArtifactId = () =>
  useSyncExternalStore(subscribe, selectedArtifactId, selectedArtifactId);
export const useSelectedArtifact = () =>
  useSyncExternalStore(subscribe, selectedArtifact, selectedArtifact);
export const useArtifactPanelOpen = () =>
  useSyncExternalStore(subscribe, artifactPanelOpen, artifactPanelOpen);
export const useActiveStreamingArtifactId = () =>
  useSyncExternalStore(subscribe, activeStreamingArtifactId, activeStreamingArtifactId);
export const useArtifactView = () => useSyncExternalStore(subscribe, artifactView, artifactView);

export const clearArtifacts = () => replaceArtifactState(createInitialArtifactState());

export const setArtifacts = (nextArtifacts: ConversationArtifact[]) => {
  replaceArtifactState({
    artifacts: nextArtifacts.map(
      (artifact): ArtifactRecord => ({
        ...artifact,
        status: 'completed',
        errorMessage: null,
      }),
    ),
    selectedArtifactId: nextArtifacts[0]?.id ?? null,
    artifactPanelOpen: false,
    activeStreamingArtifactId: null,
    artifactView: nextArtifacts.length > 0 ? 'preview' : 'code',
  });
};

export const selectArtifact = (nextSelectedArtifactId: string | null) => {
  const nextView =
    artifactState.artifacts.find((artifact) => artifact.id === nextSelectedArtifactId)?.status ===
    'completed'
      ? 'preview'
      : 'code';
  if (
    artifactState.selectedArtifactId === nextSelectedArtifactId &&
    artifactState.artifactView === nextView
  ) {
    return;
  }

  replaceArtifactState({
    ...artifactState,
    selectedArtifactId: nextSelectedArtifactId,
    artifactView: nextView,
  });
};

export const setArtifactPanelOpen = (open: boolean) => {
  if (artifactState.artifactPanelOpen === open) return;
  replaceArtifactState({ ...artifactState, artifactPanelOpen: open });
};

export const setArtifactView = (view: ArtifactView) => {
  if (artifactState.artifactView === view) return;
  replaceArtifactState({ ...artifactState, artifactView: view });
};

export const startArtifact = (artifactId: string) => {
  const now = new Date().toISOString();
  const existingIndex = artifactState.artifacts.findIndex((artifact) => artifact.id === artifactId);
  let nextArtifacts: ArtifactRecord[];

  if (existingIndex === -1) {
    nextArtifacts = [
      {
        id: artifactId,
        conversation_id: conversationId() ?? '',
        title: 'Untitled Artifact',
        language: 'html',
        code: '',
        deploy_url: null,
        deployed_at: null,
        created_at: now,
        updated_at: now,
        status: 'streaming',
        errorMessage: null,
      },
      ...artifactState.artifacts,
    ];
  } else {
    const existing = artifactState.artifacts[existingIndex];
    nextArtifacts = [
      {
        ...existing,
        status: 'streaming',
        errorMessage: null,
        updated_at: now,
      },
      ...artifactState.artifacts.filter((_, index) => index !== existingIndex),
    ];
  }

  replaceArtifactState({
    ...artifactState,
    artifacts: nextArtifacts,
    selectedArtifactId: artifactId,
    activeStreamingArtifactId: artifactId,
    artifactView: 'code',
  });
};

const updateArtifact = (
  artifactId: string,
  apply: (artifact: ArtifactRecord) => ArtifactRecord,
) => {
  const index = artifactState.artifacts.findIndex((artifact) => artifact.id === artifactId);
  if (index === -1) return;

  const nextArtifacts = [...artifactState.artifacts];
  nextArtifacts[index] = apply(nextArtifacts[index]);
  replaceArtifactState({ ...artifactState, artifacts: nextArtifacts });
};

export const updateArtifactTitle = (artifactId: string, title: string) => {
  updateArtifact(artifactId, (artifact) => ({
    ...artifact,
    title,
    updated_at: new Date().toISOString(),
  }));
};

export const updateArtifactLanguage = (artifactId: string, language: ArtifactLanguage) => {
  updateArtifact(artifactId, (artifact) => ({
    ...artifact,
    language,
    updated_at: new Date().toISOString(),
  }));
};

// 流式热路径:只写正在增长的 code 字段,不触碰其他 artifact 与面板状态
export const appendArtifactCode = (artifactId: string, delta: string) => {
  const index = artifactState.artifacts.findIndex((artifact) => artifact.id === artifactId);
  const nextArtifacts = [...artifactState.artifacts];

  if (index !== -1) {
    const artifact = nextArtifacts[index];
    nextArtifacts[index] = {
      ...artifact,
      code: artifact.code + delta,
      updated_at: new Date().toISOString(),
    };
  }

  const nextPanelOpen = delta.length > 0 || artifactState.artifactPanelOpen;
  if (index === -1 && nextPanelOpen === artifactState.artifactPanelOpen) return;

  replaceArtifactState({
    ...artifactState,
    artifacts: nextArtifacts,
    artifactPanelOpen: nextPanelOpen,
  });
};

export const updateArtifactDeployment = (artifactId: string, url: string, deployedAt: string) => {
  updateArtifact(artifactId, (artifact) => ({
    ...artifact,
    deploy_url: url,
    deployed_at: deployedAt,
    updated_at: deployedAt,
  }));
};

export const completeArtifact = (artifactId: string) => {
  const index = artifactState.artifacts.findIndex((artifact) => artifact.id === artifactId);
  const nextArtifacts = [...artifactState.artifacts];

  if (index !== -1) {
    nextArtifacts[index] = {
      ...nextArtifacts[index],
      status: 'completed',
      errorMessage: null,
      updated_at: new Date().toISOString(),
    };
  }

  replaceArtifactState({
    ...artifactState,
    artifacts: nextArtifacts,
    selectedArtifactId: artifactId,
    activeStreamingArtifactId:
      artifactState.activeStreamingArtifactId === artifactId
        ? null
        : artifactState.activeStreamingArtifactId,
    artifactView: 'preview',
  });
};

export const failArtifact = (artifactId: string, message: string) => {
  const index = artifactState.artifacts.findIndex((artifact) => artifact.id === artifactId);
  const nextArtifacts = [...artifactState.artifacts];

  if (index !== -1) {
    nextArtifacts[index] = {
      ...nextArtifacts[index],
      status: 'failed',
      errorMessage: message,
      updated_at: new Date().toISOString(),
    };
  }

  replaceArtifactState({
    ...artifactState,
    artifacts: nextArtifacts,
    selectedArtifactId: artifactId,
    activeStreamingArtifactId:
      artifactState.activeStreamingArtifactId === artifactId
        ? null
        : artifactState.activeStreamingArtifactId,
    artifactView: 'code',
  });
};

export const artifactActions = {
  appendCode: appendArtifactCode,
  clear: clearArtifacts,
  complete: completeArtifact,
  fail: failArtifact,
  select: selectArtifact,
  set: setArtifacts,
  setLanguage: updateArtifactLanguage,
  setPanelOpen: setArtifactPanelOpen,
  setTitle: updateArtifactTitle,
  setView: setArtifactView,
  start: startArtifact,
  updateDeployment: updateArtifactDeployment,
};

export type ArtifactActions = typeof artifactActions;
