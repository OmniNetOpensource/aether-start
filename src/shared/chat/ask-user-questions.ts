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
  customText?: string;
};

export type AskUserQuestionsBlockStatus = 'pending' | 'submitting' | 'answered';

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
    customText: answer.customText,
  }));
