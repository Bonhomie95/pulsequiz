import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';

import app from './app';
import { createSocketServer } from './socket';

dotenv.config();

async function start() {
  const port = Number(process.env.PORT || 5000);

  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('✅ Mongo connected');

  // ✅ Create ONE HTTP server
  const server = http.createServer(app);

  // ✅ Attach Socket.IO to that server
  createSocketServer(server);

  // ✅ Listen ONLY ONCE
  server.listen(port, () => {
    console.log(`🚀 Server + Socket.IO running on :${port}`);
  });
}

start().catch((e) => {
  console.error('❌ Server failed', e);
  process.exit(1);
});
