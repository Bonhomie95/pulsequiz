/**
 * Admin account management — SUPER_ADMIN only.
 *
 * Previously the only way to add an admin was a CLI script that always minted
 * a SUPER_ADMIN. requireAdmin re-reads role/isActive on every request, so a
 * change here takes effect on the target's very next call.
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from 'mongoose';

import Admin from '../models/Admin';
import { requireAdmin, requireSuperAdmin, type AdminRequest } from '../middlewares/requireAdmin';
import { auditAdmin } from '../utils/adminAudit';

const router = Router();
router.use(requireAdmin, requireSuperAdmin);

const Role = z.enum(['SUPER_ADMIN', 'MODERATOR']);
// 12+ chars with a letter and a digit: these accounts can move real money.
const Password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password needs a letter')
  .regex(/\d/, 'Password needs a digit');

const CreateBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: Password,
  role: Role,
});
const UpdateBody = z
  .object({ role: Role.optional(), isActive: z.boolean().optional(), password: Password.optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const PUBLIC_FIELDS = 'email role isActive lastLoginAt createdAt createdBy lockedUntil';

router.get('/', async (_req: Request, res: Response) => {
  const admins = await Admin.find().select(PUBLIC_FIELDS).sort({ createdAt: 1 }).lean();
  res.json({ admins });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });

  const { email, password, role } = parsed.data;
  try {
    const admin = await Admin.create({
      email,
      role,
      passwordHash: await bcrypt.hash(password, 12),
      createdBy: (req as AdminRequest).adminEmail ?? null,
    });
    await auditAdmin(req, 'admin.create', { targetType: 'admin', targetId: admin._id.toString(), after: { email, role } });
    res.status(201).json({ admin: { _id: admin._id, email, role, isActive: true } });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: 'An admin with that email already exists' });
    throw err;
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID' });
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
  const { role, isActive, password } = parsed.data;

  const target = await Admin.findById(id);
  if (!target) return res.status(404).json({ message: 'Admin not found' });

  const self = (req as AdminRequest).adminId === id;
  const losingSuper =
    target.role === 'SUPER_ADMIN' && target.isActive && (role === 'MODERATOR' || isActive === false);

  if (self && losingSuper) {
    return res.status(400).json({ message: "You can't demote or deactivate yourself" });
  }
  if (losingSuper) {
    const others = await Admin.countDocuments({ role: 'SUPER_ADMIN', isActive: true, _id: { $ne: target._id } });
    if (others === 0) return res.status(400).json({ message: 'There must always be at least one active super admin' });
  }

  const before = { role: target.role, isActive: target.isActive };
  if (role) target.role = role;
  if (isActive !== undefined) target.isActive = isActive;
  if (password) {
    target.passwordHash = await bcrypt.hash(password, 12);
    target.failedLogins = 0;
    target.lockedUntil = null;
  }
  await target.save();

  await auditAdmin(req, 'admin.update', {
    targetType: 'admin',
    targetId: id,
    before,
    after: { role: target.role, isActive: target.isActive, passwordReset: !!password },
  });
  res.json({ admin: { _id: target._id, email: target.email, role: target.role, isActive: target.isActive } });
});

export default router;
