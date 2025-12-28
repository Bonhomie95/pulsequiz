import dayjs from 'dayjs';

export function getWeeklyRange() {
  return {
    start: dayjs().startOf('week').toDate(),
    end: dayjs().endOf('week').toDate(),
  };
}

export function getMonthlyRange() {
  return {
    start: dayjs().startOf('month').toDate(),
    end: dayjs().endOf('month').toDate(),
  };
}
