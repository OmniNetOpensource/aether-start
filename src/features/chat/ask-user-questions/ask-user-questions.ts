import type { ChatTool } from '@/features/chat/agent-runtime/tool-types';

export type AskUserQuestionsOption = {
  label: string;
  description: string;
};

export type AskUserQuestionsQuestion = {
  header: string;
  question: string;
  options: AskUserQuestionsOption[];
  multiSelect: boolean;
};

export type AskUserQuestionsAnswer = {
  questionIndex: number;
  selectedOptionIndexes: number[];
};

export type AskUserQuestionsBlockStatus = 'pending' | 'submitting' | 'answered';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readNonEmptyString = (value: unknown, field: string) => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const nextValue = value.trim();
  if (!nextValue) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return nextValue;
};

const normalizeIndexes = (value: unknown, field: string) => {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  const indexes = value.map((item) => {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0) {
      throw new Error(`${field} must contain non-negative integers`);
    }

    return item;
  });

  const uniqueIndexes = [...new Set(indexes)];
  if (uniqueIndexes.length !== indexes.length) {
    throw new Error(`${field} contains duplicate indexes`);
  }

  return uniqueIndexes.sort((left, right) => left - right);
};

export const parseAskUserQuestions = (value: unknown): AskUserQuestionsQuestion[] => {
  if (!isRecord(value)) {
    throw new Error('askuserquestions requires an object payload');
  }

  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    throw new Error('askuserquestions requires a non-empty questions array');
  }

  return value.questions.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`questions[${index}] must be an object`);
    }

    if (!Array.isArray(item.options) || item.options.length === 0) {
      throw new Error(`questions[${index}].options must be a non-empty array`);
    }

    return {
      header: readNonEmptyString(item.header, `questions[${index}].header`),
      question: readNonEmptyString(item.question, `questions[${index}].question`),
      options: item.options.map((option, optionIndex) => {
        if (!isRecord(option)) {
          throw new Error(`questions[${index}].options[${optionIndex}] must be an object`);
        }

        return {
          label: readNonEmptyString(
            option.label,
            `questions[${index}].options[${optionIndex}].label`,
          ),
          description: readNonEmptyString(
            option.description,
            `questions[${index}].options[${optionIndex}].description`,
          ),
        };
      }),
      multiSelect: item.multiSelect === true,
    };
  });
};

export const parseAskUserQuestionsAnswerSubmission = (
  value: unknown,
): { callId: string; answers: AskUserQuestionsAnswer[] } | null => {
  if (!isRecord(value)) {
    return null;
  }

  const callId = typeof value.callId === 'string' ? value.callId.trim() : '';
  if (!callId || !Array.isArray(value.answers)) {
    return null;
  }

  try {
    return {
      callId,
      answers: value.answers.map((answer, index) => {
        if (!isRecord(answer)) {
          throw new Error(`answers[${index}] must be an object`);
        }

        const questionIndex = answer.questionIndex;
        if (
          typeof questionIndex !== 'number' ||
          !Number.isInteger(questionIndex) ||
          questionIndex < 0
        ) {
          throw new Error(`answers[${index}].questionIndex must be a non-negative integer`);
        }

        return {
          questionIndex,
          selectedOptionIndexes: normalizeIndexes(
            answer.selectedOptionIndexes,
            `answers[${index}].selectedOptionIndexes`,
          ),
        };
      }),
    };
  } catch {
    return null;
  }
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
