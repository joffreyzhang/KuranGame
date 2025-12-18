import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './dbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const LIKES_TABLE = '`game_like`';
const GAMES_TABLE = '`games`';

/**
 * 确保 games_like 表存在
 */
async function ensureGameLikesTable() {
  const connection = await pool.getConnection();
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${LIKES_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      game_id VARCHAR(225) NOT NULL COMMENT '游戏文件ID',
      user_id BIGINT NOT NULL COMMENT '用户ID',
      reaction TINYINT NOT NULL COMMENT '用户态度: 1=喜欢, 2=不喜欢',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_game_reaction (user_id, game_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='游戏点赞/不喜欢记录表';
  `;
  try {
    await pool.query(createSql);
  } catch (err) {
    console.error("Failed to ensure games_like table:", err);
  }finally {
    // 🔥 确保连接总是被释放
    connection.release();
}
}

/**
 * 确保 games 表包含 like_count 和 dislike_count 字段
 */
async function ensureGamesTableColumns() {
    try {
        const [likeCountRows] = await pool.query(
            `SHOW COLUMNS FROM ${GAMES_TABLE} LIKE 'like_count'`
        );
        if (likeCountRows.length === 0) {
            await pool.query(`ALTER TABLE ${GAMES_TABLE} ADD COLUMN \`like_count\` INT NOT NULL DEFAULT 0 AFTER \`rating_count\``);
        }

        const [dislikeCountRows] = await pool.query(
            `SHOW COLUMNS FROM ${GAMES_TABLE} LIKE 'dislike_count'`
        );
        if (dislikeCountRows.length === 0) {
            await pool.query(`ALTER TABLE ${GAMES_TABLE} ADD COLUMN \`dislike_count\` INT NOT NULL DEFAULT 0 AFTER \`like_count\``);
        }
    } catch (err) {
        console.error("Failed to ensure columns in games table:", err);
    }
}

// 初始化表结构
ensureGameLikesTable();
ensureGamesTableColumns();

/**
 * 添加或更新用户对游戏的回应（点赞/不喜欢）
 * @param {string} gameId - 游戏ID
 * @param {number} userId - 用户ID
 * @param {number} reaction - 回应类型 (1: 喜欢, 2: 不喜欢)
 * @returns {Promise<object>} - 返回操作结果
 */
export async function addReaction(gameId, userId, reaction) {
  const sql = `
    INSERT INTO ${LIKES_TABLE} (game_id, user_id, reaction)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE reaction = ?, updated_at = CURRENT_TIMESTAMP;
  `;
  const [result] = await pool.execute(sql, [gameId, userId, reaction, reaction]);
  return result;
}

/**
 * 移除用户对游戏的回应
 * @param {string} gameId - 游戏ID
 * @param {number} userId - 用户ID
 * @returns {Promise<object>} - 返回删除操作的结果
 */
export async function removeReaction(gameId, userId) {
  const sql = `DELETE FROM ${LIKES_TABLE} WHERE game_id = ? AND user_id = ?`;
  const [result] = await pool.execute(sql, [gameId, userId]);
  return result;
}

/**
 * 检查用户对特定游戏的回应
 * @param {string} gameId - 游戏ID
 * @param {number} userId - 用户ID
 * @returns {Promise<object|null>} - 返回回应记录，如果不存在则返回 null
 */
export async function checkUserReaction(gameId, userId) {
  const sql = `SELECT reaction FROM ${LIKES_TABLE} WHERE game_id = ? AND user_id = ?`;
  const [rows] = await pool.execute(sql, [gameId, userId]);
  return rows[0] || null;
}

/**
 * 获取游戏的回应总数
 * @param {string} gameId - 游戏ID
 * @returns {Promise<{like_count: number, dislike_count: number}>} - 返回喜欢和不喜欢的总数
 */
export async function getReactionCounts(gameId) {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM ${LIKES_TABLE} WHERE game_id = ? AND reaction = 1) as like_count,
      (SELECT COUNT(*) FROM ${LIKES_TABLE} WHERE game_id = ? AND reaction = 2) as dislike_count;
  `;
  const [rows] = await pool.execute(sql, [gameId, gameId]);
  return rows[0] || { like_count: 0, dislike_count: 0 };
}

/**
 * 更新 games 表中的 like_count 和 dislike_count
 * @param {string} gameId - 游戏ID
 */
export async function updateGameReactionCounts(gameId) {
    const counts = await getReactionCounts(gameId);
    const sql = `
        UPDATE ${GAMES_TABLE} 
        SET like_count = ?, dislike_count = ? 
        WHERE file_id = ?
    `;
    await pool.execute(sql, [counts.like_count, counts.dislike_count, gameId]);
}


export default {
  addReaction,
  removeReaction,
  checkUserReaction,
  getReactionCounts,
  updateGameReactionCounts
};

