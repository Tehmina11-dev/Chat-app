import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// WebSocket fix for Neon
neonConfig.webSocketConstructor = ws;

export const db = new Pool({ connectionString: process.env.DATABASE_URL });