import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

function requiredEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Shared MySQL connection pool (singleton)
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: requiredEnv('DB_NAME'),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 15),
  idleTimeout: Number(process.env.DB_POOL_IDLE_MS || 150000),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT_MS || 60000),
  timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 60000)
});

export async function closePool() {
  await pool.end();
}

export default pool;

