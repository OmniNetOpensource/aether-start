import { createSignal, For } from 'solid-js';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from '@/shared/design-system/icons';
import type { AskUserQuestionsAnswer } from '@/features/chat/ask-user-questions/ask-user-questions';
import type { AssistantMessage } from '@/features/chat/message-thread';
import { Button } from '@/shared/design-system/button';
import { Textarea } from '@/shared/design-system/textarea';

type AskUserQuestionsBlock = Extract<
  AssistantMessage['blocks'][number],
  { type: 'ask_user_questions' }
>;

type AskUserQuestionsCardProps = {
  block: AskUserQuestionsBlock;
  readonly?: boolean;
  onSubmit?: (answers: AskUserQuestionsAnswer[]) => Promise<void>;
};

type DraftAnswer = {
  selectedOptionIndexes: number[];
  customSelected: boolean;
  customText: string;
};

const toDraftAnswers = (answers: AskUserQuestionsAnswer[]) => {
  const draft: Record<number, DraftAnswer> = {};
  for (const answer of answers) {
    const customText = answer.customText ?? '';
    draft[answer.questionIndex] = {
      selectedOptionIndexes: [...answer.selectedOptionIndexes],
      customSelected: customText.length > 0,
      customText,
    };
  }
  return draft;
};

const getDraft = (draftAnswers: Record<number, DraftAnswer>, questionIndex: number): DraftAnswer =>
  draftAnswers[questionIndex] ?? {
    selectedOptionIndexes: [],
    customSelected: false,
    customText: '',
  };

const isDraftReady = (draft: DraftAnswer) =>
  draft.selectedOptionIndexes.length > 0 ||
  (draft.customSelected && draft.customText.trim().length > 0);

const customValue = 'custom';
const optionValue = (optionIndex: number) => `option-${optionIndex}`;
const getOptionIndex = (value: string) =>
  value.startsWith('option-') ? Number(value.slice('option-'.length)) : null;
const isOptionIndex = (
  optionIndex: number | null,
  question: AskUserQuestionsBlock['questions'][number],
): optionIndex is number => optionIndex !== null && Boolean(question.options[optionIndex]);

export function AskUserQuestionsCard(props: AskUserQuestionsCardProps) {
  const [draftAnswers, setDraftAnswers] = createSignal(toDraftAnswers(props.block.answers));
  const [currentPage, setCurrentPage] = createSignal(0);
  const answerSource = () =>
    props.block.status === 'answered' ? toDraftAnswers(props.block.answers) : draftAnswers();
  const isLocked = () => (props.readonly ?? false) || props.block.status !== 'pending';
  const canSubmit = () =>
    !isLocked() &&
    props.block.questions.every((_, questionIndex) =>
      isDraftReady(getDraft(answerSource(), questionIndex)),
    );
  const question = () => props.block.questions[currentPage()];
  const draft = () => getDraft(answerSource(), currentPage());
  const selectedValues = () => [
    ...draft().selectedOptionIndexes.map(optionValue),
    ...(draft().customSelected ? [customValue] : []),
  ];

  const handleSelectionChange = (values: string[]) => {
    if (isLocked()) {
      return;
    }

    const nextValues = question().multiSelect
      ? values
      : values.filter((value) => !selectedValues().includes(value)).slice(-1);

    const nextOptionIndexes = nextValues
      .map(getOptionIndex)
      .filter((optionIndex) => isOptionIndex(optionIndex, question()))
      .sort((left, right) => left - right);
    const nextCustomSelected = nextValues.includes(customValue);

    setDraftAnswers((current) => {
      const existing = getDraft(current, currentPage());

      return {
        ...current,
        [currentPage()]: {
          selectedOptionIndexes: nextOptionIndexes,
          customSelected: nextCustomSelected,
          customText: existing.customText,
        },
      };
    });
  };

  const handleCustomTextChange = (text: string) => {
    if (isLocked()) {
      return;
    }

    setDraftAnswers((current) => {
      const existing = getDraft(current, currentPage());
      return {
        ...current,
        [currentPage()]: {
          ...existing,
          selectedOptionIndexes:
            question().multiSelect || text.length === 0 ? existing.selectedOptionIndexes : [],
          customText: text,
          customSelected: existing.customSelected || text.length > 0,
        },
      };
    });
  };

  const handleSubmit = async () => {
    if (!props.onSubmit || !canSubmit()) {
      return;
    }

    await props.onSubmit(
      props.block.questions.map((_, questionIndex) => {
        const item = getDraft(answerSource(), questionIndex);
        const trimmed = item.customText.trim();
        return {
          questionIndex,
          selectedOptionIndexes: item.selectedOptionIndexes,
          customText: item.customSelected && trimmed.length > 0 ? trimmed : undefined,
        };
      }),
    );
  };

  return (
    <section
      data-testid='ask-user-questions-card'
      class='overflow-hidden rounded-md border border-border bg-surface text-foreground shadow-xs'
    >
      <fieldset disabled={isLocked()} class='min-w-0'>
        <div class='space-y-1 px-4 pt-4'>
          <p class='text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground'>
            {question().header}
          </p>
          <p class='text-[13px] font-medium leading-snug text-foreground'>{question().question}</p>
        </div>

        <div class='mx-4 mt-3 gap-0 overflow-hidden rounded-md border border-border bg-background'>
          <For each={question().options}>
            {(option, optionIndex) => {
              const value = () => optionValue(optionIndex());
              const selected = () => selectedValues().includes(value());
              return (
                <label
                  data-selected={selected() ? '' : undefined}
                  class='group flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)] hover:bg-hover data-[selected]:bg-hover data-[selected]:shadow-[inset_2px_0_0_0_var(--color-primary)]'
                >
                  <input
                    type='checkbox'
                    class='sr-only'
                    checked={selected()}
                    disabled={isLocked()}
                    onChange={() =>
                      handleSelectionChange(
                        selected()
                          ? selectedValues().filter((item) => item !== value())
                          : [...selectedValues(), value()],
                      )
                    }
                  />
                  <span class='mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-border bg-background text-background group-data-[selected]:border-primary group-data-[selected]:bg-primary group-data-[selected]:text-background'>
                    {selected() && <Check class='h-3 w-3' stroke-width={3} />}
                  </span>
                  <span class='min-w-0 pl-0.5'>
                    <span class='block text-[13px] font-medium leading-snug text-foreground'>
                      {option.label}
                    </span>
                    <span class='mt-0.5 block text-xs leading-relaxed text-secondary'>
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            }}
          </For>

          <label
            data-selected={draft().customSelected ? '' : undefined}
            class='group flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)] hover:bg-hover data-[selected]:bg-hover data-[selected]:shadow-[inset_2px_0_0_0_var(--color-primary)]'
          >
            <input
              type='checkbox'
              class='sr-only'
              checked={draft().customSelected}
              disabled={isLocked()}
              onChange={() =>
                handleSelectionChange(
                  draft().customSelected
                    ? selectedValues().filter((item) => item !== customValue)
                    : [...selectedValues(), customValue],
                )
              }
            />
            <span class='mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-border bg-background text-background group-data-[selected]:border-primary group-data-[selected]:bg-primary group-data-[selected]:text-background'>
              {draft().customSelected && <Check class='h-3 w-3' stroke-width={3} />}
            </span>
            <span class='min-w-0 flex-1 pl-0.5'>
              <span class='block text-[13px] font-medium leading-snug text-foreground'>
                自己回答
              </span>
              <span class='mt-0.5 block text-xs leading-relaxed text-secondary'>
                输入自定义答案
              </span>
              <Textarea
                value={draft().customText}
                disabled={isLocked()}
                placeholder='输入你的回答...'
                rows={2}
                onChange={(event) => handleCustomTextChange(event.currentTarget.value)}
                class='mt-2 resize-none rounded border border-border bg-background px-2 py-1.5 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground focus:border-primary'
              />
            </span>
          </label>
        </div>

        {props.block.status === 'answered' && (
          <div class='mx-4 mt-3 flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-secondary'>
            <CheckCircle2 class='mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            <span>
              已选：
              {[
                ...draft().selectedOptionIndexes.map(
                  (optionIndex) => question().options[optionIndex].label,
                ),
                ...(draft().customSelected && draft().customText ? [draft().customText] : []),
              ].join('、')}
            </span>
          </div>
        )}
      </fieldset>

      <div class='mt-4 flex items-center justify-between gap-3 border-t border-border px-4 py-3'>
        <div class='flex items-center gap-1'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={currentPage() === 0}
            onClick={() => setCurrentPage((p) => p - 1)}
            aria-label='上一题'
          >
            <ChevronLeft class='h-4 w-4 text-secondary' />
          </Button>
          <span class='min-w-[3.25rem] text-center text-[11px] tabular-nums text-muted-foreground'>
            {currentPage() + 1} / {props.block.questions.length}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={currentPage() === props.block.questions.length - 1}
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label='下一题'
          >
            <ChevronRight class='h-4 w-4 text-secondary' />
          </Button>
        </div>

        <Button type='button' disabled={!canSubmit()} onClick={() => void handleSubmit()} size='sm'>
          {props.block.status === 'submitting' ? (
            <>
              <Loader2 class='h-4 w-4 animate-spin' />
              提交中
            </>
          ) : props.block.status === 'answered' ? (
            '已提交'
          ) : (
            '提交回答'
          )}
        </Button>
      </div>
    </section>
  );
}
