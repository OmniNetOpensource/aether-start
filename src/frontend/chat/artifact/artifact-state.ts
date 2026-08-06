import { createStore } from 'solid-js';
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

const [artifactState, setArtifactState] = createStore(createInitialArtifactState());

export const artifacts = () => artifactState.artifacts;
export const selectedArtifactId = () => artifactState.selectedArtifactId;
export const artifactPanelOpen = () => artifactState.artifactPanelOpen;
export const activeStreamingArtifactId = () => artifactState.activeStreamingArtifactId;
export const artifactView = () => artifactState.artifactView;

export const clearArtifacts = () => setArtifactState(() => createInitialArtifactState());

export const setArtifacts = (nextArtifacts: ConversationArtifact[]) => {
  setArtifactState(() => ({
    artifacts: nextArtifacts.map((artifact) => ({
      ...artifact,
      status: 'completed' as const,
      errorMessage: null,
    })),
    selectedArtifactId: nextArtifacts[0]?.id ?? null,
    artifactPanelOpen: false,
    activeStreamingArtifactId: null,
    artifactView: nextArtifacts.length > 0 ? ('preview' as const) : ('code' as const),
  }));
};

export const selectArtifact = (nextSelectedArtifactId: string | null) => {
  setArtifactState((state) => {
    state.selectedArtifactId = nextSelectedArtifactId;
    state.artifactView =
      state.artifacts.find((artifact) => artifact.id === nextSelectedArtifactId)?.status ===
      'completed'
        ? 'preview'
        : 'code';
  });
};

export const setArtifactPanelOpen = (open: boolean) =>
  setArtifactState((state) => {
    state.artifactPanelOpen = open;
  });

export const setArtifactView = (view: ArtifactView) =>
  setArtifactState((state) => {
    state.artifactView = view;
  });

export const startArtifact = (artifactId: string) => {
  setArtifactState((state) => {
    const now = new Date().toISOString();
    const existingIndex = state.artifacts.findIndex((artifact) => artifact.id === artifactId);
    if (existingIndex === -1) {
      state.artifacts.unshift({
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
      });
    } else {
      const existing = state.artifacts[existingIndex];
      existing.status = 'streaming';
      existing.errorMessage = null;
      existing.updated_at = now;
      if (existingIndex > 0) {
        state.artifacts.splice(existingIndex, 1);
        state.artifacts.unshift(existing);
      }
    }
    state.selectedArtifactId = artifactId;
    state.activeStreamingArtifactId = artifactId;
    state.artifactView = 'code';
  });
};

const updateArtifact = (artifactId: string, apply: (artifact: ArtifactRecord) => void) => {
  setArtifactState((state) => {
    const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
    if (artifact) apply(artifact);
  });
};

export const updateArtifactTitle = (artifactId: string, title: string) => {
  updateArtifact(artifactId, (artifact) => {
    artifact.title = title;
    artifact.updated_at = new Date().toISOString();
  });
};

export const updateArtifactLanguage = (artifactId: string, language: ArtifactLanguage) => {
  updateArtifact(artifactId, (artifact) => {
    artifact.language = language;
    artifact.updated_at = new Date().toISOString();
  });
};

// 流式热路径:只写正在增长的 code 字段,不触碰其他 artifact 与面板状态
export const appendArtifactCode = (artifactId: string, delta: string) => {
  setArtifactState((state) => {
    const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
    if (artifact) {
      artifact.code += delta;
      artifact.updated_at = new Date().toISOString();
    }
    if (delta.length > 0) state.artifactPanelOpen = true;
  });
};

export const updateArtifactDeployment = (artifactId: string, url: string, deployedAt: string) => {
  updateArtifact(artifactId, (artifact) => {
    artifact.deploy_url = url;
    artifact.deployed_at = deployedAt;
    artifact.updated_at = deployedAt;
  });
};

export const completeArtifact = (artifactId: string) => {
  setArtifactState((state) => {
    const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
    if (artifact) {
      artifact.status = 'completed';
      artifact.errorMessage = null;
      artifact.updated_at = new Date().toISOString();
    }
    state.selectedArtifactId = artifactId;
    if (state.activeStreamingArtifactId === artifactId) state.activeStreamingArtifactId = null;
    state.artifactView = 'preview';
  });
};

export const failArtifact = (artifactId: string, message: string) => {
  setArtifactState((state) => {
    const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
    if (artifact) {
      artifact.status = 'failed';
      artifact.errorMessage = message;
      artifact.updated_at = new Date().toISOString();
    }
    state.selectedArtifactId = artifactId;
    if (state.activeStreamingArtifactId === artifactId) state.activeStreamingArtifactId = null;
    state.artifactView = 'code';
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
