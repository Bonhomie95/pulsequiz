// Load env before anything else — several modules read process.env at import time.
import 'dotenv/config';

import mongoose from 'mongoose';
import http from 'http';

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_JWT_SECRET'] as const;
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

async function start() {
  // Imported lazily so env validation above runs before any module reads env.
  const { default: app } = await import('./app');
  const { createSocketServer } = await import('./socket');

  const port = Number(process.env.PORT || 5000);

  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('✅ Mongo connected');

  const server = http.createServer(app);
  createSocketServer(server);

  server.listen(port, () => {
    console.log(`🚀 Server + Socket.IO running on :${port}`);
  });
}

start().catch((e) => {
  console.error('❌ Server failed', e);
  process.exit(1);
});
