import {
  periodContaining,
  previousPeriod,
  weekLabel,
  monthLabel,
} from '../utils/dateRanges';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(utc);
dayjs.extend(isoWeek);

/**
 * These cover the payout scheduler's central bug: the Monday-00:05 cron used to
 * derive its period from wall-clock, which described the week that had just
 * STARTED — so it looked up a prize pool that didn't exist and ranked five
 * minutes of play.
 */
describe('previousPeriod', () => {
  it('returns the week that just ended when run at Monday 00:05 UTC', () => {
    // Monday 2026-02-23 00:05 UTC — five minutes into a new ISO week.
    const cronTime = new Date('2026-02-23T00:05:00.000Z');

    const current = periodContaining('weekly', cronTime);
    const settled = previousPeriod('weekly', cronTime);

    // The period the cron settles must NOT be the one that just began.
    expect(settled.label).not.toBe(current.label);

    // It must cover the seven days immediately before the cron fired.
    expect(settled.end.getTime()).toBeLessThan(cronTime.getTime());
    expect(settled.start.toISOString()).toBe('2026-02-16T00:00:00.000Z');
    expect(settled.end.getTime()).toBeGreaterThan(
      new Date('2026-02-22T23:59:00.000Z').getTime(),
    );
  });

  it('returns the month that just ended when run on the 1st at 00:10 UTC', () => {
    const cronTime = new Date('2026-03-01T00:10:00.000Z');

    const settled = previousPeriod('monthly', cronTime);

    expect(settled.label).toBe('2026-02');
    expect(settled.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(settled.end.getTime()).toBeLessThan(cronTime.getTime());
  });

  it('handles the year boundary without producing a week-53 of the wrong year', () => {
    // 1 Jan 2027 is a Friday, still inside ISO week 53 of 2026.
    const newYear = new Date('2027-01-01T12:00:00.000Z');
    const current = periodContaining('weekly', newYear);

    expect(current.label).toBe('2026-W53');
  });

  it('agrees with dayjs isoWeek, which the challenge service uses', () => {
    // The two subsystems previously disagreed: payouts used a hand-rolled week
    // number and challenges used dayjs, so they could label the same week
    // differently.
    for (const iso of [
      '2026-01-01T00:00:00Z',
      '2026-02-23T00:05:00Z',
      '2026-06-15T12:00:00Z',
      '2026-12-31T23:59:00Z',
      '2027-01-03T00:00:00Z',
    ]) {
      const d = dayjs(iso).utc();
      const expected = `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
      expect(weekLabel(d)).toBe(expected);
    }
  });
});

describe('periodContaining', () => {
  it('starts the week on Monday 00:00 UTC', () => {
    const wednesday = new Date('2026-02-25T15:30:00.000Z');
    const period = periodContaining('weekly', wednesday);

    expect(period.start.toISOString()).toBe('2026-02-23T00:00:00.000Z');
    expect(period.start.getUTCDay()).toBe(1); // Monday
  });

  it('computes month boundaries in UTC, not server-local time', () => {
    const period = periodContaining('monthly', new Date('2026-02-15T00:00:00.000Z'));

    expect(period.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(monthLabel(dayjs(period.start).utc())).toBe('2026-02');
    // February 2026 has 28 days.
    expect(period.end.getUTCDate()).toBe(28);
  });
});
