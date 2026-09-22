/**
 * Bootstrap an admin account from the CLI. After the first SUPER_ADMIN exists,
 * manage admins from the panel's Admins page instead.
 *
 *   npm run create-admin -- you@example.com [SUPER_ADMIN|MODERATOR]
 *
 * The password is prompted for, so it never lands in shell history.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import readline from 'readline/promises';
import dotenv from 'dotenv';
import Admin from '../models/Admin';

dotenv.config();

async function run() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const role = (process.argv[3] ?? 'SUPER_ADMIN').toUpperCase() as 'SUPER_ADMIN' | 'MODERATOR';

  if (!email || !['SUPER_ADMIN', 'MODERATOR'].includes(role)) {
    console.error('Usage: npm run create-admin -- email [SUPER_ADMIN|MODERATOR]');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question('Password (min 12 chars, letters + digits): ');
  rl.close();
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error('Password too weak.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI!);
  try {
    await Admin.create({ email, role, passwordHash: await bcrypt.hash(password, 12), createdBy: 'cli' });
    console.log(`✅ ${role} created: ${email}`);
  } catch (err: any) {
    console.error(err?.code === 11000 ? 'An admin with that email already exists.' : err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
