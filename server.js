import './config/env.js';
import app from './app.js';
import connectDB from './config/db.js';
import { seedAdminFromEnv } from './services/authService.js';

async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing in .env');
  await connectDB();
  await seedAdminFromEnv();
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
