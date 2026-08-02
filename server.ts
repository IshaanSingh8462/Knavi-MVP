import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createApp } from './src/server/app';

dotenv.config({ path: '.env.local' });
dotenv.config();

// This file is ONLY for local development and traditional self-hosting
// (npm run dev / npm run build+start). Vercel deployments never execute
// this file — Vercel calls api/index.ts directly as a serverless function.
// All actual route logic lives in src/server/app.ts so the two entry
// points can never drift out of sync with each other.
async function startServer() {
  const app = createApp();
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const express = (await import('express')).default;
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
