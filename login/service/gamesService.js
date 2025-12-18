import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { pool } from './dbPool.js';
import { downloadPrefixToLocal } from './minioService.js';
import { getUserById, getUserByUserId } from './authService.js';
import { getTotalStatisticsByFileId } from './gameStatisticService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const TABLE = '`games`';
const SESSIONS_TABLE = '`game_sessions`';

// Ensure table exists with expected columns
async function ensureGamesTable() {
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INT NOT NULL AUTO_INCREMENT,
      \`file_id\` VARCHAR(191) NOT NULL,
      \`creator_user_id\` VARCHAR(191) NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`subtitle\` VARCHAR(255) NULL,
      \`description\` TEXT NULL,
      \`cover_url\` VARCHAR(1024) NULL,
      \`doc_url\` VARCHAR(1024) NULL,
      \`files\` VARCHAR(2048) NULL,
      \`price_amount\` DECIMAL(10,2) NULL,
      \`special_price_amount\` DECIMAL(10,2) NULL,
      \`rating_avg\` DECIMAL(4,2) NULL,
      \`rating_count\` INT NULL,
      \`author_name\` VARCHAR(255) NULL,
      \`game_tags\` JSON NULL COMMENT '游戏标签JSON数组，如：["恋爱", "悬疑", "文字冒险"]',
      \`is_public\` INT NOT NULL DEFAULT 0,
      \`created_at\` DATETIME NOT NULL,
      \`updated_at\` DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_games_file_id (\`file_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  try {
    await pool.query(createSql);
  } catch (_) { }
}

await ensureGamesTable();

// Ensure game_sessions table exists
async function ensureGameSessionsTable() {
  const connection = await pool.getConnection();
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      \`session_id\` CHAR(32) NOT NULL,
      \`user_id\` BIGINT NOT NULL,
      \`file_id\` VARCHAR(191) NOT NULL,
      \`status\` ENUM('active', 'completed', 'abandoned') NOT NULL,
      \`files\` VARCHAR(2048) NOT NULL,
      \`started_at\` DATETIME(3) NOT NULL,
      \`ended_at\` DATETIME(3) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_session_id (\`session_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  try {
    await pool.query(createSql);
  } catch (error) {
    console.error("创建 payment_orders 表失败:", error);
    throw error;
} finally {
    // 🔥 确保连接总是被释放
    connection.release();
}
}

await ensureGameSessionsTable();

// Insert a game row
export async function createGame(payload) {
  const allowed = [
    'file_id',
    'creator_user_id',
    'title',
    'subtitle',
    'description',
    'cover_url',
    'doc_url',
    'files',
    'price_amount',
    'special_price_amount',
    'rating_avg',
    'rating_count',
    'author_name',
    'is_public',
    "version",
    'created_at',
    'updated_at'
  ];

  const now = new Date();
  const row = Object.assign({}, payload || {}, {
    created_at: (payload && payload.created_at) != null ? payload.created_at : now,
    updated_at: (payload && payload.updated_at) != null ? payload.updated_at : now
  });

  // 兼容老字段：如果传入了 game_id，则映射到 file_id
  if (row.game_id && !row.file_id) {
    row.file_id = row.game_id;
    delete row.game_id;
  }

  // `files` 已改为字符串列，无需 JSON 处理

  const cols = allowed.filter((k) => row[k] !== undefined);
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((k) => row[k]);

  const columnList = cols.map((c) => '`' + c + '`').join(', ');
  const sql = `INSERT INTO ${TABLE} (${columnList}) VALUES (${placeholders})`;
  const [result] = await pool.execute(sql, values);
  const insertId = result.insertId;
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE id = ?`, [insertId]);
  return rows[0];
}

// Query games list with optional filters and pagination
export async function listGames({ limit = 50, offset = 0, search, creatorUserId } = {}) {
  const where = [];
  const params = [];

  if (creatorUserId) {
    where.push('`creator_user_id` = ?');
    params.push(creatorUserId);
  }

  if (search) {
    where.push('(`title` LIKE ? OR `subtitle` LIKE ? OR `file_id` LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT *
    FROM ${TABLE}
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Query all games without filters or pagination
export async function listAllGames() {
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} ORDER BY id DESC`);
  return rows;
}

export async function listGamesByUser(userId, { limit = 50, offset = 0 } = {}) {
  const lim = Math.max(0, parseInt(limit, 10) || 50);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  // 将 limit/offset 作为字面量拼入（先做严格数字校验），避免某些 MySQL 版本不支持占位符绑定 LIMIT/OFFSET 导致的错误
  const user = await getUserByUserId(userId);
  if (!user) {
    throw new Error(`未找到用户：${userId}`);
  }
  const avatarUrl = typeof user.avatarUrl === 'string'
    ? user.avatarUrl.trim() || null
    : null;
  const sql = `
    SELECT *
    FROM ${TABLE}
    WHERE \`creator_user_id\` = ?
    AND \`is_public\` != 2
    ORDER BY id DESC
    LIMIT ${lim} OFFSET ${off}`;
  const [rows] = await pool.execute(sql, [userId]);
  const gamesWithAvatar = rows.map(game => ({
    ...game,
    avatarUrl
  }));
  return gamesWithAvatar;
}

// 根据 is_public 字段查询游戏列表（无优惠）
export async function listGamesByIsPublicNoDiscount(isPublic, { limit = 10, offset = 0 } = {}) {
  const lim = Math.max(0, parseInt(limit, 10) || 10);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  // 将 limit/offset 作为字面量拼入（先做严格数字校验），避免某些 MySQL 版本不支持占位符绑定 LIMIT/OFFSET 导致的错误
  const sql = `
    SELECT
      g.*
    FROM
      ${TABLE} g
    WHERE g.\`is_public\` = ?
    AND g.\`special_price_amount\` IS NULL
    ORDER BY g.id DESC
    LIMIT ${lim} OFFSET ${off}`;
  const [rows] = await pool.execute(sql, [isPublic]);

  // 遍历数据，为每个游戏添加 total_pv_count 字段
  const gamesWithStats = await Promise.all(
    rows.map(async (game) => {
      const stats = await getTotalStatisticsByFileId(game.file_id);
      return {
        ...game,
        total_pv_count: stats.total_pv_count
      };
    })
  );
  return gamesWithStats;
}

// 根据 is_public 字段查询游戏列表（有优惠）
export async function listGamesByIsPublicWithDiscount(isPublic, { limit = 10, offset = 0 } = {}) {
  const lim = Math.max(0, parseInt(limit, 10) || 10);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  // 将 limit/offset 作为字面量拼入（先做严格数字校验），避免某些 MySQL 版本不支持占位符绑定 LIMIT/OFFSET 导致的错误
  const sql = `
    SELECT
      g.*
    FROM
      ${TABLE} g
    WHERE g.\`is_public\` = ?
    AND g.\`special_price_amount\` IS NOT NULL
    ORDER BY g.id DESC
    LIMIT ${lim} OFFSET ${off}`;
  const [rows] = await pool.execute(sql, [isPublic]);

  // 遍历数据，为每个游戏添加 total_pv_count 字段
  const gamesWithStats = await Promise.all(
    rows.map(async (game) => {
      const stats = await getTotalStatisticsByFileId(game.file_id);
      return {
        ...game,
        total_pv_count: stats.total_pv_count
      };
    })
  );
  return gamesWithStats;
}

// 查询所有已公开游戏的创建者 user_id 列表
export async function listPublicGameCreatorIds() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT \`creator_user_id\`
     FROM ${TABLE}
     WHERE \`is_public\` = 1
       AND \`creator_user_id\` IS NOT NULL
       AND \`creator_user_id\` != ''`
  );
  // 仅返回字符串化后的 userId 数组，避免后续逻辑被 null/空串干扰
  return rows
    .map((row) => (row.creator_user_id != null ? String(row.creator_user_id).trim() : null))
    .filter((id) => id);
}

export async function getGameFilesByFileId(gameId) {
  const [rows] = await pool.execute(
    `SELECT \`files\`, \`rating_avg\` FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`,
    [gameId]
  );
  if (!rows[0]) return null;

  const ratingAvg = rows[0].rating_avg;
  return {
    files: rows[0].files,
    ratingAvg: ratingAvg == null ? null : Number(ratingAvg)
  };
}

// 根据 fileId 获取完整的游戏数据
export async function getGameByFileId(fileId, userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`,
    [fileId]
  );
  const creatorUserId = rows[0].creator_user_id;
  const user = await getUserByUserId(creatorUserId);
  if (!user) {
    throw new Error(`未找到用户：${userId}`);
  }
  const avatarUrl = typeof user.avatarUrl === 'string'
    ? user.avatarUrl.trim() || null
    : null;
  if (rows[0]) {
    // 方式1：解构赋值（推荐，不修改原数据，返回新对象）
    return {
      ...rows[0], // 游戏表的所有字段
      avatarUrl: avatarUrl // 新增/覆盖 avatarUrl 字段
    };

    // 方式2：直接给 rows[0] 加属性（修改原对象，简单直接）
    // rows[0].avatarUrl = avatarUrl;
    // return rows[0];
  }
}

export async function listFileIdsAndFilesByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT \`file_id\`, \`files\` FROM ${TABLE} WHERE \`creator_user_id\` = ? ORDER BY id DESC`,
    [userId]
  );
  return rows;
}

// 根据 file_id 更新 doc_url
export async function updateDocUrlByFileId(fileId, docUrl) {
  const now = new Date();
  await pool.execute(`UPDATE ${TABLE} SET \`doc_url\` = ?, \`updated_at\` = ? WHERE \`file_id\` = ?`, [docUrl, now, fileId]);
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`, [fileId]);
  return rows[0] || null;
}

// 发布游戏：设置 is_public = 1，同时更新 price_amount
export async function publishGameByFileId(fileId, priceAmount) {
  const now = new Date();
  // 确保 priceAmount 是有效的数字，如果是 NaN 或无效值，使用 0
  const priceValue = (priceAmount !== undefined && priceAmount !== null && !Number.isNaN(Number(priceAmount)))
    ? Number(priceAmount)
    : 0;

  // 确保 fileId 是字符串类型
  const fileIdStr = String(fileId);

  const [result] = await pool.execute(
    `UPDATE ${TABLE} SET \`is_public\` = 1, \`price_amount\` = ?, \`updated_at\` = ? WHERE \`file_id\` = ?`,
    [priceValue, now, fileIdStr]
  );

  if (!result.affectedRows) {
    throw new Error('未找到对应的游戏记录');
  }

  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`, [fileId]);
  return rows[0] || null;
}

// 下架游戏
// 设置 is_public = 0
export async function unpublishGameByFileId(fileId) {
  const now = new Date();
  const [result] = await pool.execute(
    `UPDATE ${TABLE} SET \`is_public\` = 0, \`updated_at\` = ? WHERE \`file_id\` = ?`,
    [now, fileId]
  );

  if (!result.affectedRows) {
    throw new Error('未找到对应的游戏记录');
  }

  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`, [fileId]);
  return rows[0] || null;
}


// 标记删除游戏：直接删除 games 表中的记录
export async function deleteGameByFileId(fileId) {
  const now = new Date();

  const [result] = await pool.execute(
    `UPDATE ${TABLE} SET \`is_public\` = 2, \`updated_at\` = ? WHERE \`file_id\` = ?`,
    [now, fileId]
  );

  if (!result.affectedRows) {
    throw new Error('未找到对应的游戏记录');
  }
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`, [fileId]);
  return rows[0] || null;
}

// 根据 file_id 查询创建者 user_id
export async function getCreatorUserIdByFileId(fileId) {
  const [rows] = await pool.execute(
    `SELECT \`creator_user_id\` FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`,
    [fileId]
  );
  return rows[0] ? rows[0].creator_user_id : null;
}

// Generate a 32-character session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// 根据 files 字段查询是否存在相同的记录
export async function getGameSessionByFiles(files) {
  const filesValue = typeof files === 'string' ? files : String(files || '');
  const [rows] = await pool.execute(
    `SELECT * FROM ${SESSIONS_TABLE} WHERE \`files\` = ? ORDER BY id DESC LIMIT 1`,
    [filesValue]
  );
  return rows[0] || null;
}

export async function getGameSessionByUserAndFile(userId, fileId) {
  const [rows] = await pool.execute(
    `SELECT * FROM ${SESSIONS_TABLE} WHERE \`user_id\` = ? AND \`file_id\` = ? AND \`is_deleted\` = 0 ORDER BY id DESC LIMIT 1`,
    [userId, fileId]
  );
  return rows[0] || null;
}

// 更新 game_session 的 ended_at 字段
export async function updateGameSessionEndTime(id, endedAt) {
  const now = endedAt || new Date();
  const sql = `UPDATE ${SESSIONS_TABLE} SET \`ended_at\` = ? WHERE id = ?`;
  await pool.execute(sql, [now, id]);
  const [rows] = await pool.execute(`SELECT * FROM ${SESSIONS_TABLE} WHERE id = ?`, [id]);
  return rows[0];
}

// 更新 game_session 的 status、files 和 ended_at 字段
export async function updateGameSessionStatusAndFiles(id, status, files, endedAt) {
  const now = endedAt || new Date();
  const filesValue = typeof files === 'string' ? files : String(files || '');
  const sql = `UPDATE ${SESSIONS_TABLE} SET \`status\` = ?, \`files\` = ?, \`ended_at\` = ? WHERE id = ?`;
  await pool.execute(sql, [status, filesValue, now, id]);
  const [rows] = await pool.execute(`SELECT * FROM ${SESSIONS_TABLE} WHERE id = ?`, [id]);
  return rows[0];
}

// Create a game session record
export async function createGameSession({ sessionId, userId, fileId, status, files, startedAt, endedAt }) {
  const session_id = sessionId || generateSessionId();
  const now = new Date();
  const sql = `
    INSERT INTO ${SESSIONS_TABLE} (\`session_id\`, \`user_id\`, \`file_id\`, \`status\`, \`files\`, \`started_at\`, \`ended_at\`)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  // files 字段直接存储字符串，不做 JSON 处理
  const filesValue = typeof files === 'string' ? files : String(files || '');

  const values = [
    session_id,
    userId,
    fileId,
    status,
    filesValue,
    startedAt || now,
    endedAt || null
  ];

  const [result] = await pool.execute(sql, values);
  const insertId = result.insertId;
  const [rows] = await pool.execute(`SELECT * FROM ${SESSIONS_TABLE} WHERE id = ?`, [insertId]);
  return rows[0];
}

// 根据 sessionId 查询 userId
export async function getUserIdBySessionId(sessionId) {
  const [rows] = await pool.execute(
    `SELECT \`user_id\` FROM ${SESSIONS_TABLE} WHERE \`session_id\` = ? LIMIT 1`,
    [sessionId]
  );
  return rows[0] ? rows[0].user_id : null;
}

// 根据 sessionId 查询完整的 game_session 记录
export async function getGameSessionBySessionId(sessionId) {
  const [rows] = await pool.execute(
    `SELECT * FROM ${SESSIONS_TABLE} WHERE \`session_id\` = ? LIMIT 1`,
    [sessionId]
  );
  return rows[0] || null;
}

// 根据 sessionId 查询 fileId
export async function getFileIdBySessionId(sessionId) {
  const [rows] = await pool.execute(
    `SELECT \`file_id\` FROM ${SESSIONS_TABLE} WHERE \`session_id\` = ? LIMIT 1`,
    [sessionId]
  );
  return rows[0] ? rows[0].file_id : null;
}

// 根据 file_id 删除 game_sessions 表中的所有相关记录
export async function deleteGameSessionsByFileId(fileId) {
  const [result] = await pool.execute(
    `UPDATE ${SESSIONS_TABLE} SET \`is_deleted\` = 1 WHERE \`file_id\` = ?`,
    [fileId]
  );
  return result.affectedRows; // 返回删除的记录数
}

// 根据 sessionId 删除 game_session 记录（软删除）
export async function deleteGameSessionBySessionId(sessionId) {
  const [result] = await pool.execute(
    `UPDATE ${SESSIONS_TABLE} SET \`is_deleted\` = 1 WHERE \`session_id\` = ?`,
    [sessionId]
  );
  return result.affectedRows; // 返回删除的记录数
}

export async function getFileIdsFromSessionsByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT \`file_id\`
     FROM ${SESSIONS_TABLE}
     WHERE \`user_id\` = ? AND \`is_deleted\` = 0`,
    [userId]
  );
  return rows.map(row => row.file_id).filter(Boolean);
}

export async function getGamesByFileIds(fileIds = [], userId, options = {}) {
  const { limit = 20, offset = 0 } = options;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return [];
  }
  const user = await getUserByUserId(userId);
  if (!user) {
    throw new Error(`未找到用户：${userId}`);
  }
  const avatarUrl = typeof user.avatarUrl === 'string'
    ? user.avatarUrl.trim() || null
    : null;
  // 构造 (?, ?, ?) 占位符
  const placeholders = fileIds.map(() => '?').join(',');
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM ${TABLE}
     WHERE \`file_id\` IN (${placeholders})
       AND \`is_public\` <> 2`,
    fileIds
  );
  const total = countRows?.[0]?.total ?? 0;
  const limitNum = Number(limit) || 20;
  const offsetNum = Number(offset) || 0;
  // const params = [...fileIds, limitNum, offsetNum];
  const [rows] = await pool.execute(
    `SELECT *
     FROM ${TABLE}
     WHERE \`file_id\` IN (${placeholders})
       AND \`is_public\` <> 2
     ORDER BY updated_at DESC
   LIMIT ${limitNum}
   OFFSET ${offsetNum}`,
   fileIds
  );
  const gamesWithAvatar = rows.map(game => ({
    ...game,
    avatarUrl
  }));
  return { rows: gamesWithAvatar, total };
}

// 列出被删除的数据项
export async function listDeletedSessions() {
  const [rows] = await pool.execute(
    `SELECT \`session_id\`, \`user_id\`, \`file_id\`
     FROM ${SESSIONS_TABLE}
     WHERE \`is_deleted\` = 1`
  );
  return rows || [];
}

// 查询 is_public=2 的游戏，获取 fileId 和 creator_user_id 列表
export async function listDeletedGames() {
  const [rows] = await pool.execute(
    `SELECT \`file_id\`, \`creator_user_id\`
     FROM ${TABLE}
     WHERE \`is_public\` = 2`
  );
  return rows || [];
}
// 根据file_id查询金额price_amount
export async function getTotalAmountByFileId(fileId) {
  // 验证参数有效性
  if (!fileId) {
    throw new Error('fileId 不能为空');
  }
  const [rows] = await pool.execute(
    `SELECT \`price_amount\`
     FROM ${TABLE}
     WHERE \`file_id\` = ?`,
    [fileId]
  );
  if (rows.length > 0) {
    // 金额可能为null，返回时做默认值处理
    return rows[0].price_amount ?? 0;
  }
  return 0;
}

//根据游戏fileId查询对应游戏信息
export async function getGameDataByFileId(fileId) {
  const sql = `
      SELECT * FROM ${TABLE}
      WHERE \`file_id\` = ?
    `;

  const [rows] = await pool.query(sql, [fileId]);

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

// 更新游戏封面 URL
export async function updateGameCoverUrl(fileId, coverUrl) {
  const now = new Date();
  await pool.execute(`UPDATE ${TABLE} SET \`cover_url\` = ?, \`updated_at\` = ? WHERE \`file_id\` = ?`, [coverUrl, now, fileId]);
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE \`file_id\` = ? LIMIT 1`, [fileId]);
  return rows[0] || null;
}

export default {
  createGame,
  listGames,
  listAllGames,
  listGamesByUser,
  listGamesByIsPublicNoDiscount,
  listGamesByIsPublicWithDiscount,
  getGameFilesByFileId,
  listFileIdsAndFilesByUser,
  updateDocUrlByFileId,
  publishGameByFileId,
  unpublishGameByFileId,
  deleteGameByFileId,
  getCreatorUserIdByFileId,
  createGameSession,
  getGameSessionByFiles,
  getGameSessionByUserAndFile,
  updateGameSessionEndTime,
  updateGameSessionStatusAndFiles,
  getUserIdBySessionId,
  getGameSessionBySessionId,
  getFileIdBySessionId,
  deleteGameSessionsByFileId,
  deleteGameSessionBySessionId,
  getFileIdsFromSessionsByUser,
  getGamesByFileIds,
  listDeletedSessions,
  listDeletedGames,
  getTotalAmountByFileId,
  getGameDataByFileId,
  updateGameCoverUrl
}


