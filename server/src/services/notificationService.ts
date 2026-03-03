import axios from 'axios';
import PushToken from '../models/PushToken';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'default' | 'normal' | 'high';
  sound?: 'default' | null;
}

async function sendExpoPush(messages: ExpoPushMessage[]) {
  if (!messages.length) return;
  try {
    await axios.post(EXPO_PUSH_URL, messages, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

async function getUserToken(userId: string): Promise<string | null> {
  const doc = await PushToken.findOne({ userId }).lean();
  return doc?.token ?? null;
}

export async function sendPayoutNotification(userId: string | any, amount: number) {
  const token = await getUserToken(userId.toString());
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '💰 Prize Sent!',
    body: `Your $${amount.toFixed(2)} USDT prize is on its way to your wallet!`,
    data: { type: 'payout', amount },
    priority: 'high',
    sound: 'default',
  }]);
}

export async function sendAddressWarningNotifications(userId: string, rank: number) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '⚠️ ACTION REQUIRED — Confirm Your USDT Address',
    body: `You are ranked #${rank} this week. Confirm your USDT address before Saturday or you may forfeit your prize!`,
    data: { type: 'address_warning', rank },
    priority: 'high',
    sound: 'default',
  }]);
}

export async function sendStreakWarning(userId: string, streakDays: number) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '🔥 Streak at Risk!',
    body: `Your ${streakDays}-day streak expires tonight. Log in now to keep it alive!`,
    data: { type: 'streak_warning' },
    priority: 'high',
    sound: 'default',
  }]);
}

export async function sendLeaderboardReminder(userId: string, rank: number) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '🏆 Leaderboard Resets Tonight!',
    body: `You are ranked #${rank} this week. Play now to climb before the reset!`,
    data: { type: 'leaderboard_reminder', rank },
    priority: 'normal',
    sound: 'default',
  }]);
}

export async function sendPvpChallenge(userId: string, challengerUsername: string) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '⚔️ PvP Challenge!',
    body: `${challengerUsername} challenged you to a quiz battle!`,
    data: { type: 'pvp_challenge', challenger: challengerUsername },
    priority: 'high',
    sound: 'default',
  }]);
}

export async function sendRoomInvite(userId: string, hostUsername: string, code: string) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '🎮 Room Invite!',
    body: `${hostUsername} created a room. Join with code: ${code}`,
    data: { type: 'room_invite', code, host: hostUsername },
    priority: 'high',
    sound: 'default',
  }]);
}

export async function sendNewChallengesNotification(userIds: string[]) {
  const tokens = await PushToken.find({ userId: { $in: userIds } }).lean();
  const messages: ExpoPushMessage[] = (tokens as any[]).map((t) => ({
    to: t.token,
    title: '🎯 New Challenges Available!',
    body: 'Your daily challenges are waiting. Complete them to earn coins!',
    data: { type: 'new_challenges' },
    priority: 'normal',
    sound: 'default',
  }));
  await sendExpoPush(messages);
}

export async function sendTournamentStarting(userIds: string[], tournamentTitle: string) {
  const tokens = await PushToken.find({ userId: { $in: userIds } }).lean();
  const messages: ExpoPushMessage[] = (tokens as any[]).map((t) => ({
    to: t.token,
    title: '🏆 Tournament Starting Soon!',
    body: `"${tournamentTitle}" starts in 1 hour. Are you ready?`,
    data: { type: 'tournament_starting' },
    priority: 'high',
    sound: 'default',
  }));
  await sendExpoPush(messages);
}

export async function sendFriendRequestNotification(userId: string, requesterUsername: string) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '👥 New Friend Request',
    body: `${requesterUsername} wants to be your friend!`,
    data: { type: 'friend_request', requester: requesterUsername },
    priority: 'normal',
    sound: 'default',
  }]);
}

export async function sendFriendAcceptedNotification(userId: string, accepterUsername: string) {
  const token = await getUserToken(userId);
  if (!token) return;
  await sendExpoPush([{
    to: token,
    title: '✅ Friend Request Accepted',
    body: `${accepterUsername} accepted your friend request!`,
    data: { type: 'friend_accepted', accepter: accepterUsername },
    priority: 'normal',
    sound: 'default',
  }]);
}
