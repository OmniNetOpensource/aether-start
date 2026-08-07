import { z } from 'zod';
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';

const OptionSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

const QuestionSchema = z.object({
  header: z.string().trim().min(1),
  question: z.string().trim().min(1),
  options: z.array(OptionSchema).min(1),
  multiSelect: z.boolean().default(false),
});

const QuestionsPayloadSchema = z.object({
  questions: z.array(QuestionSchema).min(1),
});

const AnswerSchema = z.object({
  questionIndex: z.int().nonnegative(),
  selectedOptionIndexes: z
    .array(z.int().nonnegative())
    .transform((arr) => [...new Set(arr)].sort((a, b) => a - b)),
  customText: z.string().trim().min(1).optional(),
});

const AnswerSubmissionSchema = z.object({
  callId: z.string().trim().min(1),
  answers: z.array(AnswerSchema),
});

export const parseAskUserQuestions = (value: Record<string, unknown>): AskUserQuestionsQuestion[] =>
  QuestionsPayloadSchema.parse(value).questions;

export const parseAskUserQuestionsAnswerSubmission = (
  value: Record<string, unknown>,
): { callId: string; answers: AskUserQuestionsAnswer[] } | null => {
  const result = AnswerSubmissionSchema.safeParse(value);
  return result.success ? result.data : null;
};
