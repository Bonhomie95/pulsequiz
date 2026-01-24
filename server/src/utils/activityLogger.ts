import UserActivity from '../models/UserActivity';

export async function logActivity(
  userId: string,
  type: string,
  meta: any = {},
) {
  try {
    await UserActivity.create({ userId, type, meta });
  } catch {}
}
