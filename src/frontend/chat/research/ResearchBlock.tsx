import { useState } from 'react';
import {
  Search,
  Globe,
  Wrench,
  TextSearchIcon,
  BookOpenIcon,
} from '@/frontend/design-system/icons';
import { cn } from '@/shared/core/utils';
import Markdown from '@/frontend/design-system/Markdown';
import {
  parseFetchClientPayload,
  type FetchClientPayload,
} from '@/shared/chat/research/fetch-result-payload';
import {
  parseSearchClientPayload,
  SEARCH_TOOL_NAMES,
} from '@/shared/chat/research/search-result-payload';
import type { ResearchItem, Tool } from '@/shared/chat/message';
import type { StepStatus } from '@/frontend/design-system/chain-of-thought';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/design-system/dialog';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
} from '@/frontend/design-system/chain-of-thought';

function getSearchResultCount(rawResult: string): number | null {
  try {
    const data: unknown = JSON.parse(rawResult);
    if (typeof data !== 'object' || data === null) return null;
    const rawResults =
      ('results' in data && Array.isArray(data.results) && data.results) ||
      ('rawResults' in data && Array.isArray(data.rawResults) && data.rawResults) ||
      ('web' in data &&
        typeof data.web === 'object' &&
        data.web !== null &&
        'results' in data.web &&
        Array.isArray(data.web.results) &&
        data.web.results) ||
      [];

    if (!Array.isArray(rawResults)) {
      return null;
    }

    return rawResults.filter((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const url =
        'url' in item && typeof item.url === 'string'
          ? item.url
          : 'link' in item && typeof item.link === 'string'
            ? item.link
            : '';
      return Boolean(url);
    }).length;
  } catch {
    return null;
  }
}

// Get step status from tool lifecycle
function getStepStatus(tool: Tool, isActive: boolean): StepStatus {
  if (!tool.result) {
    return isActive ? 'active' : 'pending';
  }
  return 'complete';
}

// Get status text for a tool
function getStatusText(tool: Tool, isActive: boolean, toolName: string): string {
  const result = tool.result;

  if (!result) {
    if (!isActive) return '等待中...';
    if (SEARCH_TOOL_NAMES.has(toolName)) return '搜索中...';
    if (toolName === 'fetch_url') return '获取中...';
    if (toolName === 'read_image') return '读取图片中...';
    if (toolName === 'read_youtube_transcript') return '读取字幕中...';
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
      icon={<div className='h-2 w-2 rounded-full bg-current' />}
      hideConnector={props.hideConnector}
    >
      <div className='text-xs text-secondary [&_p]:m-0'>
        <Markdown content={props.text} />
      </div>
    </ChainOfThoughtStep>
  );
}

// Render a search tool step
function SearchStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const query = typeof props.tool.call.args.query === 'string' ? props.tool.call.args.query : '';
  const platform = props.tool.call.args.platform;
  const description =
    props.tool.call.tool === 'search'
      ? `${
          platform === 'weixin'
            ? '搜索微信公众号'
            : platform === 'rednote'
              ? '搜索小红书'
              : '搜索 Google'
        }${query ? ` · ${query}` : ''}`
      : query
        ? `Reading the web · ${query}`
        : 'Reading the web';
  const searchResults = props.tool.result
    ? parseSearchClientPayload(
        typeof props.tool.result.result === 'string' ? props.tool.result.result : '',
      )?.results.slice(0, 10)
    : undefined;

  return (
    <ChainOfThoughtStep
      icon={<Search className='h-full w-full' />}
      description={description}
      status={getStepStatus(props.tool, props.isActive)}
      hideConnector={props.hideConnector}
    >
      {searchResults?.length === 0 && <p className='text-xs text-secondary'>no result</p>}
      {searchResults && searchResults.length > 0 && (
        <ChainOfThoughtSearchResults>
          {searchResults.map((result, index) => (
            <ChainOfThoughtSearchResult
              key={`${result.url}-${index}`}
              href={result.url}
              url={result.url}
            >
              {result.title}
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

function FetchResultDialogBody(props: { payload: FetchClientPayload }) {
  if (props.payload.type === 'image') {
    return (
      <img
        src={props.payload.data_url}
        alt={props.payload.url}
        className='max-h-[70vh] w-full object-contain'
      />
    );
  }

  if (props.payload.type === 'markdown' || props.payload.type === 'youtube') {
    return (
      <div className='max-h-[70vh] overflow-y-auto text-sm text-secondary'>
        <Markdown content={props.payload.content} />
        {props.payload.truncated && (
          <p className='mt-3 text-xs text-muted-foreground'>内容已截断</p>
        )}
      </div>
    );
  }

  return null;
}

function FetchStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const url = typeof props.tool.call.args.url === 'string' ? props.tool.call.args.url : '';
  const stepStatus = getStepStatus(props.tool, props.isActive);
  const result = props.tool.result;
  const resultText = result && typeof result.result === 'string' ? result.result : '';
  const payload = resultText ? parseFetchClientPayload(resultText) : null;
  const isError = (() => {
    const text = resultText;
    const isLegacyError =
      text.startsWith('Error') ||
      (text.startsWith('[系统提示:') &&
        (text.includes('内容过长') || text.includes('已省略不返回')));
    return payload?.type === 'error' || Boolean(result && isLegacyError);
  })();
  const canOpen = stepStatus === 'complete' && payload?.type !== 'error' && payload !== null;
  const actionLabel =
    props.tool.call.tool === 'read_image'
      ? '读取图片'
      : props.tool.call.tool === 'read_youtube_transcript'
        ? '读取 YouTube 字幕'
        : 'Take a closer look';
  const descriptionText = `${actionLabel}${stepStatus === 'complete' ? (isError ? '...failed.' : '...done!') : ''}`;
  const renderImage = () => {
    const value = payload;
    if (value?.type !== 'image') return null;
    return <ChainOfThoughtImage src={value.data_url} alt={url} />;
  };
  const renderDialog = () => {
    const value = payload;
    if (!canOpen || !value) return null;

    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger
          asChild={(triggerProps) => (
            <button
              {...triggerProps}
              type='button'
              className='text-xs text-secondary leading-relaxed hover:text-foreground cursor-pointer text-left'
            >
              {descriptionText} · 查看
            </button>
          )}
        />
        <DialogContent className='w-[min(94vw,48rem)] gap-3 p-4 sm:max-w-3xl' showCloseButton>
          <DialogHeader>
            <DialogTitle>{fetchDialogTitle(url || value.url)}</DialogTitle>
            {(url || value.url) && (
              <DialogDescription
                asChild={(descriptionProps) => (
                  <a
                    {...descriptionProps}
                    href={url || value.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={cn(
                      descriptionProps.className,
                      'break-all text-left hover:text-primary-hover',
                    )}
                  >
                    {url || value.url}
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
      icon={<Globe className='h-full w-full' />}
      description={canOpen ? undefined : descriptionText}
      status={stepStatus}
      hideConnector={props.hideConnector}
    >
      {renderDialog()}
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
      {renderImage()}
    </ChainOfThoughtStep>
  );
}

function ChatHistoryResultDialog(props: { tool: Tool; description: string }) {
  const result = props.tool.result?.result;

  return (
    <Dialog>
      <DialogTrigger
        asChild={(triggerProps) => (
          <button
            {...triggerProps}
            type='button'
            className='block text-left text-xs leading-relaxed text-secondary hover:text-foreground cursor-pointer'
          >
            {props.description} · 查看
          </button>
        )}
      />
      <DialogContent className='w-[min(94vw,48rem)] gap-3 p-4 sm:max-w-3xl' showCloseButton>
        <DialogHeader>
          <DialogTitle>{props.tool.call.tool}</DialogTitle>
          <DialogDescription>调用参数与完整返回结果</DialogDescription>
        </DialogHeader>
        <div className='max-h-[70vh] space-y-3 overflow-y-auto text-sm'>
          <h3 className='font-medium'>调用参数</h3>
          <pre className='whitespace-pre-wrap break-words text-xs text-secondary'>
            {JSON.stringify(props.tool.call.args, null, 2)}
          </pre>
          <h3 className='font-medium'>返回结果</h3>
          <pre className='whitespace-pre-wrap break-words text-xs text-secondary'>
            {result === undefined
              ? '等待工具返回…'
              : result.startsWith('{')
                ? JSON.stringify(JSON.parse(result), null, 2)
                : result}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ChatHistoryStepProps = { tool: Tool; isActive: boolean; hideConnector: boolean };

function SearchChatHistoryStep(props: ChatHistoryStepProps) {
  const resultCount = props.tool.result ? getSearchResultCount(props.tool.result.result) : null;

  return (
    <ChainOfThoughtStep
      icon={<TextSearchIcon className='h-3.5 w-3.5' strokeWidth={1.5} />}
      status={getStepStatus(props.tool, props.isActive)}
      hideConnector={props.hideConnector}
    >
      <ChatHistoryResultDialog
        tool={props.tool}
        description={`搜索历史 · ${props.tool.call.args.query} · ${getStatusText(props.tool, props.isActive, props.tool.call.tool)}${resultCount === null ? '' : ` · ${resultCount} 个结果`}`}
      />
    </ChainOfThoughtStep>
  );
}

function ReadChatHistoryStep(props: ChatHistoryStepProps) {
  return (
    <ChainOfThoughtStep
      icon={<BookOpenIcon className='h-3.5 w-3.5' strokeWidth={1.5} />}
      status={getStepStatus(props.tool, props.isActive)}
      hideConnector={props.hideConnector}
    >
      <ChatHistoryResultDialog
        tool={props.tool}
        description={`读取历史 · 消息 ${props.tool.call.args.message_id} · ${getStatusText(props.tool, props.isActive, props.tool.call.tool)}`}
      />
    </ChainOfThoughtStep>
  );
}

// Render a generic tool step
function GenericToolStep(props: { tool: Tool; isActive: boolean; hideConnector: boolean }) {
  const description = `${props.tool.call.tool} · ${getStatusText(props.tool, props.isActive, props.tool.call.tool)}`;

  return (
    <ChainOfThoughtStep
      icon={<Wrench className='h-full w-full' />}
      description={description}
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
  const visibleItems = props.items.filter(
    (item) => item.kind === 'thinking' || item.data.call.tool !== 'render',
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <ChainOfThought>
      <ChainOfThoughtHeader>思考过程</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {visibleItems.map((item, index) => {
          const isLastStep = index === visibleItems.length - 1;

          if (item.kind === 'thinking') {
            return <ThinkingStep key={index} text={item.text} hideConnector={isLastStep} />;
          }

          const tool = item.data;
          const toolName = tool.call.tool;
          const itemIsActive = (props.isActive ?? false) && isLastStep;

          if (toolName === 'search_chat_history') {
            return (
              <SearchChatHistoryStep
                key={index}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          if (toolName === 'read_chat_history') {
            return (
              <ReadChatHistoryStep
                key={index}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          if (SEARCH_TOOL_NAMES.has(toolName)) {
            return (
              <SearchStep
                key={index}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          if (['fetch_url', 'read_image', 'read_youtube_transcript'].includes(toolName)) {
            return (
              <FetchStep
                key={index}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          return (
            <GenericToolStep
              key={index}
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
