import {
  periodContaining,
  previousPeriod,
  weekLabel,
  monthLabel,
  PAYOUT_TZ,
} from '../utils/dateRanges';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

/**
 * Periods are measured on one wall clock — US Central — because that is where
 * most players are and a prize boundary has to land somewhere sensible for the
 * people it pays. These cover the payout scheduler's central bug (a period-end
 * job must settle the period that just CLOSED, never the one that just began)
 * and the boundary itself, which a UTC assumption gets wrong by five or six
 * hours.
 */
const CENTRAL = 'America/Chicago';

/** The instant of a given Central wall-clock time. */
function central(isoLocal: string): Date {
  return dayjs.tz(isoLocal, CENTRAL).toDate();
}

describe('the payout clock', () => {
  it('is US Central', () => {
    expect(PAYOUT_TZ).toBe(CENTRAL);
  });

  it('closes the week on Sunday midnight Central, not Sunday midnight UTC', () => {
    // A Sunday afternoon Central — the week has not closed yet.
    const sundayAfternoon = central('2026-02-22 15:00');
    const period = periodContaining('weekly', sundayAfternoon);

    expect(period.end.getTime()).toBeGreaterThan(sundayAfternoon.getTime());

    // It ends at 23:59:59.999 Central that same evening.
    const endCentral = dayjs(period.end).tz(CENTRAL);
    expect(endCentral.format('YYYY-MM-DD HH:mm')).toBe('2026-02-22 23:59');

    // Which is the next morning in UTC — early Monday for a European player,
    // exactly the intent.
    expect(period.end.toISOString().slice(0, 10)).toBe('2026-02-23');
  });

  it('still counts a Sunday evening Central as the closing week, where UTC would not', () => {
    // 2026-02-22 21:00 Central is 2026-02-23 03:00 UTC — already Monday in
    // UTC, so a UTC boundary would have moved these players into the next
    // week with three hours of their Sunday left.
    const lateSunday = central('2026-02-22 21:00');
    expect(lateSunday.toISOString()).toBe('2026-02-23T03:00:00.000Z');

    expect(periodContaining('weekly', lateSunday).label).toBe(
      periodContaining('weekly', central('2026-02-18 12:00')).label,
    );
  });
});

describe('previousPeriod', () => {
  it('returns the week that just ended when the cron fires Monday 00:05 Central', () => {
    const cronTime = central('2026-02-23 00:05');

    const current = periodContaining('weekly', cronTime);
    const settled = previousPeriod('weekly', cronTime);

    // The period the cron settles must NOT be the one that just began.
    expect(settled.label).not.toBe(current.label);

    // It must cover the seven days immediately before the cron fired.
    expect(settled.end.getTime()).toBeLessThan(cronTime.getTime());
    expect(dayjs(settled.start).tz(CENTRAL).format('YYYY-MM-DD HH:mm')).toBe(
      '2026-02-16 00:00',
    );
    expect(dayjs(settled.end).tz(CENTRAL).format('YYYY-MM-DD HH:mm')).toBe(
      '2026-02-22 23:59',
    );
  });

  it('returns the month that just ended when the cron fires on the 1st at 00:10 Central', () => {
    const cronTime = central('2026-03-01 00:10');

    const settled = previousPeriod('monthly', cronTime);

    expect(settled.label).toBe('2026-02');
    expect(dayjs(settled.start).tz(CENTRAL).format('YYYY-MM-DD')).toBe('2026-02-01');
    expect(settled.end.getTime()).toBeLessThan(cronTime.getTime());
  });

  it('handles the year boundary without producing a week-53 of the wrong year', () => {
    // 1 Jan 2027 is a Friday, still inside ISO week 53 of 2026.
    const newYear = central('2027-01-01 12:00');
    expect(periodContaining('weekly', newYear).label).toBe('2026-W53');
  });

  it('agrees with dayjs isoWeek read on the same clock', () => {
    // Payouts and challenges must label the same week identically; they used
    // to disagree, one hand-rolling the week number and one using dayjs.
    for (const iso of [
      '2026-01-01T12:00:00Z',
      '2026-02-23T06:05:00Z',
      '2026-06-15T12:00:00Z',
      '2026-12-31T23:59:00Z',
      '2027-01-03T12:00:00Z',
    ]) {
      const d = dayjs(iso).tz(CENTRAL);
      const expected = `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
      expect(weekLabel(dayjs(iso))).toBe(expected);
    }
  });
});

describe('periodContaining', () => {
  it('starts the week on Monday 00:00 Central', () => {
    const wednesday = central('2026-02-25 15:30');
    const period = periodContaining('weekly', wednesday);

    const startCentral = dayjs(period.start).tz(CENTRAL);
    expect(startCentral.format('YYYY-MM-DD HH:mm')).toBe('2026-02-23 00:00');
    expect(startCentral.day()).toBe(1); // Monday
  });

  it('computes month boundaries on the payout clock, not the server’s', () => {
    const period = periodContaining('monthly', central('2026-02-15 00:00'));

    expect(dayjs(period.start).tz(CENTRAL).format('YYYY-MM-DD')).toBe('2026-02-01');
    expect(monthLabel(dayjs(period.start))).toBe('2026-02');
    // February 2026 has 28 days.
    expect(dayjs(period.end).tz(CENTRAL).date()).toBe(28);
  });
});
