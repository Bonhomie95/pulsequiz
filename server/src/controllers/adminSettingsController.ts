import { Request, Response } from 'express';
import AppSettings, {
  setSetting,
  clearSettingsCache,
  NUMERIC_SETTINGS,
  SETTING_LIMITS,
  SETTINGS_KEYS,
} from '../models/AppSettings';
import { auditAdmin } from '../utils/adminAudit';
import type { AdminRequest } from '../middlewares/requireAdmin';

const KNOWN_KEYS = new Set<string>(Object.values(SETTINGS_KEYS));

/**
 * Validate a settings value before it reaches the database.
 *
 * These keys are the economy's dials. Previously any key and any value were
 * accepted, so a typo could set the ad reward to 100000 or the daily cap to
 * zero, and the mistake would take effect immediately everywhere.
 */
function validate(key: string, value: unknown): { ok: true; value: any } | { ok: false; error: string } {
  if (!KNOWN_KEYS.has(key)) {
    return { ok: false, error: `Unknown setting "${key}"` };
  }

  if (NUMERIC_SETTINGS.has(key)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return { ok: false, error: `${key} must be a number` };

    const limits = SETTING_LIMITS[key];
    if (limits && (n < limits.min || n > limits.max)) {
      return {
        ok: false,
        error: `${key} must be between ${limits.min} and ${limits.max}`,
      };
    }
    return { ok: true, value: n };
  }

  return { ok: true, value };
}

export async function getAllSettings(_req: Request, res: Response) {
  const settings = await AppSettings.find().sort({ key: 1 }).lean();
  return res.json({
    settings,
    // Give the admin UI the bounds so it can render sane inputs.
    limits: SETTING_LIMITS,
  });
}

export async function updateSetting(req: Request, res: Response) {
  const adminEmail = (req as AdminRequest).adminEmail ?? 'admin';
  const { key, value } = req.body ?? {};

  if (!key || value === undefined) {
    return res.status(400).json({ message: 'key and value are required' });
  }

  const check = validate(key, value);
  if (!check.ok) return res.status(400).json({ message: check.error });

  const before = await AppSettings.findOne({ key }).lean();
  const setting = await setSetting(key, check.value, adminEmail);

  await auditAdmin(req, 'settings.update', {
    targetType: 'setting',
    targetId: key,
    before: before?.value,
    after: check.value,
  });

  return res.json({ setting });
}

export async function bulkUpdateSettings(req: Request, res: Response) {
  const adminEmail = (req as AdminRequest).adminEmail ?? 'admin';
  const { settings } = req.body as { settings?: Record<string, unknown> };

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ message: 'settings object required' });
  }

  // Validate the whole batch before writing any of it, so a bad value in the
  // middle can't leave the economy half-updated.
  const validated: { key: string; value: any }[] = [];
  const errors: string[] = [];

  for (const [key, value] of Object.entries(settings)) {
    const check = validate(key, value);
    if (check.ok) validated.push({ key, value: check.value });
    else errors.push(check.error);
  }

  if (errors.length) {
    return res.status(400).json({ message: 'Invalid settings', errors });
  }

  const before = await AppSettings.find({ key: { $in: validated.map((v) => v.key) } }).lean();
  const beforeMap = Object.fromEntries(before.map((b) => [b.key, b.value]));

  for (const { key, value } of validated) {
    await setSetting(key, value, adminEmail);
  }
  clearSettingsCache();

  await auditAdmin(req, 'settings.bulk_update', {
    targetType: 'setting',
    targetId: validated.map((v) => v.key).join(','),
    before: beforeMap,
    after: Object.fromEntries(validated.map((v) => [v.key, v.value])),
  });

  return res.json({ updated: validated.length });
}
