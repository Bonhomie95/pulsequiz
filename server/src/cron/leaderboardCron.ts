import cron from 'node-cron';
import { buildLeaderboard } from '../services/leaderboardService';

export function startLeaderboardCron() {
  // 🗓 Weekly — every Monday 00:05
  cron.schedule('5 0 * * 1', async () => {
    console.log('⏳ Building WEEKLY leaderboard...');
    await buildLeaderboard('weekly');
    console.log('✅ Weekly leaderboard built');
  });

  // 🗓 Monthly — 1st day of month 00:10
  cron.schedule('10 0 1 * *', async () => {
    console.log('⏳ Building MONTHLY leaderboard...');
    await buildLeaderboard('monthly');
    console.log('✅ Monthly leaderboard built');
  });

  // 🗓 All-time — once daily (cheap)
  cron.schedule('0 2 * * *', async () => {
    console.log('⏳ Building ALL-TIME leaderboard...');
    await buildLeaderboard('all');
    console.log('✅ All-time leaderboard built');
  });
}
