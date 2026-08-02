import dotenv from 'dotenv';
dotenv.config();

import { createApp } from '../src/server/app.js';

// This is what Vercel actually invokes for every /api/* request (see the
// rewrite rule in vercel.json — it sends every /api/(.*) path here, and
// because it's a REWRITE and not a redirect, req.url still arrives as the
// original full path, e.g. /api/plan/generate, which is exactly what the
// Express routes below are already registered to match).
//
// An Express app instance is itself a valid (req, res) => void handler —
// that's all Vercel's Node.js runtime needs, no adapter package required.
const app = createApp();

export default app;
