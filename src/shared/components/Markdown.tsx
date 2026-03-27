import MarkdownImpl from './MarkdownImpl';

type Props = {
  content: string;
  isAnimating?: boolean;
};

function Markdown({ content, isAnimating = false }: Props) {
  return <MarkdownImpl content={content} isAnimating={isAnimating} />;
}

export default Markdown;
