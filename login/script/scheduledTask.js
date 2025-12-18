
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mysql from 'mysql2/promise';
import redisClient from '../storage/redisClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

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
  connectionLimit: Number(process.env.DB_POOL_MAX || 10),
  idleTimeout: Number(process.env.DB_POOL_IDLE_MS || 30000)
});

const STATS_KEY_PREFIX = 'game:stats:';
const UV_KEY_PREFIX = 'game:uv:';
const CONVERSION_KEY_PREFIX = 'game:conversion:';
const TABLE = '`game_statistics`';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// 定时任务开关：true 开启，false 关闭
const ENABLE_SCHEDULED_STATS_JOB = true;

const FIRST_RUN_HOUR = 0;
const FIRST_RUN_MINUTE = 0;

async function ensureStatsTable() {
  console.log('[ScheduledTask] Checking/creating games_statistics table...');
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      \`file_id\` VARCHAR(191) NOT NULL,
      \`stat_date\` DATE NOT NULL,
      \`pv_count\` INT NOT NULL DEFAULT 0,
      \`uv_count\` INT NOT NULL DEFAULT 0,
      \`like_count\` INT NOT NULL DEFAULT 0,
      \`conversion_count\` INT NOT NULL DEFAULT 0,
      \`conversion_rate\` DECIMAL(5, 2) DEFAULT NULL,
      \`created_at\` DATETIME(3) NOT NULL,
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_games_statistic_file_date (\`file_id\`, \`stat_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  try {
    await pool.query(createSql);
    console.log('[ScheduledTask] games_statistics table ensured successfully');
  } catch (error) {
    console.error('[ScheduledTask] Failed to ensure games_statistic table', error);
    throw error;
  }
}

await ensureStatsTable();

function toInt(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function fetchStatsFromRedis() {
  const stats = [];
  try {
    if (typeof redisClient.connect === 'function' && !redisClient.isOpen && !redisClient.isReady) {
      await redisClient.connect();
    }
    const keys = await redisClient.keys(`${STATS_KEY_PREFIX}*`);
    for (const key of keys) {
      const normalizedKey = typeof key === 'string' ? key : key.toString();
      const fileId = normalizedKey.slice(STATS_KEY_PREFIX.length);
      if (!fileId) continue;

      const data = await redisClient.hGetAll(normalizedKey);
      if (!data || Object.keys(data).length === 0) continue;

      stats.push({
        fileId,
        likeCount: toInt(data.likeCount),
        pvCount: toInt(data.pvCount),
        uvCount: toInt(data.uvCount),
        conversionCount: toInt(data.conversionCount)
      });
    }
  } catch (error) {
    console.error('[ScheduledTask] Failed to fetch stats from Redis', error);
    throw error;
  }

  return stats;
}

async function persistStatsToDatabase(stats) {
  if (!stats.length) {
    return 0;
  }

  const now = new Date();
  const statDate = now.toISOString().split('T')[0];
  const values = stats.map(({ fileId, pvCount, uvCount, likeCount, conversionCount }) => {
    // 计算转化率：conversionCount / pvCount
    // 如果 pvCount 为 0，则转化率为 null
    const conversionRate = pvCount > 0 
      ? (conversionCount / pvCount) 
      : null;
    
    return [
      fileId,
      statDate,
      pvCount,
      uvCount,
      likeCount,
      conversionCount,
      conversionRate,
      now,
      now
    ];
  });

  const sql = `
  INSERT INTO ${TABLE}
    (\`file_id\`, \`stat_date\`, \`pv_count\`, \`uv_count\`, \`like_count\`, \`conversion_count\`, \`conversion_rate\`, \`created_at\`, \`updated_at\`)       
  VALUES ?;`;

  // 只取行数
  const [result] = await pool.query(sql, [values]);
  return result.affectedRows || 0;
}

// 清除 Redis 中以 game:stats:、game:uv: 和 game:conversion: 为前缀的键
async function clearStatsFromRedis() {
  try {
    if (typeof redisClient.connect === 'function' && !redisClient.isOpen && !redisClient.isReady) {
      await redisClient.connect();
    }
    
    // 获取所有以 game:stats:、game:uv: 和 game:conversion: 开头的键
    const statsKeys = await redisClient.keys(`${STATS_KEY_PREFIX}*`);
    const uvKeys = await redisClient.keys(`${UV_KEY_PREFIX}*`);
    const conversionKeys = await redisClient.keys(`${CONVERSION_KEY_PREFIX}*`);
    
    // 合并所有需要删除的键
    const allKeys = [...(statsKeys || []), ...(uvKeys || []), ...(conversionKeys || [])];
    
    if (!allKeys || allKeys.length === 0) {
      console.log('[ScheduledTask] No stats, uv or conversion keys found in Redis to clear');
      return 0;
    }

    // 批量删除所有匹配的键
    let deletedCount = 0;
    for (const key of allKeys) {
      const normalizedKey = typeof key === 'string' ? key : key.toString();
      const result = await redisClient.del(normalizedKey);
      if (result > 0) {
        deletedCount++;
      }
    }

    console.log(`[ScheduledTask] Deleted ${deletedCount} keys from Redis (${statsKeys?.length || 0} game:stats: keys, ${uvKeys?.length || 0} game:uv: keys, ${conversionKeys?.length || 0} game:conversion: keys)`);
    return deletedCount;
  } catch (error) {
    console.error('[ScheduledTask] Failed to clear stats from Redis', error);
    throw error;
  }
}

async function runDailyStatsJob() {
  console.log(`[ScheduledTask] Daily stats job started at ${new Date().toISOString()}`);
  try {
    const stats = await fetchStatsFromRedis();
    console.log("=============================",stats,"======================");
    if (!stats.length) {
      console.log('[ScheduledTask] No stats found in Redis to persist');
      return;
    }

    const affected = await persistStatsToDatabase(stats);
    console.log(`[ScheduledTask] Persisted ${stats.length} game stats entries (affected ${affected})`);

    // 数据持久化成功后，清除 Redis 中的统计数据（删除 game:stats:、game:uv: 和 game:conversion: 开头的所有键）
    try {
      const clearedCount = await clearStatsFromRedis();
      console.log(`[ScheduledTask] Deleted ${clearedCount} keys from Redis after persistence`);
    } catch (clearError) {
      console.error('[ScheduledTask] Failed to clear stats from Redis after persistence', clearError);
      // 不清除错误，只记录日志，因为数据已经成功持久化
    }
  } catch (error) {
    console.error('[ScheduledTask] Daily stats job failed', error);
  }
}

function scheduleDailyStatsJob() {
  // 检查定时任务开关
  if (!ENABLE_SCHEDULED_STATS_JOB) {
    console.log('[ScheduledTask] Scheduled stats job is DISABLED');
    return;
  }

  const now = new Date();
  let nextRun = new Date();
  
  // 检查是否设置了首次执行时间
  if (FIRST_RUN_HOUR !== null && FIRST_RUN_MINUTE !== null) {
    // 使用代码中设置的时间
    nextRun.setHours(FIRST_RUN_HOUR, FIRST_RUN_MINUTE, 0, 0);
    
    // 如果设置的时间已经过了今天，则设置为明天
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    console.log(`[ScheduledTask] First run time set to: ${FIRST_RUN_HOUR.toString().padStart(2, '0')}:${FIRST_RUN_MINUTE.toString().padStart(2, '0')}:00`);
  } else {
    // 如果没有设置，默认从当前时间开始 24 小时后执行
    nextRun = new Date(now.getTime() + ONE_DAY_MS);
    console.log(`[ScheduledTask] No first run time specified, using default (24 hours from now)`);
  }
  
  const delay = nextRun.getTime() - now.getTime();
  const delayHours = Math.floor(delay / (60 * 60 * 1000));
  const delayMinutes = Math.floor((delay % (60 * 60 * 1000)) / (60 * 1000));
  
  console.log(`[ScheduledTask] Scheduled stats job is ENABLED`);
  console.log(`[ScheduledTask] Execution interval: Every 24 hours`);
  console.log(`[ScheduledTask] Current time: ${now.toISOString()}`);
  console.log(`[ScheduledTask] First execution scheduled at: ${nextRun.toISOString()}`);
  console.log(`[ScheduledTask] Time until first execution: ${delayHours} hours ${delayMinutes} minutes`);

  const runSafely = () => {
    runDailyStatsJob().catch((error) => {
      console.error('[ScheduledTask] Unhandled error in daily stats job', error);
    });
  };

  // 第一次执行：在设置的时间执行
  setTimeout(() => {
    runSafely();
    // 之后每 24 小时执行一次（在上一次执行时间基础上延迟 24 小时）
    setInterval(runSafely, ONE_DAY_MS);
  }, delay);
}

// 根据开关决定是否启动定时任务
scheduleDailyStatsJob();

export { runDailyStatsJob, scheduleDailyStatsJob };

