import {
  createBundledHighlighter,
  createSingletonShorthands,
  guessEmbeddedLanguages,
} from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import { bundledThemes, bundledThemesInfo } from 'shiki/themes';

const bundledLanguagesInfo = [
  {
    id: 'javascript',
    name: 'JavaScript',
    aliases: ['js', 'cjs', 'mjs'],
    import: () => import('@shikijs/langs/javascript'),
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    aliases: ['ts', 'cts', 'mts'],
    import: () => import('@shikijs/langs/typescript'),
  },
  { id: 'jsx', name: 'JSX', import: () => import('@shikijs/langs/jsx') },
  { id: 'tsx', name: 'TSX', import: () => import('@shikijs/langs/tsx') },
  { id: 'html', name: 'HTML', import: () => import('@shikijs/langs/html') },
  { id: 'css', name: 'CSS', import: () => import('@shikijs/langs/css') },
  { id: 'json', name: 'JSON', import: () => import('@shikijs/langs/json') },
  { id: 'jsonc', name: 'JSON with Comments', import: () => import('@shikijs/langs/jsonc') },
  { id: 'yaml', name: 'YAML', aliases: ['yml'], import: () => import('@shikijs/langs/yaml') },
  { id: 'toml', name: 'TOML', import: () => import('@shikijs/langs/toml') },
  { id: 'xml', name: 'XML', import: () => import('@shikijs/langs/xml') },
  {
    id: 'graphql',
    name: 'GraphQL',
    aliases: ['gql'],
    import: () => import('@shikijs/langs/graphql'),
  },
  { id: 'python', name: 'Python', aliases: ['py'], import: () => import('@shikijs/langs/python') },
  { id: 'ruby', name: 'Ruby', aliases: ['rb'], import: () => import('@shikijs/langs/ruby') },
  { id: 'php', name: 'PHP', import: () => import('@shikijs/langs/php') },
  { id: 'lua', name: 'Lua', import: () => import('@shikijs/langs/lua') },
  { id: 'r', name: 'R', import: () => import('@shikijs/langs/r') },
  {
    id: 'shellscript',
    name: 'Shell',
    aliases: ['bash', 'sh', 'shell', 'zsh'],
    import: () => import('@shikijs/langs/shellscript'),
  },
  { id: 'sql', name: 'SQL', import: () => import('@shikijs/langs/sql') },
  {
    id: 'markdown',
    name: 'Markdown',
    aliases: ['md'],
    import: () => import('@shikijs/langs/markdown'),
  },
  { id: 'c', name: 'C', import: () => import('@shikijs/langs/c') },
  { id: 'cpp', name: 'C++', aliases: ['c++'], import: () => import('@shikijs/langs/cpp') },
  {
    id: 'csharp',
    name: 'C#',
    aliases: ['c#', 'cs'],
    import: () => import('@shikijs/langs/csharp'),
  },
  { id: 'java', name: 'Java', import: () => import('@shikijs/langs/java') },
  { id: 'go', name: 'Go', import: () => import('@shikijs/langs/go') },
  { id: 'rust', name: 'Rust', aliases: ['rs'], import: () => import('@shikijs/langs/rust') },
  { id: 'swift', name: 'Swift', import: () => import('@shikijs/langs/swift') },
  {
    id: 'kotlin',
    name: 'Kotlin',
    aliases: ['kt', 'kts'],
    import: () => import('@shikijs/langs/kotlin'),
  },
  { id: 'dart', name: 'Dart', import: () => import('@shikijs/langs/dart') },
  { id: 'scala', name: 'Scala', import: () => import('@shikijs/langs/scala') },
  {
    id: 'docker',
    name: 'Dockerfile',
    aliases: ['dockerfile'],
    import: () => import('@shikijs/langs/docker'),
  },
  { id: 'diff', name: 'Diff', import: () => import('@shikijs/langs/diff') },
];

const bundledLanguagesBase = Object.fromEntries(bundledLanguagesInfo.map((i) => [i.id, i.import]));
const bundledLanguagesAlias = Object.fromEntries(
  bundledLanguagesInfo.flatMap((i) => i.aliases?.map((a) => [a, i.import]) ?? []),
);
const bundledLanguages = { ...bundledLanguagesBase, ...bundledLanguagesAlias };

const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine({ forgiving: true }),
});

const {
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = createSingletonShorthands(createHighlighter, { guessEmbeddedLanguages });

export {
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  createHighlighter,
  getLastGrammarState,
  getSingletonHighlighter,
};
export {
  createJavaScriptRegexEngine,
  defaultJavaScriptRegexConstructor,
} from '@shikijs/engine-javascript';
export * from '@shikijs/core';
export { bundledLanguages, bundledLanguagesAlias, bundledLanguagesBase, bundledLanguagesInfo };
export { bundledThemes, bundledThemesInfo };
