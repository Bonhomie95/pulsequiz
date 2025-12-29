import { api } from './api';

export const quizApi = {
  start: (category: string) => api.get('/quiz/start', { params: { category } }),

  answer: (payload: {
    sessionId: string;
    questionId: string;
    selected: number | null;
  }) => api.post('/quiz/answer', payload),

  finish: (sessionId: string) => api.post('/quiz/finish', { sessionId }),
};
