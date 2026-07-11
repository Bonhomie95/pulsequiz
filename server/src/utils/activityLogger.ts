import UserActivity from '../models/UserActivity';

export type ActivityType =
  | 'QUIZ_START'
  | 'QUIZ_FINISH'
  | 'PURCHASE'
  | 'CHECK_IN'
  | 'PROFILE_UPDATE'
  | 'BAN';

export async function logActivity(
  userId: string,
  type: ActivityType,
  meta: Record<string, unknown> = {},
) {
  try {
    await UserActivity.create({ userId, type, meta });
  } catch {}
}
