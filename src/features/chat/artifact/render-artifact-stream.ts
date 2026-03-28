import type { ChatServerToClientEvent } from '@/features/chat/session';

type KnownField = 'title' | 'code';
type ParserPhase =
  | 'before_object'
  | 'before_key'
  | 'in_key'
  | 'after_key'
  | 'before_value'
  | 'in_value'
  | 'after_value'
  | 'done';

const ESCAPE_MAP: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

const isKnownField = (value: string): value is KnownField => value === 'title' || value === 'code';

export class RenderArtifactStreamParser {
  private readonly artifactId: string;
  private phase: ParserPhase = 'before_object';
  private currentKey = '';
  private currentValue = '';
  private currentField: KnownField | null = null;
  private escapePending = false;
  private unicodeDigits = '';
  private emittedStarted = false;
  private emittedTitle = false;
  private emittedCodeLength = 0;

  constructor(artifactId: string) {
    this.artifactId = artifactId;
  }

  start(): ChatServerToClientEvent[] {
    if (this.emittedStarted) {
      return [];
    }

    this.emittedStarted = true;
    return [
      {
        type: 'artifact_started',
        artifactId: this.artifactId,
        callId: this.artifactId,
      },
      {
        type: 'artifact_language',
        artifactId: this.artifactId,
        language: 'html',
      },
    ];
  }

  append(chunk: string): ChatServerToClientEvent[] {
    if (!chunk) {
      return [];
    }

    const events = this.start();
    let codeDelta = '';

    for (const char of chunk) {
      if (this.phase === 'done') {
        break;
      }

      if (this.phase === 'before_object') {
        if (/\s/.test(char)) {
          continue;
        }
        if (char === '{') {
          this.phase = 'before_key';
        }
        continue;
      }

      if (this.phase === 'before_key') {
        if (/\s/.test(char) || char === ',') {
          continue;
        }
        if (char === '}') {
          this.phase = 'done';
          continue;
        }
        if (char === '"') {
          this.currentKey = '';
          this.escapePending = false;
          this.unicodeDigits = '';
          this.phase = 'in_key';
        }
        continue;
      }

      if (this.phase === 'after_key') {
        if (/\s/.test(char)) {
          continue;
        }
        if (char === ':') {
          this.phase = 'before_value';
        }
        continue;
      }

      if (this.phase === 'before_value') {
        if (/\s/.test(char)) {
          continue;
        }
        if (char === '"') {
          this.currentField = isKnownField(this.currentKey) ? this.currentKey : null;
          this.currentValue = '';
          this.escapePending = false;
          this.unicodeDigits = '';
          this.phase = 'in_value';
          continue;
        }
        this.phase = 'after_value';
        continue;
      }

      if (this.phase === 'after_value') {
        if (/\s/.test(char)) {
          continue;
        }
        if (char === ',') {
          this.phase = 'before_key';
          this.currentKey = '';
          this.currentField = null;
          continue;
        }
        if (char === '}') {
          this.phase = 'done';
        }
        continue;
      }

      const target = this.phase === 'in_key' ? 'key' : 'value';
      const decoded = this.consumeStringCharacter(char, target);
      if (decoded === null) {
        continue;
      }

      if (decoded === '__END__') {
        if (this.phase === 'in_key') {
          this.phase = 'after_key';
        } else {
          if (this.currentField === 'title' && !this.emittedTitle) {
            events.push({
              type: 'artifact_title',
              artifactId: this.artifactId,
              title: this.currentValue,
            });
            this.emittedTitle = true;
          }

          this.phase = 'after_value';
        }
        continue;
      }

      if (this.phase === 'in_key') {
        this.currentKey += decoded;
        continue;
      }

      this.currentValue += decoded;
      if (this.currentField === 'code') {
        codeDelta += decoded;
        this.emittedCodeLength += decoded.length;
      }
    }

    if (codeDelta) {
      events.push({
        type: 'artifact_code_delta',
        artifactId: this.artifactId,
        delta: codeDelta,
      });
    }

    return events;
  }

  finalize(args: Record<string, unknown>): ChatServerToClientEvent[] {
    const events: ChatServerToClientEvent[] = this.start();
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    const code = typeof args.code === 'string' ? args.code : '';

    if (title && !this.emittedTitle) {
      events.push({
        type: 'artifact_title',
        artifactId: this.artifactId,
        title,
      });
      this.emittedTitle = true;
    }

    if (code) {
      const delta = code.slice(this.emittedCodeLength);
      if (delta) {
        events.push({
          type: 'artifact_code_delta',
          artifactId: this.artifactId,
          delta,
        });
        this.emittedCodeLength = code.length;
      }
    }

    return events;
  }

  private consumeStringCharacter(char: string, target: 'key' | 'value') {
    if (this.unicodeDigits) {
      if (!/[0-9a-fA-F]/.test(char)) {
        this.unicodeDigits = '';
        this.escapePending = false;
        return null;
      }

      this.unicodeDigits += char;
      if (this.unicodeDigits.length < 4) {
        return null;
      }

      const decoded = String.fromCharCode(Number.parseInt(this.unicodeDigits, 16));
      this.unicodeDigits = '';
      this.escapePending = false;
      return decoded;
    }

    if (this.escapePending) {
      if (char === 'u') {
        this.unicodeDigits = '';
        return null;
      }

      this.escapePending = false;
      return ESCAPE_MAP[char] ?? char;
    }

    if (char === '\\') {
      this.escapePending = true;
      return null;
    }

    if (char === '"') {
      this.escapePending = false;
      this.unicodeDigits = '';
      return '__END__';
    }

    if (target === 'key' || target === 'value') {
      return char;
    }

    return null;
  }
}

export const buildRenderArtifactEvents = (
  artifactId: string,
  args: Record<string, unknown>,
): ChatServerToClientEvent[] => {
  const events: ChatServerToClientEvent[] = [
    { type: 'artifact_started', artifactId, callId: artifactId },
    {
      type: 'artifact_language',
      artifactId,
      language: 'html',
    },
  ];

  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (title) {
    events.push({ type: 'artifact_title', artifactId, title });
  }

  const code = typeof args.code === 'string' ? args.code : '';
  if (code) {
    events.push({
      type: 'artifact_code_delta',
      artifactId,
      delta: code,
    });
  }

  return events;
};
