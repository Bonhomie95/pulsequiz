import { Schema, model } from 'mongoose';

export interface IQuizQuestion {
  category: string;
  question: string;
  options: string[];
  answer: number; // index of correct option
  difficulty: 'easy' | 'medium' | 'hard';
}

const QuizQuestionSchema = new Schema<IQuizQuestion>(
  {
    category: { type: String, index: true },
    question: { type: String, required: true },
    options: {
      type: [String],
      validate: (v: string[]) => v.length === 4,
      required: true,
    },
    answer: { type: Number, min: 0, max: 3, required: true },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
  },
  { timestamps: true }
);

QuizQuestionSchema.index({ category: 1, difficulty: 1 });

export default model<IQuizQuestion>('QuizQuestion', QuizQuestionSchema);
