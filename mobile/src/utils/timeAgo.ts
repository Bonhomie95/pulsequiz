export function timeAgo(date?: string | Date | null) {
  if (!date) return '—';

  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.max(0, now - then);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  if (diff < week)
    return `${Math.floor(diff / day)} day${diff >= 2 * day ? 's' : ''} ago`;
  if (diff < month)
    return `${Math.floor(diff / week)} week${diff >= 2 * week ? 's' : ''} ago`;
  if (diff < year)
    return `${Math.floor(diff / month)} month${
      diff >= 2 * month ? 's' : ''
    } ago`;

  return `${Math.floor(diff / year)} year${diff >= 2 * year ? 's' : ''} ago`;
}
