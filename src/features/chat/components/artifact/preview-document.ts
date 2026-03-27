const BABEL_SCRIPT =
  '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>';

export function buildPreviewDocument(code: string): string {
  const needsBabel =
    !code.includes('babel') && code.includes('esm.sh/react') && code.includes('className=');

  if (!needsBabel) return code;

  return code
    .replace('</head>', `  ${BABEL_SCRIPT}\n</head>`)
    .replace(/<script type=["']module["']>/g, '<script type="text/babel" data-type="module">');
}
