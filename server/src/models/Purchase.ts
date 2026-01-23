import { Schema, model, Types } from 'mongoose';

type Store = 'apple' | 'google';
type PurchaseState =
  | 'PENDING'
  | 'CREDITED'
  | 'REJECTED'
  | 'REFUNDED';

const PurchaseSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    store: { type: String, enum: ['apple', 'google'], required: true },

    sku: { type: String, required: true, index: true }, // pq_coins_500 etc.
    coins: { type: Number, required: true }, // server-mapped coins
    priceUsd: { type: Number, required: true }, // server-mapped

    // Store-unique identifiers (ONE of these per store)
    appleTransactionId: { type: String, index: true, sparse: true },
    googlePurchaseToken: { type: String, index: true, sparse: true },

    // canonical unique key to prevent double-spend
    uniqueKey: { type: String, unique: true, required: true }, // e.g. `apple:<txId>` or `google:<token>`

    state: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'CREDITED', 'REJECTED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },

    // verification snapshot (store response / signed payload)
    verifiedAt: { type: Date, default: null },
    raw: { type: Schema.Types.Mixed, default: null },

    // crediting
    creditedAt: { type: Date, default: null },
    creditedCoins: { type: Number, default: 0 },

    // anti-replay / security
    deviceId: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true },
);

PurchaseSchema.index(
  { store: 1, appleTransactionId: 1 },
  { unique: true, sparse: true },
);

PurchaseSchema.index(
  { store: 1, googlePurchaseToken: 1 },
  { unique: true, sparse: true },
);


export default model('Purchase', PurchaseSchema);
