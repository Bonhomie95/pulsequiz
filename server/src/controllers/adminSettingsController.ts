import { Request, Response } from 'express';
import AppSettings, { setSetting, SETTINGS_KEYS } from '../models/AppSettings';

export async function getAllSettings(req: Request, res: Response) {
  const settings = await AppSettings.find().lean();
  return res.json({ settings });
}

export async function updateSetting(req: Request, res: Response) {
  const adminUsername = (req as any).admin?.username ?? 'admin';
  const { key, value } = req.body;

  if (!key || value === undefined) return res.status(400).json({ message: 'key and value required' });

  const setting = await setSetting(key, value, adminUsername);
  return res.json({ setting });
}

export async function bulkUpdateSettings(req: Request, res: Response) {
  const adminUsername = (req as any).admin?.username ?? 'admin';
  const { settings } = req.body as { settings: Record<string, any> };

  if (!settings) return res.status(400).json({ message: 'settings object required' });

  const results = [];
  for (const [key, value] of Object.entries(settings)) {
    results.push(await setSetting(key, value, adminUsername));
  }

  return res.json({ updated: results.length });
}
