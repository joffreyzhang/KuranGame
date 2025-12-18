import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './dbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const USER_INVITE_CODES_TABLE = '`user_invite_codes`';

/**
 * 确保 user_invite_codes 表存在
 */
async function ensureUserInviteCodesTable() {
    const connection = await pool.getConnection();
    const createSql = `
    CREATE TABLE IF NOT EXISTS ${USER_INVITE_CODES_TABLE} (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(255) NOT NULL,
    invite_code VARCHAR(20) NOT NULL,
    is_used TINYINT(1) NOT NULL DEFAULT 0,
    used_by_user_id VARCHAR(255) NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uniq_invite_code (invite_code),
    KEY idx_user_id (user_id),
    KEY idx_is_used (is_used)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户邀请码表';
`;
    try {
        await pool.query(createSql);
        console.log("User invite codes table ensured");
    } catch (err) {
        console.error("Failed to ensure user_invite_codes table:", err);
        throw err;
    }finally {
        // 🔥 确保连接总是被释放
        connection.release();
    }
}
// 初始化表结构
ensureUserInviteCodesTable();

/**
 * 生成邀请码
 * @param {string} userId - 用户ID
 * @param {string} inviteCode - 邀请码
 * @returns {Promise<object>} - 返回插入结果
 */
export async function generateInviteCode(userId, inviteCode) {
    const sql = `
    INSERT INTO ${USER_INVITE_CODES_TABLE} 
    (user_id, invite_code)
    VALUES (?, ?)
  `;
    try {
        const [result] = await pool.execute(sql, [userId, inviteCode]);
        return { success: true, result };
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return { success: false, error: '邀请码已存在' };
        }
        throw err;
    }
}

/**
 * 使用邀请码
 * @param {string} inviteCode - 邀请码
 * @param {string} usedByUserId - 使用者的用户ID
 * @returns {Promise<object>} - 返回使用结果
 */
export async function useInviteCode(inviteCode, usedByUserId) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 检查邀请码是否存在且未使用
        const [rows] = await connection.execute(
            `SELECT id, user_id, is_used FROM ${USER_INVITE_CODES_TABLE} WHERE invite_code = ? FOR UPDATE`,
            [inviteCode]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return { success: false, error: '邀请码不存在' };
        }

        const inviteRecord = rows[0];

        if (inviteRecord.is_used) {
            await connection.rollback();
            return { success: false, error: '邀请码已被使用' };
        }

        if (inviteRecord.user_id === usedByUserId) {
            await connection.rollback();
            return { success: false, error: '不能使用自己的邀请码' };
        }

        // 更新邀请码状态
        const updateSql = `
      UPDATE ${USER_INVITE_CODES_TABLE} 
      SET is_used = 1, used_by_user_id = ?, used_at = CURRENT_TIMESTAMP(3)
      WHERE invite_code = ? AND is_used = 0
    `;

        const [result] = await connection.execute(updateSql, [usedByUserId, inviteCode]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return { success: false, error: '邀请码使用失败' };
        }

        await connection.commit();
        return {
            success: true,
            data: {
                inviterId: inviteRecord.user_id,
                inviteeId: usedByUserId
            }
        };

    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

/**
 * 根据邀请码获取详情
 * @param {string} inviteCode - 邀请码
 * @returns {Promise<object|null>} - 返回邀请码详情或null
 */
export async function getInviteCodeByCode(inviteCode) {
    const sql = `
    SELECT * FROM ${USER_INVITE_CODES_TABLE} 
    WHERE invite_code = ?
  `;
    const [rows] = await pool.execute(sql, [inviteCode]);
    return rows[0] || null;
}

/**
 * 获取用户生成的邀请码列表
 * @param {string} userId - 用户ID
 * @param {number} limit - 限制数量
 * @param {number} offset - 偏移量
 * @returns {Promise<Array>} - 返回邀请码列表
 */
export async function getUserInviteCodes(userId, limit = 50, offset = 0) {
    const sql = `
    SELECT * FROM ${USER_INVITE_CODES_TABLE} 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `;
    const [rows] = await pool.execute(sql, [userId, limit, offset]);
    return rows;
}

/**
 * 获取用户已使用的邀请码
 * @param {string} userId - 用户ID
 * @returns {Promise<Array>} - 返回已使用的邀请码列表
 */
export async function getUserUsedInviteCodes(userId) {
    const sql = `
    SELECT * FROM ${USER_INVITE_CODES_TABLE} 
    WHERE user_id = ? AND is_used = 1 
    ORDER BY used_at DESC
  `;
    const [rows] = await pool.execute(sql, [userId]);
    return rows;
}

/**
 * 获取用户未使用的邀请码
 * @param {string} userId - 用户ID
 * @returns {Promise<Array>} - 返回未使用的邀请码列表
 */
export async function getUserUnusedInviteCodes(userId) {
    const sql = `
    SELECT * FROM ${USER_INVITE_CODES_TABLE} 
    WHERE user_id = ? AND is_used = 0 
    ORDER BY created_at DESC
  `;
    const [rows] = await pool.execute(sql, [userId]);
    return rows;
}

/**
 * 检查用户是否使用过邀请码
 * @param {string} userId - 用户ID
 * @returns {Promise<boolean>} - 返回是否使用过邀请码
 */
export async function checkUserUsedInviteCode(userId) {
    const sql = `
    SELECT COUNT(*) as count 
    FROM ${USER_INVITE_CODES_TABLE} 
    WHERE used_by_user_id = ?
  `;
    const [rows] = await pool.execute(sql, [userId]);
    return rows[0].count > 0;
}

/**
 * 获取用户邀请的人数
 * @param {string} userId - 用户ID
 * @returns {Promise<number>} - 返回邀请人数
 */
export async function getUserInviteCount(userId) {
    const sql = `
    SELECT COUNT(*) as count 
    FROM ${USER_INVITE_CODES_TABLE} 
    WHERE user_id = ? AND is_used = 1
  `;
    const [rows] = await pool.execute(sql, [userId]);
    return rows[0].count;
}

/**
 * 批量生成邀请码
 * @param {string} userId - 用户ID
 * @param {Array<string>} inviteCodes - 邀请码数组
 * @returns {Promise<object>} - 返回批量插入结果
 */
export async function batchGenerateInviteCodes(userId, inviteCodes) {
    const values = inviteCodes.map(code => [userId, code]);
    const placeholders = values.map(() => '(?, ?)').join(', ');

    const sql = `
    INSERT INTO ${USER_INVITE_CODES_TABLE} 
    (user_id, invite_code) 
    VALUES ${placeholders}
  `;

    try {
        const [result] = await pool.execute(sql, values.flat());
        return { success: true, result };
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return { success: false, error: '部分邀请码已存在' };
        }
        throw err;
    }
}

/**
 * 删除未使用的邀请码
 * @param {number} id - 邀请码ID
 * @param {string} userId - 用户ID（用于权限验证）
 * @returns {Promise<object>} - 返回删除结果
 */
export async function deleteUnusedInviteCode(id, userId) {
    const sql = `
    DELETE FROM ${USER_INVITE_CODES_TABLE} 
    WHERE id = ? AND user_id = ? AND is_used = 0
  `;
    const [result] = await pool.execute(sql, [id, userId]);
    return result;
}

/**
 * 获取邀请码统计信息
 * @param {string} userId - 用户ID
 * @returns {Promise<object>} - 返回统计信息
 */
export async function getInviteCodeStats(userId) {
    const sql = `
    SELECT 
      COUNT(*) as total_codes,
      SUM(is_used) as used_codes,
      COUNT(*) - SUM(is_used) as unused_codes
    FROM ${USER_INVITE_CODES_TABLE} 
    WHERE user_id = ?
  `;
    const [rows] = await pool.execute(sql, [userId]);
    return rows[0] || { total_codes: 0, used_codes: 0, unused_codes: 0 };
}

/**
 * 搜索邀请码（管理员功能）
 * @param {string} keyword - 搜索关键词（邀请码或用户ID）
 * @param {number} limit - 限制数量
 * @param {number} offset - 偏移量
 * @returns {Promise<Array>} - 返回搜索结果
 */
export async function searchInviteCodes(keyword, limit = 50, offset = 0) {
    const sql = `
    SELECT * FROM ${USER_INVITE_CODES_TABLE} 
    WHERE invite_code LIKE ? OR user_id LIKE ? OR used_by_user_id LIKE ?
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `;
    const searchPattern = `%${keyword}%`;
    const [rows] = await pool.execute(sql, [searchPattern, searchPattern, searchPattern, limit, offset]);
    return rows;
}


/**
 * 记录邀请关系
 */
export async function recordInviteRelation(inviterId, inviteeId, inviteCode) {
    try {
        const sql = `
            INSERT INTO user_invite_codes 
            (user_id, invite_code, is_used, used_by_user_id, used_at, created_at)
            VALUES (?, ?, 1, ?, NOW(3), NOW(3))
        `;
        const [result] = await pool.execute(sql, [inviterId, inviteCode, inviteeId]);
        return result;
    } catch (error) {
        console.error('记录邀请关系失败:', error);
        throw error;
    }
}


/**
 * 检查是否已经邀请过这个用户
 */
export async function checkAlreadyInvited(inviterId, inviteeId) {
    try {
        const sql = `
            SELECT COUNT(*) as count 
            FROM user_invite_codes 
            WHERE user_id = ? AND used_by_user_id = ? AND is_used = 1
        `;
        const [rows] = await pool.execute(sql, [inviterId, inviteeId]);
        return rows[0].count > 0;
    } catch (error) {
        console.error('检查邀请关系失败:', error);
        throw error;
    }
}

export default {
    generateInviteCode,
    useInviteCode,
    getInviteCodeByCode,
    getUserInviteCodes,
    getUserUsedInviteCodes,
    getUserUnusedInviteCodes,
    checkUserUsedInviteCode,
    getUserInviteCount,
    batchGenerateInviteCodes,
    deleteUnusedInviteCode,
    getInviteCodeStats,
    searchInviteCodes,
    checkAlreadyInvited,
    recordInviteRelation
};