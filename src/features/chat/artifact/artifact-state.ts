import { createSignal } from 'solid-js';
import type { ArtifactLanguage } from '@/features/chat/chat-api';
import type { ConversationArtifact } from '@/features/conversations/session/conversation';
import { conversationId } from '@/features/conversations/session/conversation-meta';

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

const [artifactState, setArtifactState] = createSignal(createInitialArtifactState());

export const artifacts = () => artifactState().artifacts;
export const selectedArtifactId = () => artifactState().selectedArtifactId;
export const artifactPanelOpen = () => artifactState().artifactPanelOpen;
export const activeStreamingArtifactId = () => artifactState().activeStreamingArtifactId;
export const artifactView = () => artifactState().artifactView;

export const clearArtifacts = () => setArtifactState(createInitialArtifactState());

export const setArtifacts = (nextArtifacts: ConversationArtifact[]) => {
  setArtifactState({
    artifacts: nextArtifacts.map((artifact) => ({
      ...artifact,
      status: 'completed',
      errorMessage: null,
    })),
    selectedArtifactId: nextArtifacts[0]?.id ?? null,
    artifactPanelOpen: false,
    activeStreamingArtifactId: null,
    artifactView: nextArtifacts.length > 0 ? 'preview' : 'code',
  });
};

export const selectArtifact = (nextSelectedArtifactId: string | null) => {
  setArtifactState((state) => ({
    ...state,
    selectedArtifactId: nextSelectedArtifactId,
    artifactView:
      state.artifacts.find((artifact) => artifact.id === nextSelectedArtifactId)?.status ===
      'completed'
        ? 'preview'
        : 'code',
  }));
};

export const setArtifactPanelOpen = (open: boolean) =>
  setArtifactState((state) => ({ ...state, artifactPanelOpen: open }));

export const setArtifactView = (view: ArtifactView) =>
  setArtifactState((state) => ({ ...state, artifactView: view }));

export const startArtifact = (artifactId: string) => {
  setArtifactState((state) => {
    const now = new Date().toISOString();
    const existing = state.artifacts.find((artifact) => artifact.id === artifactId);
    const nextArtifact: ArtifactRecord = existing ?? {
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
    };

    return {
      ...state,
      artifacts: [
        { ...nextArtifact, status: 'streaming', errorMessage: null, updated_at: now },
        ...state.artifacts.filter((artifact) => artifact.id !== artifactId),
      ],
      selectedArtifactId: artifactId,
      activeStreamingArtifactId: artifactId,
      artifactView: 'code',
    };
  });
};

export const updateArtifactTitle = (artifactId: string, title: string) => {
  setArtifactState((state) => ({
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? { ...artifact, title, updated_at: new Date().toISOString() }
        : artifact,
    ),
  }));
};

export const updateArtifactLanguage = (artifactId: string, language: ArtifactLanguage) => {
  setArtifactState((state) => ({
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? { ...artifact, language, updated_at: new Date().toISOString() }
        : artifact,
    ),
  }));
};

export const appendArtifactCode = (artifactId: string, delta: string) => {
  setArtifactState((state) => ({
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? { ...artifact, code: artifact.code + delta, updated_at: new Date().toISOString() }
        : artifact,
    ),
    artifactPanelOpen: delta.length > 0 || state.artifactPanelOpen,
  }));
};

export const updateArtifactDeployment = (artifactId: string, url: string, deployedAt: string) => {
  setArtifactState((state) => ({
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? {
            ...artifact,
            deploy_url: url,
            deployed_at: deployedAt,
            updated_at: deployedAt,
          }
        : artifact,
    ),
  }));
};

export const completeArtifact = (artifactId: string) => {
  setArtifactState((state) => ({
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? {
            ...artifact,
            status: 'completed',
            errorMessage: null,
            updated_at: new Date().toISOString(),
          }
        : artifact,
    ),
    selectedArtifactId: artifactId,
    activeStreamingArtifactId:
      state.activeStreamingArtifactId === artifactId ? null : state.activeStreamingArtifactId,
    artifactView: 'preview',
  }));
};

export const failArtifact = (artifactId: string, message: string) => {
  setArtifactState((state) => ({
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? {
            ...artifact,
            status: 'failed',
            errorMessage: message,
            updated_at: new Date().toISOString(),
          }
        : artifact,
    ),
    selectedArtifactId: artifactId,
    activeStreamingArtifactId:
      state.activeStreamingArtifactId === artifactId ? null : state.activeStreamingArtifactId,
    artifactView: 'code',
  }));
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
