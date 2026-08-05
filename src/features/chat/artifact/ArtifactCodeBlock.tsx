import { HighlightedCode } from '@/shared/design-system/HighlightedCode';

export function ArtifactCodeBlock({ code, isCompleted }: { code: string; isCompleted: boolean }) {
  return <HighlightedCode code={code} isCompleted={isCompleted} language='html' />;
}
