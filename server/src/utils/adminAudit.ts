import type { Request } from 'express';
import AdminAuditLog from '../models/AdminAuditLog';
import type { AdminRequest } from '../middlewares/requireAdmin';
import { logger } from './logger';

/**
 * Write an audit entry for a mutating admin action.
 *
 * Never throws — a logging failure must not roll back the action itself — but
 * failures are surfaced loudly, because a silent gap in the audit trail is
 * worth knowing about.
 */
export async function auditAdmin(
  req: Request,
  action: string,
  details: {
    targetType?: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  } = {},
): Promise<void> {
  const areq = req as AdminRequest;
  if (!areq.adminId) return;

  try {
    await AdminAuditLog.create({
      adminId: areq.adminId,
      adminEmail: areq.adminEmail ?? 'unknown',
      adminRole: areq.adminRole ?? 'unknown',
      action,
      targetType: details.targetType,
      targetId: details.targetId,
      before: details.before,
      after: details.after,
      ip: req.ip,
      requestId: (req as Request & { id?: string }).id,
    });
  } catch (err) {
    logger.error('Failed to write admin audit entry', err, { action });
  }
}
