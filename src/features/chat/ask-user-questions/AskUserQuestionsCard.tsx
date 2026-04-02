import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsBlockStatus,
} from '@/features/chat/ask-user-questions/ask-user-questions';
import type { AssistantMessage } from '@/features/chat/message-thread';
import { Button } from '@/shared/design-system/button';

type AskUserQuestionsBlock = Extract<
  AssistantMessage['blocks'][number],
  { type: 'ask_user_questions' }
>;

type AskUserQuestionsCardProps = {
  block: AskUserQuestionsBlock;
  readonly?: boolean;
  onSubmit?: (answers: AskUserQuestionsAnswer[]) => Promise<void>;
};

const getStatusLabel = (status: AskUserQuestionsBlockStatus, readonly: boolean) => {
  if (readonly) {
    return '只读';
  }

  if (status === 'answered') {
    return '已提交';
  }

  if (status === 'submitting') {
    return '提交中';
  }

  return '等待回答';
};

const toAnswerMap = (answers: AskUserQuestionsAnswer[]) => {
  const nextAnswers: Record<number, number[]> = {};

  for (const answer of answers) {
    nextAnswers[answer.questionIndex] = [...answer.selectedOptionIndexes];
  }

  return nextAnswers;
};

export function AskUserQuestionsCard({
  block,
  readonly = false,
  onSubmit,
}: AskUserQuestionsCardProps) {
  const [draftAnswers, setDraftAnswers] = useState(() => toAnswerMap(block.answers));
  const [currentPage, setCurrentPage] = useState(0);
  const answerMap = block.status === 'answered' ? toAnswerMap(block.answers) : draftAnswers;
  const isLocked = readonly || block.status !== 'pending';
  const canSubmit =
    !isLocked &&
    block.questions.every((_, questionIndex) => (answerMap[questionIndex] ?? []).length > 0);

  const question = block.questions[currentPage];
  const selectedOptionIndexes = answerMap[currentPage] ?? [];
  const totalPages = block.questions.length;

  const handleOptionChange = (questionIndex: number, optionIndex: number, multiSelect: boolean) => {
    if (isLocked) {
      return;
    }

    setDraftAnswers((current) => {
      const selected = current[questionIndex] ?? [];

      if (!multiSelect) {
        return { ...current, [questionIndex]: [optionIndex] };
      }

      const nextSelection = selected.includes(optionIndex)
        ? selected.filter((i) => i !== optionIndex)
        : [...selected, optionIndex].sort((a, b) => a - b);

      return { ...current, [questionIndex]: nextSelection };
    });
  };

  const handleSubmit = async () => {
    if (!onSubmit || !canSubmit) {
      return;
    }

    await onSubmit(
      block.questions.map((_, questionIndex) => ({
        questionIndex,
        selectedOptionIndexes: answerMap[questionIndex] ?? [],
      })),
    );
  };

  return (
    <section
      data-testid='ask-user-questions-card'
      className='overflow-hidden rounded-md border border-border bg-surface text-foreground shadow-xs'
    >
      <div className='flex items-start justify-between gap-3 border-b border-border px-4 py-3.5'>
        <div className='min-w-0'>
          <p className='text-[13px] font-medium leading-snug tracking-tight'>
            需要你先回答这组问题
          </p>
          <p className='mt-1 text-xs leading-5 text-secondary'>
            回答后，这条 assistant 消息会继续往下生成。
          </p>
        </div>
        <span className='shrink-0 rounded border border-border px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground'>
          {getStatusLabel(block.status, readonly)}
        </span>
      </div>

      <fieldset key={`${block.callId}-${currentPage}`} disabled={isLocked} className='min-w-0'>
        <div className='space-y-1 px-4 pt-4'>
          <p className='text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground'>
            {question.header}
          </p>
          <p className='text-[13px] font-medium leading-snug text-foreground'>
            {question.question}
          </p>
        </div>

        <div className='mt-3 overflow-hidden rounded-md border border-border bg-background mx-4'>
          {question.options.map((option, optionIndex) => {
            const inputId = `${block.callId}-${currentPage}-${optionIndex}`;

            return (
              <label
                key={inputId}
                htmlFor={inputId}
                className='flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 transition-[background-color,border-color] duration-150 ease-[var(--ease-out)] last:border-b-0 hover:bg-hover has-[:checked]:bg-hover has-[:checked]:shadow-[inset_2px_0_0_0_var(--color-primary)]'
              >
                <input
                  id={inputId}
                  name={`${block.callId}-${currentPage}`}
                  type={question.multiSelect ? 'checkbox' : 'radio'}
                  checked={selectedOptionIndexes.includes(optionIndex)}
                  disabled={isLocked}
                  onChange={() =>
                    handleOptionChange(currentPage, optionIndex, question.multiSelect)
                  }
                  className='mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary'
                />
                <span className='min-w-0 pl-0.5'>
                  <span className='block text-[13px] font-medium leading-snug text-foreground'>
                    {option.label}
                  </span>
                  <span className='mt-0.5 block text-xs leading-relaxed text-secondary'>
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {block.status === 'answered' && (
          <div className='mx-4 mt-3 flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-secondary'>
            <CheckCircle2 className='mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            <span>
              已选：
              {selectedOptionIndexes
                .map((optionIndex) => question.options[optionIndex].label)
                .join('、')}
            </span>
          </div>
        )}
      </fieldset>

      <div className='mt-4 flex items-center justify-between gap-3 border-t border-border px-4 py-3'>
        <div className='flex items-center gap-1'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => p - 1)}
            aria-label='上一题'
          >
            <ChevronLeft className='h-4 w-4 text-secondary' />
          </Button>
          <span className='min-w-[3.25rem] text-center text-[11px] tabular-nums text-muted-foreground'>
            {currentPage + 1} / {totalPages}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={currentPage === totalPages - 1}
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label='下一题'
          >
            <ChevronRight className='h-4 w-4 text-secondary' />
          </Button>
        </div>

        {!readonly && (
          <Button type='button' disabled={!canSubmit} onClick={() => void handleSubmit()} size='sm'>
            {block.status === 'submitting' ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' />
                提交中
              </>
            ) : (
              '提交回答'
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
