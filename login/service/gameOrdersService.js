import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './dbPool.js';
import {addUserPoints} from './authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const TABLE = '`game_orders`';

// 确保表存在
async function ensurePaymentOrdersTable() {
  const connection = await pool.getConnection();
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`out_trade_no\` VARCHAR(64) NOT NULL COMMENT '商户订单号（业务主键）',
      \`user_id\` BIGINT NOT NULL COMMENT '用户ID（关联user表）',
      \`file_id\` VARCHAR(191) NOT NULL COMMENT '游戏文件ID（关联games表）',
      \`description\` VARCHAR(255) NOT NULL COMMENT '订单描述/游戏名称',
      \`total_amount\` INT NOT NULL COMMENT '订单总金额（单位：分）',
      \`payment_status\` ENUM('pending', 'paid', 'failed', 'refunded', 'cancelled') NOT NULL DEFAULT 'pending' COMMENT '支付状态',
      \`wechat_transaction_id\` VARCHAR(64) NULL COMMENT '微信支付订单号',
      \`wechat_openid\` VARCHAR(128) NULL COMMENT '支付者微信openid',
      \`notify_data\` TEXT NULL COMMENT '微信回调的完整JSON数据',
      \`notify_count\` INT NOT NULL DEFAULT 0 COMMENT '回调通知次数',
      \`last_notify_at\` DATETIME(3) NULL COMMENT '最后一次回调时间',
      \`created_at\` DATETIME(3) NOT NULL COMMENT '订单创建时间',
      \`paid_at\` DATETIME(3) NULL COMMENT '支付完成时间',
      \`updated_at\` DATETIME(3) NOT NULL COMMENT '更新时间',
      \`remark\` VARCHAR(512) NULL COMMENT '备注',
      \`qr_data_url\` TEXT NULL COMMENT '支付二维码数据URL',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_out_trade_no\` (\`out_trade_no\`),
      KEY \`idx_user_id\` (\`user_id\`),
      KEY \`idx_file_id\` (\`file_id\`),
      KEY \`idx_payment_status\` (\`payment_status\`),
      KEY \`idx_wechat_transaction_id\` (\`wechat_transaction_id\`),
      KEY \`idx_created_at\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付订单表';
  `;
  try {
    await pool.query(createSql);
  } catch (error) {
    console.error('创建 payment_orders 表失败:', error);
  }finally {
    // 🔥 确保连接总是被释放
    connection.release();
}
}

// 初始化表
await ensurePaymentOrdersTable();

// ==================== CRUD 操作 ====================

/**
 * 创建订单
 * @param {Object} payload - 订单数据
 * @param {string} payload.out_trade_no - 商户订单号（必填）
 * @param {number} payload.user_id - 用户ID（必填）
 * @param {string} payload.file_id - 游戏文件ID（必填）
 * @param {string} payload.description - 订单描述（必填）
 * @param {number} payload.total_amount - 订单金额，单位：分（必填）
 * @param {string} payload.remark - 备注（可选）
 * @returns {Promise<Object>} 创建的订单对象
 */
export async function createOrder(payload) {
  const now = new Date();
  const sql = `
    INSERT INTO ${TABLE} 
    (out_trade_no, user_id, description, total_amount, payment_status, qr_data_url ,created_at, updated_at, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    payload.out_trade_no,
    payload.user_id,
    payload.description,
    payload.total_amount,
    payload.status,
    payload.qr_data_url,
    now,
    now,
    payload.remark || null
  ];
  
  const [result] = await pool.execute(sql, values);
  return await getOrderById(result.insertId);
}

/**
 * 根据ID获取订单
 * @param {number} id - 订单ID
 * @returns {Promise<Object|null>} 订单对象
 */
export async function getOrderById(id) {
  const sql = `SELECT * FROM ${TABLE} WHERE id = ?`;
  const [rows] = await pool.execute(sql, [id]);
  return rows[0] || null;
}

/**
 * 根据商户订单号获取订单
 * @param {string} outTradeNo - 商户订单号
 * @returns {Promise<Object|null>} 订单对象
 */
export async function getOrderByOutTradeNo(outTradeNo) {
  const sql = `SELECT * FROM ${TABLE} WHERE out_trade_no = ?`;
  const [rows] = await pool.execute(sql, [outTradeNo]);
  return rows[0] || null;
}

/**
 * 根据微信交易号获取订单
 * @param {string} transactionId - 微信支付订单号
 * @returns {Promise<Object|null>} 订单对象
 */
export async function getOrderByTransactionId(transactionId) {
  const sql = `SELECT * FROM ${TABLE} WHERE wechat_transaction_id = ?`;
  const [rows] = await pool.execute(sql, [transactionId]);
  return rows[0] || null;
}

/**
 * 根据用户ID获取订单列表
 * @param {number} userId - 用户ID
 * @param {Object} options - 查询选项
 * @param {string} options.status - 支付状态筛选（可选）
 * @param {number} options.limit - 限制数量（可选）
 * @param {number} options.offset - 偏移量（可选）
 * @returns {Promise<Array>} 订单列表
 */
export async function getOrdersByUserId(userId, options = {}) {
  let sql = `SELECT * FROM ${TABLE} WHERE user_id = ?`;
  const values = [userId];
  
  if (options.status) {
    sql += ` AND payment_status = ?`;
    values.push(options.status);
  }
  
  sql += ` ORDER BY created_at DESC`;
  
  if (options.limit) {
    sql += ` LIMIT ?`;
    values.push(options.limit);
    
    if (options.offset) {
      sql += ` OFFSET ?`;
      values.push(options.offset);
    }
  }
  
  const [rows] = await pool.execute(sql, values);
  return rows;
}

/**
 * 根据游戏文件ID获取订单列表
 * @param {string} fileId - 游戏文件ID
 * @returns {Promise<Array>} 订单列表
 */
export async function getOrdersByFileId(fileId) {
  const sql = `SELECT * FROM ${TABLE} WHERE file_id = ? ORDER BY created_at DESC`;
  const [rows] = await pool.execute(sql, [fileId]);
  return rows;
}

/**
 * 更新订单支付状态（支付成功时调用）
 * @param {string} outTradeNo - 商户订单号
 * @param {Object} paymentData - 支付数据
 * @param {string} paymentData.wechat_transaction_id - 微信支付订单号
 * @param {string} paymentData.wechat_openid - 支付者openid
 * @param {string} paymentData.notify_data - 回调完整数据（JSON字符串）
 * @returns {Promise<Object>} 更新后的订单对象
 */
export async function updateOrderToPaid(outTradeNo, paymentData) {
  const now = new Date();
  const sql = `
    UPDATE ${TABLE} 
    SET payment_status = 'paid',
        wechat_transaction_id = ?,
        wechat_openid = ?,
        paid_at = ?,
        notify_data = ?,
        notify_count = notify_count + 1,
        last_notify_at = ?,
        updated_at = ?
    WHERE out_trade_no = ?
     AND payment_status != 'paid'
  `;
  
  const values = [
    paymentData.wechat_transaction_id,
    paymentData.wechat_openid,
    now,
    paymentData.notify_data ? JSON.stringify(paymentData.notify_data) : null,
    now,
    now,
    outTradeNo
  ];
  
  await pool.execute(sql, values);
   // 获取订单信息以获取用户ID和支付金额
   const order = await getOrderByOutTradeNo(outTradeNo);
  console.log("=======================order.total_amount",order.total_amount);
  console.log("=======================order.user_id",order.user_id);
   // 增加用户积分：一块钱对应10个积分
   if (order && order.user_id && order.total_amount) {
    // console.log("======================================order.total_amount / 100",order.total_amount / 100);
    // console.log("======================================Math.floor(order.total_amount / 100)",Math.floor(order.total_amount / 100));
    // console.log("======================================Math.floor(order.total_amount / 100) * 10",Math.floor(order.total_amount / 100) * 10);
     const pointsToAdd = (order.total_amount / 100) * 10; // total_amount是分，除以100得到元，再乘以10得到积分
     console.log("===============================pointsToAdd",pointsToAdd);
     const result = await addUserPoints(order.user_id, pointsToAdd);
   }
   
   return order;
}

/**
 * 更新订单状态
 * @param {string} outTradeNo - 商户订单号
 * @param {string} status - 新状态：'pending', 'paid', 'failed', 'refunded', 'cancelled'
 * @param {string} remark - 备注（可选）
 * @returns {Promise<Object>} 更新后的订单对象
 */
export async function updateOrderStatus(outTradeNo, status, remark = null) {
  const sql = `
    UPDATE ${TABLE} 
    SET payment_status = ?,
        updated_at = ?,
        remark = COALESCE(?, remark)
    WHERE out_trade_no = ?
  `;
  
  await pool.execute(sql, [status, new Date(), remark, outTradeNo]);
  return await getOrderByOutTradeNo(outTradeNo);
}

/**
 * 增加回调通知次数（用于记录回调重试）
 * @param {string} outTradeNo - 商户订单号
 * @param {string} notifyData - 回调数据（可选）
 * @returns {Promise<void>}
 */
export async function incrementNotifyCount(outTradeNo, notifyData = null) {
  const sql = `
    UPDATE ${TABLE} 
    SET notify_count = notify_count + 1,
        last_notify_at = ?,
        notify_data = COALESCE(?, notify_data),
        updated_at = ?
    WHERE out_trade_no = ?
  `;
  
  const notifyDataStr = notifyData ? JSON.stringify(notifyData) : null;
  await pool.execute(sql, [new Date(), notifyDataStr, new Date(), outTradeNo]);
}

/**
 * 检查订单是否已支付（防止重复处理）
 * @param {string} outTradeNo - 商户订单号
 * @returns {Promise<boolean>} 是否已支付
 */
export async function isOrderPaid(outTradeNo) {
  const order = await getOrderByOutTradeNo(outTradeNo);
  return order && order.payment_status === 'paid';
}

/**
 * 验证订单金额是否匹配
 * @param {string} outTradeNo - 商户订单号
 * @param {number} amount - 支付金额（单位：分）
 * @returns {Promise<boolean>} 金额是否匹配
 */
export async function validateOrderAmount(outTradeNo, amount) {
  const order = await getOrderByOutTradeNo(outTradeNo);
  return order && order.total_amount === amount;
}

/**
 * 获取用户的已支付订单（用于判断用户是否已购买某游戏）
 * @param {number} userId - 用户ID
 * @param {string} fileId - 游戏文件ID
 * @returns {Promise<Object|null>} 订单对象
 */
export async function getUserPaidOrderForGame(userId, fileId) {
  const sql = `
    SELECT * FROM ${TABLE} 
    WHERE user_id = ? AND file_id = ? AND payment_status = 'paid'
    ORDER BY paid_at DESC
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [userId, fileId]);
  return rows[0] || null;
}

/**
 * 统计订单数量（按状态）
 * @param {Object} options - 查询选项
 * @param {number} options.userId - 用户ID（可选）
 * @param {string} options.status - 支付状态（可选）
 * @returns {Promise<number>} 订单数量
 */
export async function countOrders(options = {}) {
  let sql = `SELECT COUNT(*) as count FROM ${TABLE} WHERE 1=1`;
  const values = [];
  
  if (options.userId) {
    sql += ` AND user_id = ?`;
    values.push(options.userId);
  }
  
  if (options.status) {
    sql += ` AND payment_status = ?`;
    values.push(options.status);
  }
  
  const [rows] = await pool.execute(sql, values);
  return rows[0].count;
}

/**
 * 通过用户ID和文件ID查询订单的支付状态
 * @param {number} userId - 用户ID
 * @param {string} fileId - 游戏文件ID
 * @returns {Promise<string|null>} 支付状态：'pending', 'paid', 'failed', 'refunded', 'cancelled'，如果没有订单则返回 null
 */
export async function getPaymentStatusByUserIdAndFileId(userId, fileId) {
  const sql = `
    SELECT payment_status FROM ${TABLE} 
    WHERE user_id = ? AND file_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [userId, fileId]);
  return rows[0]?.payment_status || null;
}

// 根据fileId查询到对应的total_amount，有多条数据的file_id是一样的，所以最后的total_amount要聚合一下
/**
 * 根据fileId查询并聚合total_amount（同一file_id可能有多条订单）
 * @param {string} fileId - 游戏文件ID
 * @returns {Promise<number>} 聚合后的总金额（单位：分），如果没有订单则返回 0
 */
export async function getTotalAmountByFileId(fileId) {
  const sql = `
    SELECT SUM(total_amount) as total_amount_sum
    FROM ${TABLE}
    WHERE file_id = ?
  `;
  const [rows] = await pool.execute(sql, [fileId]);
  return rows[0]?.total_amount_sum ? Number(rows[0].total_amount_sum) : 0;
}

// 通过传入的userId查询用户购买过的（payment_status = 'paid'）file_id数据
export async function getUserPaidFileIds(userId) {
  const sql = `
    SELECT file_id FROM ${TABLE}
    WHERE user_id = ? AND payment_status = 'paid'
  `;
  const [rows] = await pool.execute(sql, [userId]);
  return rows.map(row => row.file_id);
}

// 获取用户的待支付订单
export async function getPendingOrderByUserId(userId) {
  // const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  // console.log(oneMinuteAgo.toLocaleString());
  // console.log("=========================oneMinuteAgo",oneMinuteAgo);
  const sql = `
    SELECT out_trade_no, qr_data_url
    FROM ${TABLE}
    WHERE user_id = ?
      AND payment_status = 'pending'
      AND created_at > DATE_SUB(CONVERT_TZ(NOW(), 'UTC', '+08:00'), INTERVAL 30 SECOND)
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [userId]);
  return rows[0] || null;
}

//更新订单号与二维码
export async function updateOrderQrUrl(outTradeNo, qrDataUrl) {
  const now = new Date();
  const sql = `
    UPDATE ${TABLE}
    SET qr_data_url = ?,
        updated_at = ?
    WHERE out_trade_no = ?
  `;
  await pool.execute(sql, [qrDataUrl, now, outTradeNo]);
  return await getOrderByOutTradeNo(outTradeNo);
}

export default {
  createOrder,
  getOrderById,
  getOrderByOutTradeNo,
  getOrderByTransactionId,
  getOrdersByUserId,
  getOrdersByFileId,
  updateOrderToPaid,
  updateOrderStatus,
  incrementNotifyCount,
  isOrderPaid,
  validateOrderAmount,
  getUserPaidOrderForGame,
  countOrders,
  getPaymentStatusByUserIdAndFileId,
  getTotalAmountByFileId,
  getUserPaidFileIds,
  getPendingOrderByUserId,
  updateOrderQrUrl
};