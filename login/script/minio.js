import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// 启动命令 node minio.js D:\download\minio-data（目标地址）
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: required('DB_NAME'),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 5),
  idleTimeout: Number(process.env.DB_POOL_IDLE_MS || 30000)
});

async function fetchUserIdByPk(id) {
  const [rows] = await pool.execute(
    'SELECT `userId` FROM `user` WHERE `id` = ? LIMIT 1',
    [id]
  );
  return rows[0]?.userId || null;
}

async function renameFolders(baseDir) {
  const dirEntries = await fs.readdir(baseDir, { withFileTypes: true });

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;

    const oldName = entry.name;
    if (!/^\d+$/.test(oldName)) {
      console.warn(`[Skip] ${oldName} 不是数字ID，跳过`);
      continue;
    }

    const pk = Number(oldName);
    let userId;
    try {
      userId = await fetchUserIdByPk(pk);
    } catch (err) {
      console.error(`[Error] 查询用户 ${oldName} 失败:`, err.message);
      continue;
    }

    if (!userId) {
      console.warn(`[Skip] 数据库中找不到 id=${oldName} 对应的 userId`);
      continue;
    }

    const srcPath = path.join(baseDir, oldName);
    const destPath = path.join(baseDir, userId);

    if (srcPath === destPath) {
      console.log(`[Info] ${oldName} 与 userId 相同，无需重命名`);
      continue;
    }

    try {
      await fs.access(destPath);
      console.error(`[Skip] 目标文件夹 ${userId} 已存在，跳过`);
      continue;
    } catch {
      // dest 不存在，可以继续
    }

    try {
      await fs.rename(srcPath, destPath);
      console.log(`[Done] ${oldName} -> ${userId}`);
    } catch (err) {
      console.error(`[Error] 重命名 ${oldName} 失败:`, err.message);
    }
  }
}

async function main() {
  const baseDir = process.argv[2];
  if (!baseDir) {
    console.error('请提供需要处理的根目录：node minio.js <baseDir>');
    process.exit(1);
  }
  try {
    await renameFolders(baseDir);
    console.log('处理完成');
  } catch (err) {
    console.error('执行出错:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
