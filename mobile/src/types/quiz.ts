export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  difficulty: 'easy' | 'medium' | 'hard';
};

export type QuizStartResponse = {
  sessionId: string;
  timePerQuestion: number;
  totalQuestions: number;
  expiresAt: string;
  questions: QuizQuestion[];
};
