/**
 * Nightly coin-ledger reconciliation.
 *
 * Every wallet mutation is supposed to write a matching `CoinTransaction`, so
 * the sum of a user's deltas must equal their wallet balance. Several code
 * paths used to mutate the wallet directly and skip the ledger, which made the
 * ledger useless for investigating a disputed balance. Those are fixed, and
 * this job is what keeps them fixed.
 */
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import { logger } from '../utils/logger';

export interface ReconciliationReport {
  checked: number;
  drifted: number;
  samples: { userId: string; walletCoins: number; ledgerSum: number; drift: number }[];
}

export async function reconcileCoinLedger(
  options: { limit?: number } = {},
): Promise<ReconciliationReport> {
  const limit = options.limit ?? 50_000;

  // Sum the ledger per user in one pass.
  const sums = await CoinTransaction.aggregate<{ _id: any; total: number }>([
    { $group: { _id: '$userId', total: { $sum: '$delta' } } },
    { $limit: limit },
  ]);
  const ledgerByUser = new Map(sums.map((s) => [s._id.toString(), s.total]));

  const report: ReconciliationReport = { checked: 0, drifted: 0, samples: [] };

  const cursor = CoinWallet.find({}, { userId: 1, coins: 1 }).lean().cursor();

  for await (const wallet of cursor) {
    const userId = wallet.userId?.toString();
    if (!userId) continue;

    report.checked += 1;

    const ledgerSum = ledgerByUser.get(userId) ?? 0;
    const drift = (wallet.coins ?? 0) - ledgerSum;

    if (drift !== 0) {
      report.drifted += 1;
      if (report.samples.length < 50) {
        report.samples.push({
          userId,
          walletCoins: wallet.coins ?? 0,
          ledgerSum,
          drift,
        });
      }
    }
  }

  logger.info('Coin ledger reconciliation complete', {
    checked: report.checked,
    drifted: report.drifted,
  });

  return report;
}
