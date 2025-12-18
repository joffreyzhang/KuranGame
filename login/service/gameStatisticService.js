import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './dbPool.js';
import { getTotalAmountByFileId } from './gameOrdersService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const TABLE = 'game_statistics';

/**
 * 创建统计数据记录
 * @param {Object} data - 统计数据对象
 * @param {string} data.file_id - 文件ID
 * @param {string|Date} data.stat_date - 统计日期 (YYYY-MM-DD格式或Date对象)
 * @param {number} data.pv_count - PV统计
 * @param {number} data.uv_count - UV统计
 * @param {number} data.conversion_count - 转换统计
 * @param {number} data.like_count - 点赞数量
 * @param {number|null} data.conversion_rate - 转换率（可选）
 * @returns {Promise<Object>} 插入结果
 */
export async function createStatistic(data) {
  const {
    file_id,
    stat_date,
    pv_count,
    uv_count,
    conversion_count,
    like_count,
    conversion_rate = null
  } = data;

  const now = new Date();
  
  // 格式化日期
  const formattedDate = stat_date instanceof Date 
    ? stat_date.toISOString().split('T')[0] 
    : stat_date;

  const sql = `
    INSERT INTO ${TABLE}
      (\`file_id\`, \`stat_date\`, \`pv_count\`, \`uv_count\`, \`like_count\`, \`conversion_count\`, \`conversion_rate\`, \`created_at\`, \`updated_at\`)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    file_id,
    formattedDate,
    pv_count,
    uv_count,
    like_count,
    conversion_count,
    conversion_rate,
    now,
    now
  ]);

  return {
    id: result.insertId,
    affectedRows: result.affectedRows
  };
}

/**
 * 根据ID获取统计数据
 * @param {number} id - 记录ID
 * @returns {Promise<Object|null>} 统计数据对象，不存在返回null
 */
export async function getStatisticById(id) {
  const sql = `SELECT * FROM ${TABLE} WHERE \`id\` = ?`;
  const [rows] = await pool.query(sql, [id]);
  return rows[0] || null;
}

/**
 * 根据file_id和stat_date获取统计数据
 * @param {string} fileId - 文件ID
 * @param {string|Date} statDate - 统计日期
 * @returns {Promise<Object|null>} 统计数据对象，不存在返回null
 */
export async function getStatisticByFileIdAndDate(fileId, statDate) {
  const formattedDate = statDate instanceof Date 
    ? statDate.toISOString().split('T')[0] 
    : statDate;

  const sql = `SELECT * FROM ${TABLE} WHERE \`file_id\` = ? AND \`stat_date\` = ?`;
  const [rows] = await pool.query(sql, [fileId, formattedDate]);
  return rows[0] || null;
}

/**
 * 根据file_id获取所有统计数据
 * @param {string} fileId - 文件ID
 * @param {Object} options - 查询选项
 * @param {number} options.limit - 限制返回数量
 * @param {number} options.offset - 偏移量
 * @param {string} options.orderBy - 排序字段，默认 'stat_date'
 * @param {string} options.order - 排序方向，'ASC' 或 'DESC'，默认 'DESC'
 * @returns {Promise<Array>} 统计数据数组
 */
export async function getStatisticsByFileId(fileId, options = {}) {
  const {
    limit,
    offset = 0,
    orderBy = 'stat_date',
    order = 'DESC'
  } = options;

  let sql = `SELECT * FROM ${TABLE} WHERE \`file_id\` = ? ORDER BY \`${orderBy}\` ${order}`;
  
  if (limit) {
    sql += ` LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [fileId, limit, offset]);
    return rows;
  } else {
    const [rows] = await pool.query(sql, [fileId]);
    return rows;
  }
}

/**
 * 根据file_id获取总的统计数据（pv_count, uv_count, conversion_count）
 * @param {string} fileId - 文件ID
 * @returns {Promise<Object>} 总统计数据对象
 */
export async function getTotalStatisticsByFileId(fileId) {
  const sql = `
    SELECT 
      SUM(\`pv_count\`) as total_pv_count,
      SUM(\`uv_count\`) as total_uv_count,
      SUM(\`conversion_count\`) as total_conversion_count,
      SUM(\`like_count\`) as total_like_count,
      COUNT(*) as record_count
    FROM ${TABLE}
    WHERE \`file_id\` = ?
  `;

  const [rows] = await pool.query(sql, [fileId]);
  const result = rows[0];

// 获取收益数据
  const total_amount = await getTotalAmountByFileId(fileId);

  return {
    file_id: fileId,
    total_pv_count: Number(result.total_pv_count) || 0,
    total_uv_count: Number(result.total_uv_count) || 0,
    total_conversion_count: Number(result.total_conversion_count) || 0,
    total_like_count: Number(result.total_like_count) || 0,
    record_count: Number(result.record_count) || 0,
    total_amount: total_amount
  };
}

/**
 * 更新统计数据
 * @param {number} id - 记录ID
 * @param {Object} data - 要更新的数据
 * @returns {Promise<Object>} 更新结果
 */
export async function updateStatistic(id, data) {
  const fields = [];
  const values = [];

  // 允许更新的字段
  const allowedFields = ['pv_count', 'uv_count', 'conversion_count', 'like_count', 'conversion_rate', 'stat_date'];
  
  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      fields.push(`\`${key}\` = ?`);
      // 如果是日期字段，格式化处理
      if (key === 'stat_date' && value instanceof Date) {
        values.push(value.toISOString().split('T')[0]);
      } else {
        values.push(value);
      }
    }
  }

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  // 添加 updated_at
  fields.push('`updated_at` = ?');
  values.push(new Date());
  values.push(id);

  const sql = `UPDATE ${TABLE} SET ${fields.join(', ')} WHERE \`id\` = ?`;
  const [result] = await pool.query(sql, values);

  return {
    affectedRows: result.affectedRows,
    changedRows: result.changedRows
  };
}

/**
 * 删除统计数据
 * @param {number} id - 记录ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteStatistic(id) {
  const sql = `DELETE FROM ${TABLE} WHERE \`id\` = ?`;
  const [result] = await pool.query(sql, [id]);
  return {
    affectedRows: result.affectedRows
  };
}

/**
 * 根据file_id和stat_date删除统计数据
 * @param {string} fileId - 文件ID
 * @param {string|Date} statDate - 统计日期
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteStatisticByFileIdAndDate(fileId, statDate) {
  const formattedDate = statDate instanceof Date 
    ? statDate.toISOString().split('T')[0] 
    : statDate;

  const sql = `DELETE FROM ${TABLE} WHERE \`file_id\` = ? AND \`stat_date\` = ?`;
  const [result] = await pool.query(sql, [fileId, formattedDate]);
  return {
    affectedRows: result.affectedRows
  };
}

/**
 * 批量创建统计数据
 * @param {Array<Object>} dataArray - 统计数据数组
 * @returns {Promise<Object>} 插入结果
 */
export async function createStatisticsBatch(dataArray) {
  if (!dataArray || dataArray.length === 0) {
    return { affectedRows: 0 };
  }

  const now = new Date();
  const values = dataArray.map(data => {
    const {
      file_id,
      stat_date,
      pv_count,
      uv_count,
      conversion_count,
      like_count,
      conversion_rate = null
    } = data;

    const formattedDate = stat_date instanceof Date 
      ? stat_date.toISOString().split('T')[0] 
      : stat_date;

    return [
      file_id,
      formattedDate,
      pv_count,
      uv_count,
      like_count,
      conversion_count,
      conversion_rate,
      now,
      now
    ];
  });

  const sql = `
    INSERT INTO ${TABLE}
      (\`file_id\`, \`stat_date\`, \`pv_count\`, \`uv_count\`, \`like_count\`, \`conversion_count\`, \`conversion_rate\`, \`created_at\`, \`updated_at\`)
    VALUES ?
  `;

  const [result] = await pool.query(sql, [values]);
  return {
    affectedRows: result.affectedRows,
    insertIds: result.insertId ? Array.from({ length: result.affectedRows }, (_, i) => result.insertId + i) : []
  };
}

