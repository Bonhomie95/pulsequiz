import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes';
import progressRoutes from './routes/progressRoutes';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);

export default app;
