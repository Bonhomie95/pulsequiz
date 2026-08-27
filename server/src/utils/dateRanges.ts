/**
 * Period labels and ranges for leaderboards and payouts.
 *
 * Everything here is UTC. The previous implementation mixed a UTC cron
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
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(utc);
dayjs.extend(isoWeek);

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
  const iso = d.utc();
  return `${iso.isoWeekYear()}-W${String(iso.isoWeek()).padStart(2, '0')}`;
}

export function monthLabel(d: dayjs.Dayjs): string {
  return d.utc().format('YYYY-MM');
}

/** The period containing `at` (defaults to now). */
export function periodContaining(type: PeriodType, at: Date = new Date()): Period {
  const d = dayjs(at).utc();

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
 * UTC, which is already inside the new week.
 */
export function previousPeriod(type: PeriodType, at: Date = new Date()): Period {
  const d = dayjs(at).utc();
  const back = type === 'weekly' ? d.subtract(1, 'week') : d.subtract(1, 'month');
  return periodContaining(type, back.toDate());
}

/** Current-period label — for live leaderboards and "this week's pool" reads. */
export function currentPeriodLabel(type: PeriodType, at: Date = new Date()): string {
  return periodContaining(type, at).label;
}
