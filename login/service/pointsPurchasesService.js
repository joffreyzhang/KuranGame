import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './dbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const TABLE = '`points_purchases`';

async function ensurePointsPurchasesTable() {
    const connection = await pool.getConnection();
    const createSql = `
    CREATE TABLE IF NOT EXISTS ${TABLE} (
    \`id\` BIGINT NOT NULL AUTO_INCREMENT,
    \`purchase_no\` VARCHAR(64) NOT NULL COMMENT '购买订单号',
    \`user_id\` VARCHAR(255) NOT NULL COMMENT '用户ID',
    \`file_id\` VARCHAR(255) NOT NULL COMMENT '游戏文件ID',
    \`game_title\` VARCHAR(120) NOT NULL COMMENT '游戏名称',
    \`points_cost\` INT NOT NULL COMMENT '消耗积分',
    \`purchase_status\` ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending' COMMENT '购买状态',
    \`created_at\` DATETIME(3) NOT NULL,
    \`updated_at\` DATETIME(3) NOT NULL,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uniq_purchase_no\` (\`purchase_no\`),
    KEY \`idx_user_id\` (\`user_id\`),
    KEY \`idx_file_id\` (\`file_id\`),
    KEY \`idx_status\` (\`purchase_status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分购买记录';
`;
try {
    await pool.query(createSql);} catch (error) {
        console.error("创建 payment_orders 表失败:", error);
        throw error;
    } finally {
        connection.release();
    }
}

await ensurePointsPurchasesTable();

// 创建一条积分消费记录
export async function createPointsPurchase({
    purchase_no,
    user_id,
    file_id,
    game_title,
    points_cost,
    purchase_status = 'pending'
}) {
    const now = new Date();
    const sql = `
      INSERT INTO ${TABLE}
      (purchase_no, user_id, file_id, game_title, points_cost, purchase_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [purchase_no, user_id, file_id, game_title, points_cost, purchase_status, now, now];
    const [result] = await pool.execute(sql, values);
    return await getPointsPurchaseById(result.insertId);
}

// 根据自增ID查询一条记录
export async function getPointsPurchaseById(id) {
    const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
}

// 根据业务订单号查询一条记录
export async function getPointsPurchaseByNo(purchaseNo) {
    const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE purchase_no = ?`, [purchaseNo]);
    return rows[0] || null;
}

// 分页获取积分购买记录，可按用户或状态筛选
export async function listPointsPurchases({ userId, status, limit = 50, offset = 0 } = {}) {
    let sql = `SELECT * FROM ${TABLE} WHERE 1 = 1`;
    const values = [];
    if (userId) {
        sql += ` AND user_id = ?`;
        values.push(userId);
    }
    if (status) {
        sql += ` AND purchase_status = ?`;
        values.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    const [rows] = await pool.execute(sql, values);
    return rows;
}

// 更新指定订单号对应的状态
export async function updatePointsPurchaseStatus(purchaseNo, status) {
    const now = new Date();
    const sql = `
    UPDATE ${TABLE}
    SET purchase_status = ?,
        updated_at = ?
    WHERE purchase_no = ?
    `;
    await pool.execute(sql, [status, now, purchaseNo]);
    return await getPointsPurchaseByNo(purchaseNo);
}

// 删除指定ID的记录
export async function deletePointsPurchase(id) {
    const [result] = await pool.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return result.affectedRows > 0;
}

// 检查用户是否已经购买过该游戏
export async function checkUserAlreadyPurchased(userId, fileId) {
    try {
        const sql = `
        SELECT COUNT(*) as count
        FROM points_purchases
        WHERE user_id = ? AND file_id = ? AND purchase_status = 'completed'
    `;
        const [rows] = await pool.query(sql, [userId, fileId]);
        return rows[0].count > 0;
    } catch (error) {
        console.error('检查购买记录失败:', error);
        throw error;
    }
}

// 根据userId查询用户购买过的游戏fileIds（返回数组）
export async function getUserPaidFileIdsInPoints(userId) {
    try {
        const sql = `
        SELECT file_id
        FROM points_purchases
        WHERE user_id = ?
        AND purchase_status = 'completed'
    `;
        const [rows] = await pool.query(sql, [userId]);

        // 直接将file_id提取到数组中
        const fileIds = rows.map(row => row.file_id);

        return fileIds;

    } catch (error) {
        console.error('查询用户积分购买fileIds失败:', error);
        throw error;
    }
}

// 删除订单
// 根据user_id和file_id删除对应订单
export async function deletePointsPurchaseByUserAndFile(userId, fileId) {
    try {
        const sql = `
        DELETE FROM points_purchases
        WHERE user_id = ? AND file_id = ?
    `;

        const [result] = await pool.query(sql, [userId, fileId]);

        return {
            success: true,
            affectedRows: result.affectedRows
        };

    } catch (error) {
        console.error('删除积分购买订单失败:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

export default {
    createPointsPurchase,
    getPointsPurchaseById,
    getPointsPurchaseByNo,
    listPointsPurchases,
    updatePointsPurchaseStatus,
    deletePointsPurchase,
    checkUserAlreadyPurchased,
    getUserPaidFileIdsInPoints,
    deletePointsPurchaseByUserAndFile
};