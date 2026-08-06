import { HighlightedCode } from '@/frontend/design-system/HighlightedCode';

export function ArtifactCodeBlock(props: { code: string; isCompleted: boolean }) {
  return <HighlightedCode code={props.code} isCompleted={props.isCompleted} language='html' />;
}
