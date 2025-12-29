import { Schema, model, Types } from 'mongoose';

export interface IQuizSession {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  category: string;
  score: number;
  bonus: number;
  totalPoints: number;
  correctAnswers: number;
  totalQuestions: number;
  levelAtTime: number;
  createdAt: Date;
}

const QuizSessionSchema = new Schema<IQuizSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ActiveQuizSession',
      required: true,
      index: true,
    },
    category: { type: String, required: true, index: true },
    score: { type: Number, required: true },
    bonus: { type: Number, default: 0 },
    totalPoints: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    levelAtTime: { type: Number, required: true },
  },
  { timestamps: true }
);

export default model<IQuizSession>('QuizSession', QuizSessionSchema);
