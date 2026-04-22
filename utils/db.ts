import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
console.log("DB:", process.env.DATABASE_URL);
console.log("JWT:", process.env.JWT_SECRET);
console.log("RAILWAY ENV CHECK:", process.env.DATABASE_URL);
// WebSocket fix for Neon
neonConfig.webSocketConstructor = ws;

export const db = new Pool({ connectionString: process.env.DATABASE_URL });