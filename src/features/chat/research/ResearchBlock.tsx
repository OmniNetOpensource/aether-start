import { createSignal, For } from 'solid-js';
import { Search, Globe, Wrench } from '@/shared/design-system/icons';
import { cn } from '@/shared/core/utils';
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
function ThinkingStep(props: { text: string; hideConnector: boolean }) {
  return (
    <ChainOfThoughtStep
      icon={<div class='h-2 w-2 rounded-full bg-current' />}
      hideConnector={props.hideConnector}
    >
      <div class='text-xs text-secondary [&_p]:m-0'>
        <Markdown content={props.text} />
      </div>
    </ChainOfThoughtStep>
  );
}

// Render a search tool step
function SearchStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const query = () =>
    typeof props.tool.call.args.query === 'string' ? props.tool.call.args.query : '';
  const description = () => (query() ? `Reading the web · ${query()}` : 'Reading the web');
  const searchResults = () => {
    const result = getToolLifecycle(props.tool).result;
    if (!result) return [];
    return parseSearchResults(typeof result.result === 'string' ? result.result : '');
  };

  return (
    <ChainOfThoughtStep
      icon={<Search class='h-full w-full' />}
      description={description()}
      status={getStepStatus(props.tool, props.isActive)}
      hideConnector={props.hideConnector}
    >
      {searchResults().length > 0 && (
        <ChainOfThoughtSearchResults>
          <For each={searchResults()}>
            {(r) => (
              <ChainOfThoughtSearchResult href={r.url} url={r.url}>
                {r.title}
              </ChainOfThoughtSearchResult>
            )}
          </For>
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

function FetchResultDialogBody(props: { payload: FetchClientPayload }) {
  if (props.payload.type === 'image') {
    return (
      <img
        src={props.payload.data_url}
        alt={props.payload.url}
        class='max-h-[70vh] w-full object-contain'
      />
    );
  }

  if (props.payload.type === 'markdown' || props.payload.type === 'youtube') {
    return (
      <div class='max-h-[70vh] overflow-y-auto text-sm text-secondary'>
        <Markdown content={props.payload.content} />
        {props.payload.truncated && <p class='mt-3 text-xs text-muted-foreground'>内容已截断</p>}
      </div>
    );
  }

  return null;
}

function FetchStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const url = () => (typeof props.tool.call.args.url === 'string' ? props.tool.call.args.url : '');
  const stepStatus = () => getStepStatus(props.tool, props.isActive);
  const result = () => getToolLifecycle(props.tool).result;
  const resultText = () => {
    const value = result();
    return value && typeof value.result === 'string' ? value.result : '';
  };
  const payload = () => (resultText() ? parseFetchClientPayload(resultText()) : null);
  const isError = () => {
    const text = resultText();
    const isLegacyError =
      text.startsWith('Error') ||
      (text.startsWith('[系统提示:') &&
        (text.includes('内容过长') || text.includes('已省略不返回')));
    return payload()?.type === 'error' || Boolean(result() && isLegacyError);
  };
  const canOpen = () =>
    stepStatus() === 'complete' && payload()?.type !== 'error' && payload() !== null;
  const descriptionText = () =>
    `Take a closer look${stepStatus() === 'complete' ? (isError() ? '...failed.' : '...done!') : ''}`;
  const renderImage = () => {
    const value = payload();
    if (value?.type !== 'image') return null;
    return <ChainOfThoughtImage src={value.data_url} alt={url()} />;
  };
  const renderDialog = () => {
    const value = payload();
    if (!canOpen() || !value) return null;

    return (
      <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
        <DialogTrigger
          asChild={(triggerProps) => (
            <button
              {...triggerProps}
              type='button'
              class='text-xs text-secondary leading-relaxed hover:text-foreground cursor-pointer text-left'
            >
              {descriptionText()} · 查看
            </button>
          )}
        />
        <DialogContent class='w-[min(94vw,48rem)] gap-3 p-4 sm:max-w-3xl' showCloseButton>
          <DialogHeader>
            <DialogTitle>{fetchDialogTitle(url() || value.url)}</DialogTitle>
            {(url() || value.url) && (
              <DialogDescription
                asChild={(descriptionProps) => (
                  <a
                    {...descriptionProps}
                    href={url() || value.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    class={cn(
                      descriptionProps.class,
                      'break-all text-left hover:text-primary-hover',
                    )}
                  >
                    {url() || value.url}
                  </a>
                )}
              />
            )}
          </DialogHeader>
          <FetchResultDialogBody payload={value} />
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <ChainOfThoughtStep
      icon={<Globe class='h-full w-full' />}
      description={canOpen() ? undefined : descriptionText()}
      status={stepStatus()}
      hideConnector={props.hideConnector}
    >
      {renderDialog()}
      {url() && (
        <a
          href={url()}
          target='_blank'
          rel='noopener noreferrer'
          class='text-xs text-muted-foreground hover:text-primary-hover transition-colors break-all'
        >
          {url()}
        </a>
      )}
      {renderImage()}
    </ChainOfThoughtStep>
  );
}

function RenderStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const description = () => `render · ${getStatusText(props.tool, props.isActive, 'render')}`;

  return (
    <ChainOfThoughtStep
      icon={
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          stroke-width='2'
          stroke-linecap='round'
          stroke-linejoin='round'
          class='h-full w-full'
          aria-hidden='true'
        >
          <rect x='3' y='3' width='18' height='18' rx='2' />
          <path d='M3 9h18' />
          <path d='M7 13h10' />
          <path d='M7 17h6' />
        </svg>
      }
      description={description()}
      status={getStepStatus(props.tool, props.isActive)}
      hideConnector={props.hideConnector}
    />
  );
}

// Render a generic tool step
function GenericToolStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const description = () =>
    `${props.tool.call.tool} · ${getStatusText(props.tool, props.isActive, props.tool.call.tool)}`;

  return (
    <ChainOfThoughtStep
      icon={<Wrench class='h-full w-full' />}
      description={description()}
      status={getStepStatus(props.tool, props.isActive)}
      hideConnector={props.hideConnector}
    />
  );
}

type ResearchBlockProps = {
  items: ResearchItem[];
  isActive?: boolean;
};

export function ResearchBlock(props: ResearchBlockProps) {
  return (
    <ChainOfThought>
      <ChainOfThoughtHeader>思考过程</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <For each={props.items}>
          {(item, index) => {
            const isLastStep = () => index() === props.items.length - 1;

            if (item.kind === 'thinking') {
              return <ThinkingStep text={item.text} hideConnector={isLastStep()} />;
            }

            const tool = item.data;
            const toolName = tool.call.tool;
            const itemIsActive = () => (props.isActive ?? false) && isLastStep();

            if (SEARCH_TOOL_NAMES.has(toolName)) {
              return (
                <SearchStep tool={tool} isActive={itemIsActive()} hideConnector={isLastStep()} />
              );
            }

            if (toolName === 'fetch_url') {
              return (
                <FetchStep tool={tool} isActive={itemIsActive()} hideConnector={isLastStep()} />
              );
            }

            if (toolName === 'render') {
              return (
                <RenderStep tool={tool} isActive={itemIsActive()} hideConnector={isLastStep()} />
              );
            }

            return (
              <GenericToolStep tool={tool} isActive={itemIsActive()} hideConnector={isLastStep()} />
            );
          }}
        </For>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
