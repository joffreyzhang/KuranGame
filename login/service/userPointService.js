import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './dbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const USER_POINT_ACTIVITIES_TABLE = '`user_point_activities`';

/**
 * 确保 user_point_activities 表存在
 */
async function ensureUserPointActivitiesTable() {
    const connection = await pool.getConnection();
    const createSql = `
    CREATE TABLE IF NOT EXISTS ${USER_POINT_ACTIVITIES_TABLE} (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(191) NOT NULL COMMENT '用户ID',
    activity_id VARCHAR(225) NOT NULL COMMENT '活动ID',
    activity_type VARCHAR(50) NOT NULL COMMENT '活动类型',
    points INT NOT NULL DEFAULT 0 COMMENT '积分值',
    description VARCHAR(200) COMMENT '活动描述',
    status TINYINT DEFAULT 1 COMMENT '状态：0-无效 1-有效',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user_id (user_id),
    KEY idx_activity_id (activity_id),
    KEY idx_activity_type (activity_type),
    KEY idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户积分活动表';
`;
    try {
        await pool.query(createSql);
        console.log("User point activities table ensured");
    } catch (err) {
        console.error("Failed to ensure user_point_activities table:", err);
        throw err;
    }finally {
        // 🔥 确保连接总是被释放
        connection.release();
    }
}


// 初始化表结构
ensureUserPointActivitiesTable();

/**
 * 添加积分活动记录
 * @param {string} userId - 用户ID
 * @param {string} activityType - 活动类型
 * @param {number} points - 积分值
 * @param {string} [description] - 活动描述
 * @param {number} [status=1] - 状态 (默认1)
 * @param {number} [activityId] - 活动ID（可选）
 * @returns {Promise<object>} - 返回插入结果
 */
export async function addPointActivity(userId, activityType, points, description = null, status = 1, activityId = null) {
    const sql = `
    INSERT INTO ${USER_POINT_ACTIVITIES_TABLE}
    (user_id, activity_id, activity_type, points, description, status)
    VALUES (?, ?, ?, ?, ?, ?)
`;
    const [result] = await pool.execute(sql, [userId, activityId, activityType, points, description, status]);
    return result;
}

/**
 * 根据ID获取积分活动记录
 * @param {number} id - 记录ID
 * @returns {Promise<object|null>} - 返回记录或null
 */
export async function getPointActivityById(id) {
    const sql = `SELECT * FROM ${USER_POINT_ACTIVITIES_TABLE} WHERE id = ?`;
    const [rows] = await pool.execute(sql, [id]);
    return rows[0] || null;
}

/**
 * 获取用户的积分活动记录
 * @param {number} userId - 用户ID
 * @param {number} limit - 限制数量
 * @param {number} offset - 偏移量
 * @returns {Promise<Array>} - 返回记录数组
 */
export async function getUserPointActivities(userId, limit = 20, offset = 0) {
    const sql = `
    SELECT * FROM ${USER_POINT_ACTIVITIES_TABLE}
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
`;
    const [rows] = await pool.execute(sql, [userId, limit, offset]);
    return rows;
}

/**
 * 获取用户的总积分
 * @param {number} userId - 用户ID
 * @returns {Promise<number>} - 返回总积分
 */
export async function getUserTotalPoints(userId) {
    const sql = `
    SELECT COALESCE(SUM(points), 0) as total_points
    FROM ${USER_POINT_ACTIVITIES_TABLE}
    WHERE user_id = ? AND status = 1
`;
    const [rows] = await pool.execute(sql, [userId]);
    return rows[0].total_points;
}

/**
 * 根据活动类型获取用户积分记录
 * @param {number} userId - 用户ID
 * @param {string} activityType - 活动类型
 * @returns {Promise<Array>} - 返回记录数组
 */
export async function getUserActivitiesByType(userId, activityType) {
    const sql = `
    SELECT * FROM ${USER_POINT_ACTIVITIES_TABLE}
    WHERE user_id = ? AND activity_type = ?
    ORDER BY created_at DESC
`;
    const [rows] = await pool.execute(sql, [userId, activityType]);
    return rows;
}

/**
 * 更新积分活动记录状态
 * @param {number} id - 记录ID
 * @param {number} status - 新状态
 * @returns {Promise<object>} - 返回更新结果
 */
export async function updatePointActivityStatus(id, status) {
    const sql = `
    UPDATE ${USER_POINT_ACTIVITIES_TABLE}
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`;
    const [result] = await pool.execute(sql, [status, id]);
    return result;
}

/**
 * 更新积分活动记录
 * @param {number} id - 记录ID
 * @param {object} updates - 更新字段对象
 * @returns {Promise<object>} - 返回更新结果
 */
export async function updatePointActivity(id, updates) {
    const allowedFields = ['points', 'description', 'status', 'activity_type', 'activity_id'];
    const setFields = [];
    const values = [];

    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            setFields.push(`${field} = ?`);
            values.push(updates[field]);
        }
    });

    if (setFields.length === 0) {
        throw new Error('No valid fields to update');
    }

    values.push(id);
    const sql = `
    UPDATE ${USER_POINT_ACTIVITIES_TABLE}
    SET ${setFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`;

    const [result] = await pool.execute(sql, values);
    return result;
}

/**
 * 删除积分活动记录（软删除）
 * @param {number} id - 记录ID
 * @returns {Promise<object>} - 返回更新结果
 */
export async function softDeletePointActivity(id) {
    return await updatePointActivityStatus(id, 0);
}

/**
 * 硬删除积分活动记录
 * @param {number} id - 记录ID
 * @returns {Promise<object>} - 返回删除结果
 */
export async function deletePointActivity(id) {
    const sql = `DELETE FROM ${USER_POINT_ACTIVITIES_TABLE} WHERE id = ?`;
    const [result] = await pool.execute(sql, [id]);
    return result;
}

/**
 * 获取用户今日通过某活动类型获得的积分
 * @param {number} userId - 用户ID
 * @param {string} activityType - 活动类型
 * @returns {Promise<number>} - 返回今日积分
 */
export async function getUserTodayPointsByType(userId, activityType) {
    const sql = `
    SELECT COALESCE(SUM(points), 0) as today_points
    FROM ${USER_POINT_ACTIVITIES_TABLE}
    WHERE user_id = ?
    AND activity_type = ?
    AND status = 1
    AND DATE(created_at) = CURDATE()
`;
    const [rows] = await pool.execute(sql, [userId, activityType]);
    return rows[0].today_points;
}

/**
 * 检查用户是否已完成某活动
 * @param {number} userId - 用户ID
 * @param {string} activityType - 活动类型
 * @param {string} date - 日期 (YYYY-MM-DD), 默认今天
 * @returns {Promise<boolean>} - 返回是否完成
 */
export async function checkUserActivityCompleted(userId, activityType, date = null) {
    const whereConditions = ['user_id = ?', 'activity_type = ?', 'status = 1'];
    const params = [userId, activityType];

    if (date) {
        whereConditions.push('DATE(created_at) = ?');
        params.push(date);
    } else {
        whereConditions.push('DATE(created_at) = CURDATE()');
    }

    const sql = `
    SELECT COUNT(*) as count
    FROM ${USER_POINT_ACTIVITIES_TABLE}
    WHERE ${whereConditions.join(' AND ')}`;

    const [rows] = await pool.execute(sql, params);
    return rows[0].count > 0;
}

/**
 * 获取积分排行榜
 * @param {number} limit - 前N名
 * @returns {Promise<Array>} - 返回排行榜
 */
export async function getPointsRanking(limit = 10) {
    const sql = `
    SELECT
    user_id,
    SUM(points) as total_points,
    COUNT(*) as activity_count
    FROM ${USER_POINT_ACTIVITIES_TABLE}
    WHERE status = 1
    GROUP BY user_id
    ORDER BY total_points DESC
    LIMIT ?
`;
    const [rows] = await pool.execute(sql, [limit]);
    return rows;
}

export default {
    addPointActivity,
    getPointActivityById,
    getUserPointActivities,
    getUserTotalPoints,
    getUserActivitiesByType,
    updatePointActivityStatus,
    updatePointActivity,
    softDeletePointActivity,
    deletePointActivity,
    getUserTodayPointsByType,
    checkUserActivityCompleted,
    getPointsRanking
};