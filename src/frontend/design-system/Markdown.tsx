import { createMemo, createSignal, For, omit, onCleanup, type Component } from 'solid-js';
import { createComponent, Dynamic, type JSX } from '@solidjs/web';
import { Check, Copy } from '@/frontend/design-system/icons';
import {
  toJsxRuntime,
  type Components,
  type Props as RuntimeProps,
} from 'hast-util-to-jsx-runtime';
import { harden as rehypeHarden } from 'rehype-harden';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkGfmStrikethroughCjkFriendly from 'remark-cjk-friendly-gfm-strikethrough';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remend from 'remend';
import { unified } from 'unified';
import { useToast } from '@/frontend/app-shell/useToast';
import { HighlightedCode } from '@/frontend/design-system/HighlightedCode';
import 'katex/dist/katex.min.css';

function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    if (current.length === 0) return;
    paragraphs.push(current.join('\n'));
    current = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        flush();
        inCodeBlock = true;
        current.push(line);
      } else {
        current.push(line);
        inCodeBlock = false;
        flush();
      }
      continue;
    }
    if (inCodeBlock) {
      current.push(line);
    } else if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }

  flush();
  return paragraphs;
}

type Props = {
  content: string;
  isAnimating?: boolean;
};

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'tel'],
  },
};

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkCjkFriendly)
  .use(remarkGfm)
  .use(remarkGfmStrikethroughCjkFriendly)
  .use(remarkMath, { singleDollarTextMath: true })
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHarden, {
    allowedImagePrefixes: ['*'],
    allowedLinkPrefixes: ['*'],
    allowedProtocols: ['*'],
    allowDataImages: true,
  })
  .use(rehypeKatex);

const copyResetDelayMs = 2000;
const Fragment = (props: RuntimeProps) => props.children;
const isComponent = (type: unknown): type is Component<RuntimeProps> => typeof type === 'function';
const jsx = (type: unknown, props: RuntimeProps) => {
  if (isComponent(type)) return createComponent(type, props);
  if (typeof type === 'string') return createComponent(Dynamic, { component: type, ...props });
  throw new TypeError('Unsupported Markdown element');
};

function MarkdownLink(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...omit(props, 'children')} data-markdown='link' rel='noopener noreferrer' target='_blank'>
      {props.children}
    </a>
  );
}

function MarkdownTable(props: JSX.HTMLAttributes<HTMLTableElement>) {
  return (
    <div class='my-4 max-w-full overflow-x-auto' data-markdown='table-container'>
      <table {...omit(props, 'children')}>{props.children}</table>
    </div>
  );
}

function MarkdownCodeBlock(props: { code: string; language: string }) {
  const toast = useToast();
  const [copied, setCopied] = createSignal(false);
  let copyTimer: number | undefined;

  onCleanup(() => {
    if (copyTimer !== undefined) window.clearTimeout(copyTimer);
  });

  const handleCopy = () => {
    void navigator.clipboard.writeText(props.code).then(
      () => {
        setCopied(true);
        if (copyTimer !== undefined) window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => {
          setCopied(false);
          copyTimer = undefined;
        }, copyResetDelayMs);
      },
      (error) => {
        console.error('Failed to copy code:', error);
        toast.error('Failed to copy code');
      },
    );
  };

  return (
    <section data-language={props.language} data-markdown='code-block'>
      <header>
        <span>{props.language || 'text'}</span>
        <button onClick={handleCopy} title='Copy code' type='button'>
          {copied() ? <Check /> : <Copy />}
        </button>
      </header>
      <HighlightedCode code={props.code} isCompleted language={props.language} />
    </section>
  );
}

function MarkdownPre(props: JSX.HTMLAttributes<HTMLPreElement> & { node?: unknown }) {
  if (!props.node || typeof props.node !== 'object' || !('children' in props.node)) {
    return <pre {...omit(props, 'children', 'node')}>{props.children}</pre>;
  }
  const children = props.node.children;
  if (!Array.isArray(children))
    return <pre {...omit(props, 'children', 'node')}>{props.children}</pre>;
  const codeNode = children[0];
  if (
    !codeNode ||
    typeof codeNode !== 'object' ||
    !('properties' in codeNode) ||
    !('children' in codeNode)
  ) {
    return <pre {...omit(props, 'children', 'node')}>{props.children}</pre>;
  }
  const properties = codeNode.properties;
  const codeChildren = codeNode.children;
  const classes: unknown[] =
    properties &&
    typeof properties === 'object' &&
    'className' in properties &&
    Array.isArray(properties.className)
      ? properties.className
      : [];
  const code = Array.isArray(codeChildren)
    ? codeChildren
        .flatMap((child) =>
          typeof child === 'object' && child && 'value' in child && typeof child.value === 'string'
            ? [child.value]
            : [],
        )
        .join('')
    : '';
  const languageClass = classes.find(
    (className: unknown) => typeof className === 'string' && className.startsWith('language-'),
  );
  const language = typeof languageClass === 'string' ? languageClass.slice('language-'.length) : '';

  return <MarkdownCodeBlock code={code.replace(/\n$/, '')} language={language} />;
}

const markdownComponents: Partial<Components> = {
  a: MarkdownLink,
  img: ({ alt, ...props }) => <img {...props} alt={alt ?? ''} data-markdown='image' />,
  pre: MarkdownPre,
  table: MarkdownTable,
};

/*
 * 流式渲染:不走 Solid,而是把每帧的 hast 树 diff-patch 进一个自持的 DOM 容器。
 * 流式输出几乎总是尾部追加,所以已有 DOM 原地保留,只把新增文字包进带淡入
 * 动画的 span 追加进去——span 之后不再被触碰,动画能完整播完。remend 修补
 * 或语法闭合导致结构变化时,替换对不上的子树兜底。流结束后整体切回 Solid
 * 渲染的最终版,流式 DOM 连同动画 span 一起丢弃。
 *
 * 文本映射规则:hast 文本节点(非纯空白)对应一个 <span data-stream-text>
 * 容器,内部是历次追加的文字片段,保证 hast 子节点和 DOM 子节点 1:1 对应。
 */

type HastRoot = ReturnType<typeof markdownProcessor.runSync>;
type HastChild = HastRoot['children'][number];
type HastElement = Extract<HastChild, { type: 'element' }>;

function freshSpan(text: string) {
  const span = document.createElement('span');
  span.className = 'animate-fresh-token';
  span.textContent = text;
  return span;
}

function createTextGroup(value: string) {
  const group = document.createElement('span');
  group.setAttribute('data-stream-text', '');
  group.appendChild(freshSpan(value));
  return group;
}

function patchTextGroup(group: HTMLElement, value: string) {
  const current = group.textContent ?? '';
  if (current === value) return;
  if (value.startsWith(current)) {
    group.appendChild(freshSpan(value.slice(current.length)));
    return;
  }
  let prefix = 0;
  while (prefix < current.length && prefix < value.length && current[prefix] === value[prefix]) {
    prefix++;
  }
  while (group.lastChild) group.removeChild(group.lastChild);
  group.appendChild(document.createTextNode(value.slice(0, prefix)));
  if (prefix < value.length) group.appendChild(freshSpan(value.slice(prefix)));
}

const extraStreamAttributes: Record<string, Record<string, string>> = {
  a: { 'data-markdown': 'link', rel: 'noopener noreferrer', target: '_blank' },
  img: { alt: '', 'data-markdown': 'image' },
};

function syncStreamAttributes(el: HTMLElement, node: HastElement) {
  const desired = new Map(Object.entries(extraStreamAttributes[node.tagName] ?? {}));
  for (const [name, value] of Object.entries(node.properties)) {
    if (value === false || value == null) continue;
    const attribute =
      name === 'className'
        ? 'class'
        : /^(aria|data)[A-Z]/.test(name)
          ? name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
          : name.toLowerCase();
    desired.set(
      attribute,
      value === true ? '' : Array.isArray(value) ? value.join(' ') : String(value),
    );
  }
  for (const attribute of el.getAttributeNames()) {
    if (!desired.has(attribute)) el.removeAttribute(attribute);
  }
  for (const [attribute, value] of desired) {
    if (el.getAttribute(attribute) !== value) el.setAttribute(attribute, value);
  }
}

function extractPreCode(node: HastElement): { code: string; language: string } {
  const codeNode = node.children[0];
  if (!codeNode || codeNode.type !== 'element') return { code: '', language: '' };
  const classes = Array.isArray(codeNode.properties.className) ? codeNode.properties.className : [];
  const languageClass = classes.find(
    (className) => typeof className === 'string' && className.startsWith('language-'),
  );
  const language = typeof languageClass === 'string' ? languageClass.slice('language-'.length) : '';
  const code = codeNode.children
    .map((child) => (child.type === 'text' ? child.value : ''))
    .join('');
  return { code: code.replace(/\n$/, ''), language };
}

function createCodeSection(code: string, language: string) {
  const section = document.createElement('section');
  section.setAttribute('data-markdown', 'code-block');
  section.setAttribute('data-language', language);
  const header = document.createElement('header');
  const label = document.createElement('span');
  label.textContent = language || 'text';
  header.appendChild(label);
  const pre = document.createElement('pre');
  pre.setAttribute('data-markdown', 'code-block-body');
  const codeEl = document.createElement('code');
  codeEl.appendChild(createTextGroup(code));
  pre.appendChild(codeEl);
  section.appendChild(header);
  section.appendChild(pre);
  return section;
}

function createStreamNode(node: HastChild): HTMLElement | Text | null {
  if (node.type === 'text') {
    if (node.value.trim() === '') return document.createTextNode(node.value);
    return createTextGroup(node.value);
  }
  if (node.type !== 'element') return null;
  if (node.tagName === 'pre') {
    const { code, language } = extractPreCode(node);
    return createCodeSection(code, language);
  }
  const el = document.createElement(node.tagName);
  syncStreamAttributes(el, node);
  for (const child of node.children) {
    const dom = createStreamNode(child);
    if (dom) el.appendChild(dom);
  }
  if (node.tagName !== 'table') return el;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-markdown', 'table-container');
  wrapper.className = 'my-4 max-w-full overflow-x-auto';
  wrapper.appendChild(el);
  return wrapper;
}

function patchStreamNode(dom: Node, node: HastChild): boolean {
  if (node.type === 'text') {
    if (node.value.trim() === '') {
      if (dom.nodeType !== Node.TEXT_NODE) return false;
      if (dom.nodeValue !== node.value) dom.nodeValue = node.value;
      return true;
    }
    if (!(dom instanceof HTMLElement) || !dom.hasAttribute('data-stream-text')) return false;
    patchTextGroup(dom, node.value);
    return true;
  }
  if (node.type !== 'element' || !(dom instanceof HTMLElement)) return false;
  if (node.tagName === 'pre') {
    const { code, language } = extractPreCode(node);
    if (dom.getAttribute('data-language') !== language) return false;
    const group = dom.querySelector('code > [data-stream-text]');
    if (!(group instanceof HTMLElement)) return false;
    patchTextGroup(group, code);
    return true;
  }
  if (node.tagName === 'table') {
    if (dom.getAttribute('data-markdown') !== 'table-container') return false;
    const table = dom.firstElementChild;
    return table !== null && patchStreamNode(table, node);
  }
  if (dom.tagName.toLowerCase() !== node.tagName) return false;
  syncStreamAttributes(dom, node);
  patchStreamChildren(dom, node.children);
  return true;
}

function patchStreamChildren(parent: HTMLElement, children: HastChild[]) {
  const rendered = children.filter((child) => child.type === 'text' || child.type === 'element');
  rendered.forEach((node, index) => {
    const dom = parent.childNodes[index];
    if (!dom) {
      const created = createStreamNode(node);
      if (created) parent.appendChild(created);
      return;
    }
    if (patchStreamNode(dom, node)) return;
    const created = createStreamNode(node);
    if (created) parent.replaceChild(created, dom);
  });
  while (parent.childNodes.length > rendered.length && parent.lastChild) {
    parent.removeChild(parent.lastChild);
  }
}

function MarkdownBlock(props: { isAnimating: boolean; markdown: string }) {
  let streamHost: HTMLDivElement | undefined;

  const tree = createMemo(() => {
    const source = props.isAnimating ? remend(props.markdown) : props.markdown;
    return markdownProcessor.runSync(markdownProcessor.parse(source));
  });

  const streamed = () => {
    streamHost ??= document.createElement('div');
    patchStreamChildren(streamHost, tree().children);
    return streamHost;
  };

  return (
    <div style={{ 'content-visibility': 'auto', 'contain-intrinsic-block-size': 'auto 0px' }}>
      {props.isAnimating
        ? streamed()
        : toJsxRuntime(tree(), {
            Fragment,
            components: markdownComponents,
            jsx,
            jsxs: jsx,
            passNode: true,
            passKeys: false,
            elementAttributeNameCase: 'html',
          })}
    </div>
  );
}

function Markdown(props: Props) {
  const paragraphs = createMemo(() => splitMarkdownParagraphs(props.content));
  // For 按值 keyed,直接遍历段落文字会在流式追加时销毁重建整块。
  // 改成遍历稳定的数字下标,段落内容变化只更新对应 MarkdownBlock 的 props。
  const indexes = createMemo(() => paragraphs().map((_, index) => index));

  return (
    <div class='aether-markdown space-y-3 font-light [&_b]:font-black [&_strong]:font-black [&_b]:text-foreground [&_strong]:text-foreground'>
      <For each={indexes()}>
        {(index) => (
          <MarkdownBlock
            isAnimating={(props.isAnimating ?? false) && index === paragraphs().length - 1}
            markdown={paragraphs()[index] ?? ''}
          />
        )}
      </For>
    </div>
  );
}

export default Markdown;
