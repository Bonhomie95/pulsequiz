import { Schema, model } from 'mongoose';

export interface IQuizQuestion {
  category: string;
  question: string;
  options: string[];
  answer: number; // index of correct option
  difficulty: 'easy' | 'medium' | 'hard';

  /** Normalised question text, used to detect near-duplicates on import. */
  fingerprint: string;

  /** Live difficulty calibration, updated from real answer rates. */
  timesServed: number;
  timesCorrect: number;

  /** Player reports of a wrong or unclear question. */
  reportCount: number;
  /** Hidden from selection pending review. */
  disabled: boolean;
}

/**
 * A stable key for "is this the same question".
 *
 * Lowercased, punctuation stripped, whitespace collapsed — so "What is 7 x 8?"
 * and "what is 7 x 8" collide on import instead of both being served.
 */
export function fingerprintQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    fingerprint: { type: String, required: true },
    timesServed: { type: Number, default: 0 },
    timesCorrect: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Derive the fingerprint automatically so no write path can forget it.
QuizQuestionSchema.pre('validate', function () {
  if (this.isModified('question') || !this.fingerprint) {
    this.fingerprint = fingerprintQuestion(this.question ?? '');
  }
});

QuizQuestionSchema.index({ category: 1, difficulty: 1, disabled: 1 });
// One phrasing of a question per category.
QuizQuestionSchema.index({ category: 1, fingerprint: 1 }, { unique: true });
QuizQuestionSchema.index({ reportCount: -1 });

export default model<IQuizQuestion>('QuizQuestion', QuizQuestionSchema);
