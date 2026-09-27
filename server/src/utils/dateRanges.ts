/**
 * Period labels and ranges for leaderboards and payouts.
 *
 * Everything here runs on one wall clock: America/Chicago (CST/CDT).
 *
 * Prizes are paid on a period boundary, and a boundary has to land somewhere
 * sensible for the people it pays. Most players are in the US, so a week now
 * closes Sunday midnight Central — late Sunday evening on the US west coast,
 * early Monday morning in Europe. It was UTC, which closes a US Sunday at
 * 7pm Eastern, mid-afternoon on the Pacific coast, cutting the last day of
 * the week short for exactly the people most likely to be playing it.
 *
 * Set PAYOUT_TZ to override; everything (labels, ranges and the cron that
 * fires on them) reads the same value, so they cannot drift apart. The previous implementation mixed a UTC cron
 * schedule with `setHours` (server-local) range math and a hand-rolled ISO
 * week number that disagreed with the dayjs `isoWeek` used elsewhere — so the
 * weekly payout job looked up a prize pool for the week that had just *begun*
 * and ranked five minutes of play.
 *
 * The rule: a period-end job always operates on the period that just CLOSED,
 * so callers pass the period explicitly rather than letting each function
 * re-derive "now".
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

/** The wall clock every period boundary is measured on. */
export const PAYOUT_TZ = process.env.PAYOUT_TZ || 'America/Chicago';

export type PeriodType = 'weekly' | 'monthly';

export interface Period {
  type: PeriodType;
  label: string;
  start: Date;
  end: Date;
}

/** ISO-8601 week label, e.g. "2026-W08". Uses the ISO week-year, so the days
 *  around New Year land in the correct week rather than the calendar year. */
export function weekLabel(d: dayjs.Dayjs): string {
  const iso = d.tz(PAYOUT_TZ);
  return `${iso.isoWeekYear()}-W${String(iso.isoWeek()).padStart(2, '0')}`;
}

export function monthLabel(d: dayjs.Dayjs): string {
  return d.tz(PAYOUT_TZ).format('YYYY-MM');
}

/** The period containing `at` (defaults to now). */
export function periodContaining(type: PeriodType, at: Date = new Date()): Period {
  const d = dayjs(at).tz(PAYOUT_TZ);

  if (type === 'weekly') {
    const start = d.startOf('isoWeek');
    return {
      type,
      label: weekLabel(start),
      start: start.toDate(),
      end: start.endOf('isoWeek').toDate(),
    };
  }

  const start = d.startOf('month');
  return {
    type,
    label: monthLabel(start),
    start: start.toDate(),
    end: start.endOf('month').toDate(),
  };
}

/**
 * The period immediately BEFORE the one containing `at`.
 *
 * This is what a period-end cron must use: the weekly job fires Monday 00:05
 * Central, which is already inside the new week.
 */
export function previousPeriod(type: PeriodType, at: Date = new Date()): Period {
  const d = dayjs(at).tz(PAYOUT_TZ);
  const back = type === 'weekly' ? d.subtract(1, 'week') : d.subtract(1, 'month');
  return periodContaining(type, back.toDate());
}

/** Current-period label — for live leaderboards and "this week's pool" reads. */
export function currentPeriodLabel(type: PeriodType, at: Date = new Date()): string {
  return periodContaining(type, at).label;
}
