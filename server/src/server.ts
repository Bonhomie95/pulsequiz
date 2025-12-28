import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';

dotenv.config();

async function start() {
  const port = Number(process.env.PORT || 5000);

  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('✅ Mongo connected');

  app.listen(port, () => console.log(`🚀 Server running on :${port}`));
}

start().catch((e) => {
  console.error('❌ Server failed', e);
  process.exit(1);
});
