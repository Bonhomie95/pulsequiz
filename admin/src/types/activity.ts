export type ActivityType =
  | 'QUIZ_START'
  | 'QUIZ_FINISH'
  | 'PURCHASE'
  | 'CHECK_IN'
  | 'PROFILE_UPDATE'
  | 'BAN';

export interface ActivityUser {
  _id: string;
  username: string;
  email?: string;
}

export interface ActivityItem {
  _id: string;
  userId: ActivityUser;
  type: ActivityType;
  meta?: Record<string, unknown>;
  createdAt: string;
}
