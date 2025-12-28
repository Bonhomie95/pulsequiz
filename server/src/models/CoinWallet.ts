import { Schema, model, Types } from 'mongoose';

export interface ICoinWallet {
  userId: Types.ObjectId;
  coins: number;
  updatedAt: Date;
}

const CoinWalletSchema = new Schema<ICoinWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
    coins: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model<ICoinWallet>('CoinWallet', CoinWalletSchema);
