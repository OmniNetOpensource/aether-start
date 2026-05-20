import { useState } from 'react';
import { Search, Globe, Wrench } from 'lucide-react';
import Markdown from '@/shared/design-system/Markdown';
import {
  parseFetchClientPayload,
  type FetchClientPayload,
} from '@/features/chat/research/fetch-result-payload';
import {
  parseSearchClientPayload,
  SEARCH_TOOL_NAMES,
  type SearchClientResult,
} from '@/features/chat/research/search-result-payload';
import type { ResearchItem, Tool } from '@/features/chat/message-thread';
import type { StepStatus } from '@/shared/design-system/chain-of-thought';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/design-system/dialog';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
} from '@/shared/design-system/chain-of-thought';
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
      <div className='text-xs text-secondary [&_p]:m-0'>
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

const fetchDialogTitle = (url: string) => {
  if (!url) {
    return 'Fetch result';
  }
  try {
    return new URL(url).hostname;
  } catch {
    return url.length > 60 ? `${url.slice(0, 60)}…` : url;
  }
};

function FetchResultDialogBody({ payload }: { payload: FetchClientPayload }) {
  if (payload.type === 'image') {
    return (
      <img
        src={payload.data_url}
        alt={payload.url}
        className='max-h-[70vh] w-full object-contain'
      />
    );
  }

  if (payload.type === 'markdown' || payload.type === 'youtube') {
    return (
      <div className='max-h-[70vh] overflow-y-auto text-sm text-secondary'>
        <Markdown content={payload.content} />
        {payload.truncated && (
          <p className='mt-3 text-xs text-muted-foreground'>内容已截断</p>
        )}
      </div>
    );
  }

  return null;
}


function FetchStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === 'string' ? args.url : '';
  const stepStatus = getStepStatus(tool, isActive);
  const { result } = getToolLifecycle(tool);
  const resultText = result ? (typeof result.result === 'string' ? result.result : '') : '';
  const payload = resultText ? parseFetchClientPayload(resultText) : null;

  const isLegacyError =
    resultText.startsWith('Error') ||
    (resultText.startsWith('[系统提示:') &&
      (resultText.includes('内容过长') || resultText.includes('已省略不返回')));
  const isError = payload?.type === 'error' || Boolean(result && isLegacyError);

  const canOpen =
    stepStatus === 'complete' &&
    payload !== null &&
    payload.type !== 'error';

  const imageDataUrl = payload?.type === 'image' ? payload.data_url : null;

  const suffix = stepStatus === 'complete' ? (isError ? '...failed.' : '...done!') : '';
  const descriptionText = `Take a closer look${suffix}`;

  return (
    <ChainOfThoughtStep
      icon={<Globe className='h-full w-full' />}
      description={canOpen ? undefined : descriptionText}
      status={stepStatus}
      hideConnector={hideConnector}
    >
      {canOpen && payload && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button
              type='button'
              className='text-xs text-secondary leading-relaxed hover:text-foreground cursor-pointer text-left'
            >
              {descriptionText} · 查看
            </button>
          </DialogTrigger>
          <DialogContent className='w-[min(94vw,48rem)] gap-3 p-4 sm:max-w-3xl' showCloseButton>
            <DialogHeader>
              <DialogTitle>{fetchDialogTitle(url || payload.url)}</DialogTitle>
              {(url || payload.url) && (
                <DialogDescription asChild>
                  <a
                    href={url || payload.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='break-all text-left hover:text-primary-hover'
                  >
                    {url || payload.url}
                  </a>
                </DialogDescription>
              )}
            </DialogHeader>
            <FetchResultDialogBody payload={payload} />
          </DialogContent>
        </Dialog>
      )}
      {url && (
        <a
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          className='text-xs text-muted-foreground hover:text-primary-hover transition-colors break-all'
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
