import type { ChatTool } from '@/shared/chat/tool-types';
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';

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

    const hasCustomText = typeof answer.customText === 'string' && answer.customText.length > 0;

    if (answer.selectedOptionIndexes.length === 0 && !hasCustomText) {
      throw new Error(`Question ${index + 1} must have at least one selected option`);
    }

    if (
      !question.multiSelect &&
      answer.selectedOptionIndexes.length + (hasCustomText ? 1 : 0) !== 1
    ) {
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
    normalizeAskUserQuestionsAnswers(questions, answers).map((answer) => {
      const selectedOptions = answer.selectedOptionIndexes.map(
        (optionIndex) => questions[answer.questionIndex].options[optionIndex].label,
      );
      if (answer.customText) {
        selectedOptions.push(answer.customText);
      }
      return {
        header: questions[answer.questionIndex].header,
        question: questions[answer.questionIndex].question,
        selectedOptions,
      };
    }),
  );

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
