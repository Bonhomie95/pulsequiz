export type LeaderboardEntry = {
  id: string;
  name: string;
  points: number;
  isMe?: boolean;
};

export const LEADERBOARD_DATA = {
  weekly: [
    { id: '1', name: 'Alex', points: 1200 },
    { id: '2', name: 'Bella', points: 1100 },
    { id: '3', name: 'Chris', points: 980 },
    { id: '4', name: 'You', points: 920, isMe: true },
    { id: '5', name: 'Daniel', points: 880 },
  ],
  monthly: [],
  all: [],
};
