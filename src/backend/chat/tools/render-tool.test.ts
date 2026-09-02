import { describe, expect, it } from 'vitest';
import { parseRenderArgs, renderTool } from './render-tool';

describe('render tool', () => {
  it('asks the model for one complete HTML string', () => {
    expect(renderTool.spec.function.parameters).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          description:
            'Complete, self-contained HTML. Must include <!doctype html> and run as-is in an iframe.',
        },
      },
      required: ['code'],
    });
    expect(renderTool.spec.function.description).toContain('Proactively use this tool');
  });

  it('accepts code without a title and ignores legacy title input', () => {
    expect(parseRenderArgs({ code: '  <!doctype html><main>Demo</main>  ' })).toEqual({
      code: '<!doctype html><main>Demo</main>',
    });
    expect(parseRenderArgs({ title: 'Legacy title', code: '<main>Legacy</main>' })).toEqual({
      code: '<main>Legacy</main>',
    });
  });

  it('rejects missing, empty, and oversized code', () => {
    expect(() => parseRenderArgs({})).toThrow('render requires non-empty code');
    expect(() => parseRenderArgs({ code: '   ' })).toThrow('render requires non-empty code');
    expect(() => parseRenderArgs({ code: 'x'.repeat(200_001) })).toThrow(
      'render code must be 200000 characters or fewer',
    );
  });

  it('returns a title-free result', async () => {
    await expect(renderTool.handler({ code: '<main>Demo</main>' })).resolves.toBe(
      'HTML rendered successfully.',
    );
  });
});
