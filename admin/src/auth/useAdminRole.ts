import { useAdminStore } from '../store/adminStore';

export type AdminRole = 'SUPER_ADMIN' | 'MODERATOR';

/**
 * Role helpers for the admin UI.
 *
 * The server enforces these too — `requireRole` guards every money-touching
 * route. This just stops the UI offering a MODERATOR buttons that will come
 * back 403, which reads as a bug rather than a permission boundary.
 */
export function useAdminRole() {
  const role = useAdminStore((s) => s.admin?.role) ?? null;

  const isSuperAdmin = role === 'SUPER_ADMIN';

  return {
    role,
    isSuperAdmin,
    /** Triggering payouts, editing prize pools, retrying transfers. */
    canManagePayouts: isSuperAdmin,
    /** Changing the economy settings. */
    canEditSettings: isSuperAdmin,
    /** Adjusting balances, deleting accounts. */
    canEditUsers: isSuperAdmin,
    /** Clearing an anti-cheat flag, which re-enables that user's payouts. */
    canResolveFlags: isSuperAdmin,
    /** Reading the audit trail. */
    canViewAudit: isSuperAdmin,
  };
}

/** Wraps an action so the UI can explain why it's unavailable. */
export function roleTooltip(allowed: boolean): string | undefined {
  return allowed ? undefined : 'Requires a SUPER_ADMIN account';
}
