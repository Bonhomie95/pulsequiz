/**
 * Regression: a phone whose clock ran ~15s fast ended every ranked run on
 * question 1. The countdown compared the server's absolute deadline against the
 * device clock, read "already expired", and fired the timeout ~600ms in — the
 * server recorded a plain `selected: null` and, in sudden death, the run was
 * over before the question could be read.
 */
import {
  clockSkewMs,
  deadlineFrom,
  noteServerDate,
  resetServerClock,
  serverNow,
} from '../serverClock';

const WINDOW = 15_000;

beforeEach(() => resetServerClock());

describe('noteServerDate', () => {
  it('measures how far the device clock is off', () => {
    const serverTime = new Date(Date.now() - 20_000); // device runs 20s fast
    noteServerDate(serverTime.toUTCString());
    // Second-granular header, so allow a second of slack.
    expect(clockSkewMs()).toBeLessThan(-19_000);
    expect(serverNow()).toBeLessThan(Date.now());
  });

  it('ignores a missing or unparseable header', () => {
    noteServerDate(undefined);
    noteServerDate('not a date');
    expect(clockSkewMs()).toBe(0);
  });
});

describe('deadlineFrom', () => {
  it('leaves a full question window on a fast device clock', () => {
    // Exactly the reported case: device 20s ahead, server issues now+15s.
    const serverIssued = new Date(Date.now() - 20_000 + WINDOW).toISOString();
    noteServerDate(new Date(Date.now() - 20_000).toUTCString());

    const remaining = deadlineFrom(serverIssued, WINDOW) - serverNow();
    expect(remaining).toBeGreaterThan(13_000);
  });

  it('never counts down to a deadline that has already passed', () => {
    const remaining = deadlineFrom(new Date(Date.now() - 60_000).toISOString(), WINDOW) - serverNow();
    expect(remaining).toBeGreaterThan(13_000);
  });

  it('honours a genuine server deadline', () => {
    const at = Date.now() + 9_000;
    expect(deadlineFrom(new Date(at).toISOString(), WINDOW)).toBe(at);
  });

  it('accepts the longer window of an unranked reveal pause', () => {
    const at = Date.now() + 21_000; // 15s question + 6s explanation pause
    expect(deadlineFrom(at, WINDOW)).toBe(at);
  });

  it('falls back when the value is missing or junk', () => {
    for (const bad of [null, undefined, 'tomorrow']) {
      const remaining = deadlineFrom(bad as never, WINDOW) - serverNow();
      expect(remaining).toBeGreaterThan(13_000);
    }
  });
});
