const BABEL_SCRIPT = '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>';

const ANCHOR_FIX_SCRIPT = `<script>document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;var href=a.getAttribute('href');if(!href||!href.startsWith('#'))return;e.preventDefault();var el=document.getElementById(href.slice(1));if(el)el.scrollIntoView({behavior:'smooth'});});</script>`;

function inject(code: string, tag: string, content: string): string {
  return code.includes(tag) ? code.replace(tag, `  ${content}\n${tag}`) : code + content;
}

export function buildPreviewDocument(code: string): string {
  const needsBabel =
    !code.includes('babel') && code.includes('esm.sh/react') && code.includes('className=');

  let result = needsBabel
    ? code
        .replace('</head>', `  ${BABEL_SCRIPT}\n</head>`)
        .replace(/<script type=["']module["']>/g, '<script type="text/babel" data-type="module">')
    : code;

  result = inject(result, '</body>', ANCHOR_FIX_SCRIPT);
  return result;
}
