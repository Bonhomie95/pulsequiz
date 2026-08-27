import { timeAgo } from '../timeAgo';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  it('handles empty input', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(undefined)).toBe('—');
  });

  it('formats recent times', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 10 * 1000))).toBe('Just now');
    expect(timeAgo(new Date(now - 5 * MIN))).toBe('5 min ago');
    expect(timeAgo(new Date(now - 3 * HOUR))).toBe('3 hr ago');
  });

  it('pluralizes day units', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 1 * DAY))).toBe('1 day ago');
    expect(timeAgo(new Date(now - 3 * DAY))).toBe('3 days ago');
  });

  it('clamps future dates to "Just now"', () => {
    expect(timeAgo(new Date(Date.now() + 10000))).toBe('Just now');
  });
});
