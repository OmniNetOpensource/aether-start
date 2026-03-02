/**
 * Dev-only Babel plugin: wraps React component returns in RenderMonitorBoundary
 * for mount/rerender tracking and golden-box flash.
 * Only active when enabled via plugin options (Vite passes this in dev mode).
 */
export default function renderMonitorPlugin({ types: t }) {
  const IMPORT_SOURCE = '@/lib/dev/render-monitor'

  function isReactComponent(path, componentName) {
    if (!componentName) return false
    if (componentName.startsWith('use')) return false
    if (componentName[0] === componentName[0].toLowerCase()) return false
    const body = path.get('body')
    if (body.isBlockStatement()) {
      const returnStmt = body.get('body').find((p) => p.isReturnStatement())
      if (!returnStmt) return false
      const arg = returnStmt.get('argument')
      return arg && (arg.isJSXElement() || arg.isJSXFragment())
    }
    return body.isJSXElement() || body.isJSXFragment()
  }

  function getComponentName(path) {
    const binding = path.parentPath?.isVariableDeclarator()
      ? path.parentPath.get('id')
      : path.get('id')
    if (binding?.isIdentifier()) return binding.node.name
    return null
  }

  function addImport(programPath, name) {
    const existing = programPath.get('body').find((p) => {
      if (!p.isImportDeclaration()) return false
      return p.node.source.value === IMPORT_SOURCE
    })
    if (existing) {
      const spec = existing.node.specifiers.find((s) => s.imported?.name === name)
      if (spec) return
      existing.node.specifiers.push(
        t.importSpecifier(t.identifier(name), t.identifier(name))
      )
      return
    }
    programPath.unshiftContainer(
      'body',
      t.importDeclaration(
        [t.importSpecifier(t.identifier(name), t.identifier(name))],
        t.stringLiteral(IMPORT_SOURCE)
      )
    )
  }

  function wrapReturnWithBoundary(path, name) {
    const body = path.get('body')
    let toWrap
    if (body.isBlockStatement()) {
      const returnStmt = body.get('body').find((p) => p.isReturnStatement())
      if (!returnStmt) return
      const arg = returnStmt.get('argument')
      if (!arg.node) return
      toWrap = arg.node
      const wrapped = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier('RenderMonitorBoundary'),
          [t.jsxAttribute(t.jsxIdentifier('name'), t.stringLiteral(name))],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier('RenderMonitorBoundary')),
        [toWrap],
        false
      )
      returnStmt.node.argument = wrapped
    } else {
      toWrap = body.node
      const wrapped = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier('RenderMonitorBoundary'),
          [t.jsxAttribute(t.jsxIdentifier('name'), t.stringLiteral(name))],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier('RenderMonitorBoundary')),
        [toWrap],
        false
      )
      path.get('body').replaceWith(t.blockStatement([t.returnStatement(wrapped)]))
    }
  }

  return {
    name: 'render-monitor',
    visitor: {
      Program(programPath, state) {
        const file = state.filename || state.file?.opts?.filename || ''
        if (!file || file.includes('node_modules')) return
        if (!file.match(/\.(tsx|jsx)$/)) return
        if (file.includes('render-monitor')) return
        if (!state.opts?.enabled) return

        state.file.set('renderMonitorProcessed', false)
      },

      FunctionDeclaration(path, state) {
        if (!state.opts?.enabled) return
        const file = state.filename || state.file?.opts?.filename || ''
        if (!file || file.includes('node_modules') || file.includes('render-monitor'))
          return

        const name = getComponentName(path)
        if (!isReactComponent(path, name)) return

        addImport(path.findParent((p) => p.isProgram()), 'RenderMonitorBoundary')
        wrapReturnWithBoundary(path, name)
      },

      ArrowFunctionExpression(path, state) {
        if (!state.opts?.enabled) return
        const file = state.filename || state.file?.opts?.filename || ''
        if (!file || file.includes('node_modules') || file.includes('render-monitor'))
          return

        const name = getComponentName(path)
        if (!isReactComponent(path, name)) return

        const program = path.findParent((p) => p.isProgram())
        addImport(program, 'RenderMonitorBoundary')
        wrapReturnWithBoundary(path, name)
      },
    },
  }
}
