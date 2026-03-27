import { Search, Globe, Wrench } from 'lucide-react';
import Markdown from '@/shared/components/Markdown';
import {
  parseSearchClientPayload,
  SEARCH_TOOL_NAMES,
  type SearchClientResult,
} from '@/features/chat/research/search-result-payload';
import type { ResearchItem, Tool } from '@/features/chat/types/message';
import type { StepStatus } from '@/shared/ui/chain-of-thought';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
} from '@/shared/ui/chain-of-thought';
import { getToolLifecycle, getSearchResultCount } from './research-utils';

type SearchResultBadge = SearchClientResult;

// Parse search results to badge data
function parseSearchResults(rawResult: string): SearchResultBadge[] {
  return parseSearchClientPayload(rawResult)?.results.slice(0, 10) ?? [];
}

// Get step status from tool lifecycle
function getStepStatus(tool: Tool, isActive: boolean): StepStatus {
  const { result } = getToolLifecycle(tool);
  if (!result) {
    return isActive ? 'active' : 'pending';
  }
  return 'complete';
}

// Get status text for a tool
function getStatusText(tool: Tool, isActive: boolean, toolName: string): string {
  const { result } = getToolLifecycle(tool);

  if (!result) {
    if (!isActive) return '等待中...';
    if (SEARCH_TOOL_NAMES.has(toolName)) return '搜索中...';
    if (toolName === 'fetch_url') return '获取中...';
    if (toolName === 'render') return '渲染中...';
    return '执行中...';
  }

  const resultText = typeof result.result === 'string' ? result.result : '';
  const isError =
    resultText.startsWith('Error') ||
    (resultText.startsWith('[系统提示:') &&
      (resultText.includes('内容过长') || resultText.includes('已省略不返回')));

  if (isError) {
    const errorSummary = resultText.startsWith('Error')
      ? resultText.replace(/^Error:\s*/, '').split('\n')[0]
      : '失败';
    return `失败 · ${errorSummary}`;
  }

  if (SEARCH_TOOL_NAMES.has(toolName)) {
    const count = getSearchResultCount(resultText);
    if (typeof count === 'number') {
      return `完成 · ${count} 个结果`;
    }
  }

  return '完成';
}

// Render a thinking step
function ThinkingStep({ text, hideConnector }: { text: string; hideConnector: boolean }) {
  return (
    <ChainOfThoughtStep
      icon={<div className='h-2 w-2 rounded-full bg-current' />}
      hideConnector={hideConnector}
    >
      <div className='text-xs text-(--text-secondary) [&_p]:m-0'>
        <Markdown content={text} />
      </div>
    </ChainOfThoughtStep>
  );
}

// Render a search tool step
function SearchStep({
  tool,
  isActive,
  hideConnector,
  stepKey,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
  stepKey: string;
}) {
  const args = tool.call.args as Record<string, unknown>;
  const query = typeof args.query === 'string' ? args.query : '';
  const description = query ? `Reading the web · ${query}` : 'Reading the web';

  const { result } = getToolLifecycle(tool);
  let searchResults: SearchResultBadge[] = [];
  if (result) {
    const resultText = typeof result.result === 'string' ? result.result : '';
    searchResults = parseSearchResults(resultText);
  }

  return (
    <ChainOfThoughtStep
      icon={<Search className='h-full w-full' />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    >
      {searchResults.length > 0 && (
        <ChainOfThoughtSearchResults>
          {searchResults.map((r, i) => (
            <ChainOfThoughtSearchResult key={`${stepKey}-result-${i}`} href={r.url} url={r.url}>
              {r.title}
            </ChainOfThoughtSearchResult>
          ))}
        </ChainOfThoughtSearchResults>
      )}
    </ChainOfThoughtStep>
  );
}

// Parse image result from fetch tool
function parseFetchImageResult(tool: Tool): string | null {
  const { result } = getToolLifecycle(tool);
  if (!result) return null;
  try {
    const parsed = JSON.parse(result.result);
    if (parsed.type === 'image' && typeof parsed.data_url === 'string') {
      return parsed.data_url;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

// Render a fetch tool step
function FetchStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
}) {
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === 'string' ? args.url : '';
  const stepStatus = getStepStatus(tool, isActive);
  const imageDataUrl = parseFetchImageResult(tool);

  const { result } = getToolLifecycle(tool);
  const resultText = result ? (typeof result.result === 'string' ? result.result : '') : '';
  const isError =
    result &&
    (resultText.startsWith('Error') ||
      (resultText.startsWith('[系统提示:') &&
        (resultText.includes('内容过长') || resultText.includes('已省略不返回'))));

  const suffix = stepStatus === 'complete' ? (isError ? '...failed.' : '...done!') : '';
  const description = `Take a closer look${suffix}`;

  return (
    <ChainOfThoughtStep
      icon={<Globe className='h-full w-full' />}
      description={description}
      status={stepStatus}
      hideConnector={hideConnector}
    >
      {url && (
        <a
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          className='text-xs text-muted-foreground hover:text-(--interactive-primary-hover) transition-colors break-all'
        >
          {url}
        </a>
      )}
      {imageDataUrl && <ChainOfThoughtImage src={imageDataUrl} alt={url} />}
    </ChainOfThoughtStep>
  );
}

function RenderStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
}) {
  const status = getStatusText(tool, isActive, 'render');
  const description = `render · ${status}`;

  return (
    <ChainOfThoughtStep
      icon={
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='h-full w-full'
          aria-hidden
        >
          <rect x='3' y='3' width='18' height='18' rx='2' />
          <path d='M3 9h18' />
          <path d='M7 13h10' />
          <path d='M7 17h6' />
        </svg>
      }
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    />
  );
}

// Render a generic tool step
function GenericToolStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
}) {
  const toolName = tool.call.tool;
  const status = getStatusText(tool, isActive, toolName);
  const description = `${toolName} · ${status}`;

  return (
    <ChainOfThoughtStep
      icon={<Wrench className='h-full w-full' />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    />
  );
}

type ResearchBlockProps = {
  items: ResearchItem[];
  blockIndex: number;
  messageIndex: number;
  isActive?: boolean;
};

export function ResearchBlock({
  items,
  blockIndex,
  messageIndex,
  isActive = false,
}: ResearchBlockProps) {
  return (
    <ChainOfThought>
      <ChainOfThoughtHeader>思考过程</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {items.map((item, index) => {
          const stepKey = `${messageIndex}-${blockIndex}-${index}`;
          const isLastStep = index === items.length - 1;

          if (item.kind === 'thinking') {
            return <ThinkingStep key={stepKey} text={item.text} hideConnector={isLastStep} />;
          }

          const tool = item.data;
          const toolName = tool.call.tool;
          const isLastItem = index === items.length - 1;
          const itemIsActive = isActive && isLastItem;

          if (SEARCH_TOOL_NAMES.has(toolName)) {
            return (
              <SearchStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
                stepKey={stepKey}
              />
            );
          }

          if (toolName === 'fetch_url') {
            return (
              <FetchStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          if (toolName === 'render') {
            return (
              <RenderStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          return (
            <GenericToolStep
              key={stepKey}
              tool={tool}
              isActive={itemIsActive}
              hideConnector={isLastStep}
            />
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
