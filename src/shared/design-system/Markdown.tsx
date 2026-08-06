import MarkdownImpl from './MarkdownImpl';

type Props = {
  content: string;
  isAnimating?: boolean;
};

function Markdown(props: Props) {
  return (
    <div>
      <MarkdownImpl content={props.content} isAnimating={props.isAnimating ?? false} />
    </div>
  );
}

export default Markdown;
