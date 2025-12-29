import { Schema, model, Types } from 'mongoose';

export interface IUserQuestion {
  userId: Types.ObjectId;
  questionId: Types.ObjectId;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

const UserQuestionSchema = new Schema<IUserQuestion>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuizQuestion',
      required: true,
    },
    category: { type: String, required: true, index: true },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// One exposure per user per question
UserQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export default model<IUserQuestion>('UserQuestion', UserQuestionSchema);
