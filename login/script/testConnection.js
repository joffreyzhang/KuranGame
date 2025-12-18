//引入 dotenv 库，用来读取 .env 文件中的环境变量。
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mysql from 'mysql2/promise';

// Load environment variables from .env in current folder (login)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  // Expected env vars for MySQL: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
  const connection = await mysql.createConnection({
    host: '39.97.36.219',
    port: Number(process.env.DB_PORT || 3306),
    database: 'funloom',
    user: 'root',
    password: 'KuranGames!'
  });

  const start = Date.now();
  try {
    console.log('[DB] Connecting...');
    console.log('[DB] Connected');

    const [rows] = await connection.query('SELECT VERSION() AS version');
    console.log('[DB] Info:', rows[0]);

    // Sanity check: lightweight create/drop temp table
    await connection.query('CREATE TABLE IF NOT EXISTS __connect_test (id INT PRIMARY KEY)');
    await connection.query('INSERT IGNORE INTO __connect_test (id) VALUES (?)', [1]);
    const [check] = await connection.query('SELECT COUNT(*) AS cnt FROM __connect_test');
    console.log('[DB] Temp table row count:', check[0].cnt);

    // Extra: count rows in `user` table (if exists)
    try {
      const [users] = await connection.query('SELECT * FROM `games`');
      console.log('[DB] user table row count:', users);
    } catch (e) {
      console.warn('[DB] user table count skipped:', e.message);
    }

    const ms = Date.now() - start;
    console.log(`[DB] Connection test OK in ${ms}ms`);
  } catch (err) {
    console.error('[DB] Connection test FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    try { await connection.end(); } catch (_) {}
  }
}

main();


