//定时删除minio数据的脚本，每周进行一次
//1.查找数据库game_sessions表中deleted字段为1的数据sessionId字段，整合成数组
//2.查询数据库games中is_public字段为2的数据项中的fileId字段，整合成数组
//3.遍历sessionId数组，删除minio中interactive-fiction-game-data存储桶下${userId}/${sessionId}这个文件夹
//4.遍历fileId数组，删除minio中interactive-fiction-game-init存储桶下${userId}/${fileId}
//5.在MinIO删除成功后，物理删除MySQL中对应的数据
import cron from 'node-cron';
import mysql from 'mysql2/promise';
// import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// 在导入业务模块之前设置环境变量
// process.env.DB_NAME = 'interactive-db';
// process.env.DB_USER = 'root';
// process.env.DB_PASSWORD = 'yuqq1005.';
// process.env.DB_PORT = '3306';
// process.env.DB_HOST = '127.0.0.1';

// 现在再导入业务模块
import { listDeletedSessions, listDeletedGames } from '../service/gamesService.js';
import { deletePrefixFromMinio } from '../service/minioService.js';

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

// MySQL 连接配置
let dbConnection = null;
async function getDbConnection() {
  if (!dbConnection) {
    dbConnection = await mysql.createConnection({
      host: required('DB_HOST'),
      port: Number(process.env.DB_PORT || 3306),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD')
    });
  }
  return dbConnection;
}

// 每天 20:42 执行；按需改时区/表达式
//const WEEKLY_CRON = '32 14 * * *';

// 每周六 24:00（周日 00:00）执行；按需改时区/表达式
const WEEKLY_CRON = '0 0 * * 6';
const TIMEZONE = 'Asia/Shanghai';

// 计算下次执行时间并格式化时间差
function calculateNextExecutionTime(cronExpression, timezone) {
  // 解析 cron 表达式 '0 0 * * 6' (分钟 小时 日 月 星期)
  // 这里简化为每周六 00:00
  const now = new Date();
  const currentDay = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const nextSaturday = new Date(now);
  
  // 计算到下一个周六的天数
  let daysUntilSaturday = 6 - currentDay;
  if (daysUntilSaturday <= 0) {
    daysUntilSaturday += 7; // 如果今天是周六，则计算下周六
  }
  
  // 设置到下一个周六的 00:00:00
  nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  nextSaturday.setHours(0, 0, 0, 0);
  
  // 计算时间差（毫秒）
  const timeDiff = nextSaturday.getTime() - now.getTime();
  
  // 转换为小时、分钟、秒
  const hours = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
  
  return {
    nextExecution: nextSaturday,
    timeUntilNext: {
      hours,
      minutes,
      seconds,
      totalMs: timeDiff
    }
  };
}

// 格式化时间差为可读字符串
function formatTimeUntil(timeUntil) {
  const parts = [];
  if (timeUntil.hours > 0) {
    parts.push(`${timeUntil.hours} ${timeUntil.hours === 1 ? 'hour' : 'hours'}`);
  }
  if (timeUntil.minutes > 0) {
    parts.push(`${timeUntil.minutes} ${timeUntil.minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (timeUntil.seconds > 0 && timeUntil.hours === 0) {
    parts.push(`${timeUntil.seconds} ${timeUntil.seconds === 1 ? 'second' : 'seconds'}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'less than a second';
}

// MinIO 存储桶名称
const GAME_DATA_BUCKET = 'interactive-fiction-game-data';
const GAME_INIT_BUCKET = 'interactive-fiction-game-init';
async function runCleanupWorkflow() {
  console.log('[MinIO-Cleanup] Job started at', new Date().toISOString());
  
  let deletedSessionsCount = 0;
  let deletedGamesCount = 0;
  let deletedSessionsFromDb = 0;
  let deletedGamesFromDb = 0;
  let errors = [];

  // 记录 MinIO 删除成功的 session 和 game，用于后续删除 MySQL 数据
  const successfullyDeletedSessions = [];
  const successfullyDeletedGames = [];

  try {
    // 1) 查询 game_sessions deleted=1 获得 sessionId 列表
    console.log('[MinIO-Cleanup] Querying deleted sessions...');
    const deletedSessions = await listDeletedSessions();
    console.log(`[MinIO-Cleanup] Found ${deletedSessions.length} deleted sessions`);

    // 遍历 sessionId 数组，删除 MinIO 中 interactive-fiction-game-data 存储桶下 ${userId}/${sessionId} 文件夹
    for (const session of deletedSessions) {
      const { session_id, user_id } = session;
      if (!session_id || !user_id) {
        console.warn(`[MinIO-Cleanup] Skipping invalid session:`, session);
        continue;
      }

      try {
        const prefix = `${user_id}/${session_id}`;
        const result = await deletePrefixFromMinio(GAME_DATA_BUCKET, prefix);
        if (result.success) {
          // MinIO 删除成功（无论是否找到对象），记录用于后续删除 MySQL
          successfullyDeletedSessions.push(session_id);
          if (result.deleted > 0) {
            deletedSessionsCount += result.deleted;
            console.log(`[MinIO-Cleanup] Deleted ${result.deleted} objects from ${GAME_DATA_BUCKET}/${prefix}`);
          } else {
            console.log(`[MinIO-Cleanup] No objects found or already deleted: ${GAME_DATA_BUCKET}/${prefix}`);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to delete session ${session_id} (user: ${user_id}): ${error.message}`;
        console.error(`[MinIO-Cleanup] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // 2) 查询 games is_public=2 获得 fileId 列表
    console.log('[MinIO-Cleanup] Querying deleted games...');
    const deletedGames = await listDeletedGames();
    console.log(`[MinIO-Cleanup] Found ${deletedGames.length} deleted games`);

    // 遍历 fileId 数组，删除 MinIO 中 interactive-fiction-game-init 存储桶下 ${userId}/${fileId} 文件夹
    for (const game of deletedGames) {
      const { file_id, creator_user_id } = game;
      if (!file_id || !creator_user_id) {
        console.warn(`[MinIO-Cleanup] Skipping invalid game:`, game);
        continue;
      }

      try {
        const prefix = `${creator_user_id}/${file_id}`;
        const result = await deletePrefixFromMinio(GAME_INIT_BUCKET, prefix);
        if (result.success) {
          // MinIO 删除成功（无论是否找到对象），记录用于后续删除 MySQL
          successfullyDeletedGames.push(file_id);
          if (result.deleted > 0) {
            deletedGamesCount += result.deleted;
            console.log(`[MinIO-Cleanup] Deleted ${result.deleted} objects from ${GAME_INIT_BUCKET}/${prefix}`);
          } else {
            console.log(`[MinIO-Cleanup] No objects found or already deleted: ${GAME_INIT_BUCKET}/${prefix}`);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to delete game ${file_id} (user: ${creator_user_id}): ${error.message}`;
        console.error(`[MinIO-Cleanup] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // 3) MinIO 删除完成后，物理删除 MySQL 中的数据
    console.log('[MinIO-Cleanup] Starting MySQL cleanup...');
    const db = await getDbConnection();

    // 删除 game_sessions 表中的记录
    if (successfullyDeletedSessions.length > 0) {
      try {
        const placeholders = successfullyDeletedSessions.map(() => '?').join(',');
        const [result] = await db.execute(
          `DELETE FROM \`game_sessions\` WHERE \`session_id\` IN (${placeholders})`,
          successfullyDeletedSessions
        );
        deletedSessionsFromDb = result.affectedRows;
        console.log(`[MinIO-Cleanup] Deleted ${deletedSessionsFromDb} sessions from MySQL`);
      } catch (error) {
        const errorMsg = `Failed to delete sessions from MySQL: ${error.message}`;
        console.error(`[MinIO-Cleanup] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // 删除 games 表中的记录
    if (successfullyDeletedGames.length > 0) {
      try {
        const placeholders = successfullyDeletedGames.map(() => '?').join(',');
        const [result] = await db.execute(
          `DELETE FROM \`games\` WHERE \`file_id\` IN (${placeholders})`,
          successfullyDeletedGames
        );
        deletedGamesFromDb = result.affectedRows;
        console.log(`[MinIO-Cleanup] Deleted ${deletedGamesFromDb} games from MySQL`);
      } catch (error) {
        const errorMsg = `Failed to delete games from MySQL: ${error.message}`;
        console.error(`[MinIO-Cleanup] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // 输出总结
    console.log('[MinIO-Cleanup] Job finished:', {
      deletedSessionsObjects: deletedSessionsCount,
      deletedGamesObjects: deletedGamesCount,
      deletedSessionsFromDb: deletedSessionsFromDb,
      deletedGamesFromDb: deletedGamesFromDb,
      errorsCount: errors.length
    });

    if (errors.length > 0) {
      console.warn('[MinIO-Cleanup] Errors encountered:', errors);
    }
  } catch (error) {
    console.error('[MinIO-Cleanup] Job failed:', error);
    throw error;
  } finally {
    // 关闭数据库连接
    if (dbConnection) {
      try {
        await dbConnection.end();
        dbConnection = null;
      } catch (err) {
        console.warn('[MinIO-Cleanup] Failed to close DB connection:', err.message);
      }
    }
  }
}

export function startWeeklyMinioCleanupJob() {
  if (!cron.validate(WEEKLY_CRON)) {
    throw new Error(`Invalid cron expression: ${WEEKLY_CRON}`);
  }

  cron.schedule(
    WEEKLY_CRON,
    () => runCleanupWorkflow(),
    {
      timezone: TIMEZONE,
      runOnInit: false
    }
  );

  // 计算并记录下次执行时间
  const { nextExecution, timeUntilNext } = calculateNextExecutionTime(WEEKLY_CRON, TIMEZONE);
  console.log(`[MinIO-Cleanup] Weekly job scheduled (cron=${WEEKLY_CRON}, tz=${TIMEZONE})`);
  console.log(`[MinIO-Cleanup] Next execution scheduled at: ${nextExecution.toISOString()}`);
  console.log(`[MinIO-Cleanup] Time until next execution: ${formatTimeUntil(timeUntilNext)}`);
}

// 若希望脚本直接跑就启动：
startWeeklyMinioCleanupJob();

// 测试：手动运行一次
// runCleanupWorkflow().then(() => {
//   console.log('[MinIO-Cleanup] Manual test completed');
//   process.exit(0);
// }).catch((err) => {
//   console.error('[MinIO-Cleanup] Manual test failed:', err);
//   process.exit(1);
// });