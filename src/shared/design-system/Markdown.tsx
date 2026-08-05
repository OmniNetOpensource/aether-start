import MarkdownImpl from './MarkdownImpl';

type Props = {
  content: string;
  isAnimating?: boolean;
};

function Markdown({ content, isAnimating = false }: Props) {
  return (
    <div>
      <MarkdownImpl content={content} isAnimating={isAnimating} />
    </div>
  );
}

export default Markdown;
