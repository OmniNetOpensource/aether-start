import { z } from 'zod';
import type { ChatTool } from '@/features/chat/agent-runtime/tool-types';

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
});

const AnswerSubmissionSchema = z.object({
  callId: z.string().trim().min(1),
  answers: z.array(AnswerSchema),
});

export type AskUserQuestionsOption = z.infer<typeof OptionSchema>;
export type AskUserQuestionsQuestion = z.infer<typeof QuestionSchema>;
export type AskUserQuestionsAnswer = z.output<typeof AnswerSchema>;

export type AskUserQuestionsBlockStatus = 'pending' | 'submitting' | 'answered';

export const parseAskUserQuestions = (value: Record<string, unknown>): AskUserQuestionsQuestion[] =>
  QuestionsPayloadSchema.parse(value).questions;

export const parseAskUserQuestionsAnswerSubmission = (
  value: Record<string, unknown>,
): { callId: string; answers: AskUserQuestionsAnswer[] } | null => {
  const result = AnswerSubmissionSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const normalizeAskUserQuestionsAnswers = (
  questions: AskUserQuestionsQuestion[],
  answers: AskUserQuestionsAnswer[],
) => {
  if (answers.length !== questions.length) {
    throw new Error('Every question must be answered exactly once');
  }

  const normalizedAnswers = [...answers].sort(
    (left, right) => left.questionIndex - right.questionIndex,
  );

  normalizedAnswers.forEach((answer, index) => {
    const question = questions[answer.questionIndex];
    if (!question) {
      throw new Error(`answers[${index}] references an unknown question`);
    }

    if (answer.questionIndex !== index) {
      throw new Error('Answers must cover every question exactly once');
    }

    if (answer.selectedOptionIndexes.length === 0) {
      throw new Error(`Question ${index + 1} must have at least one selected option`);
    }

    if (!question.multiSelect && answer.selectedOptionIndexes.length !== 1) {
      throw new Error(`Question ${index + 1} allows exactly one selected option`);
    }

    for (const optionIndex of answer.selectedOptionIndexes) {
      if (!question.options[optionIndex]) {
        throw new Error(`Question ${index + 1} references an unknown option`);
      }
    }
  });

  return normalizedAnswers;
};

export const buildAskUserQuestionsModelResult = (
  questions: AskUserQuestionsQuestion[],
  answers: AskUserQuestionsAnswer[],
) =>
  JSON.stringify(
    normalizeAskUserQuestionsAnswers(questions, answers).map((answer) => ({
      header: questions[answer.questionIndex].header,
      question: questions[answer.questionIndex].question,
      selectedOptions: answer.selectedOptionIndexes.map(
        (optionIndex) => questions[answer.questionIndex].options[optionIndex].label,
      ),
    })),
  );

export const cloneAskUserQuestions = (questions: AskUserQuestionsQuestion[]) =>
  questions.map((question) => ({
    header: question.header,
    question: question.question,
    multiSelect: question.multiSelect,
    options: question.options.map((option) => ({
      label: option.label,
      description: option.description,
    })),
  }));

export const cloneAskUserQuestionsAnswers = (answers: AskUserQuestionsAnswer[]) =>
  answers.map((answer) => ({
    questionIndex: answer.questionIndex,
    selectedOptionIndexes: [...answer.selectedOptionIndexes],
  }));

const askUserQuestionsToolSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'askuserquestions',
    description:
      'Ask the user a group of structured multiple-choice questions and wait for a single submission before continuing.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        questions: {
          type: 'array',
          description: 'A non-empty list of questions to show together in one card.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              header: {
                type: 'string',
                description: 'A short heading shown above the question.',
              },
              question: {
                type: 'string',
                description: 'The full question text.',
              },
              options: {
                type: 'array',
                description: 'Selectable options for the question.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    label: {
                      type: 'string',
                      description: 'Short option label.',
                    },
                    description: {
                      type: 'string',
                      description: 'A one-line explanation for the option.',
                    },
                  },
                  required: ['label', 'description'],
                },
              },
              multiSelect: {
                type: 'boolean',
                description: 'Whether the user may choose multiple options.',
              },
            },
            required: ['header', 'question', 'options', 'multiSelect'],
          },
        },
      },
      required: ['questions'],
    },
  },
};

export const askUserQuestionsTool = {
  spec: askUserQuestionsToolSpec,
};
