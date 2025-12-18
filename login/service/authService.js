import { pool, closePool } from './dbPool.js';

// 初始化表（如果不存在则创建）
async function ensureUserTable() {
  const connection = await pool.getConnection();
  const createSql = `
    CREATE TABLE IF NOT EXISTS \`user\` (
      id BIGINT NOT NULL AUTO_INCREMENT,
      \`userId\` VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL COMMENT '邮箱地址',
      password VARCHAR(255) NOT NULL,
      role VARCHAR(255) NOT NULL,
      \`createTime\` DATETIME(3) NOT NULL,
      \`lastLoginTime\` DATETIME(3) NULL,
      phoneNumber VARCHAR(255) NOT NULL,
      avatarUrl VARCHAR(255) NULL COMMENT '用户头像',
      nickname VARCHAR(255) NULL COMMENT '用户昵称',
      fileIds VARCHAR(521) NULL COMMENT '对应的预设游戏',
      points INT NOT NULL DEFAULT 0 COMMENT '用户积分',
      bankCardNumber VARCHAR(20) NULL COMMENT '银行卡号',
      inviteCode VARCHAR(20) NULL COMMENT '邀请码',
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_userId (\`userId\`),
      UNIQUE KEY uniq_invite_code (inviteCode),
      KEY idx_phoneNumber (phoneNumber),
      KEY idx_invite_code (inviteCode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
  `;
  
  try {
    await pool.query(createSql);
    console.log("User table ensured");
  } catch (err) {
    console.error("Failed to ensure user table:", err);
    throw err;
  }finally {
    // 🔥 确保连接总是被释放
    connection.release();
}
}

await ensureUserTable();

// 表名（MySQL 关键字需使用反引号包裹）
const TABLE = '`user`';

// 创建注册用户
export async function createUser({ userId, email, password, role, createTime, lastLoginTime, phoneNumber, avatarUrl, nickname, fileIds, inviteCode }) {
  const sql = `
    INSERT INTO ${TABLE} (` +
    '`userId`, `email`, `password`, `role`, `createTime`, `lastLoginTime`, `phoneNumber`, `avatarUrl`, `nickname`, `fileIds`, `inviteCode`) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);';
  const values = [
    userId,
    email ?? null,
    password,
    role,
    createTime ?? new Date(),
    lastLoginTime ?? null,
    phoneNumber ?? null,
    avatarUrl ?? null,
    nickname ?? null,
    fileIds ?? null,
    inviteCode ?? null
  ];
  const [result] = await pool.execute(sql, values);
  const insertId = result.insertId;
  const [rows] = await pool.execute(
    `SELECT id, \`userId\`, email, password, role, \`createTime\`, \`lastLoginTime\`, phoneNumber, avatarUrl, nickname, fileIds, inviteCode FROM ${TABLE} WHERE id = ?`,
    [insertId]
  );
  return rows[0];
}

// 通过id获取用户
export async function getUserById(id) {
  const [rows] = await pool.execute(
    `SELECT id, \`userId\`, email, password, role, \`createTime\`, \`lastLoginTime\`, phoneNumber, avatarUrl, nickname, fileIds, inviteCode FROM ${TABLE} WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// 通过userId获取用户
export async function getUserByUserId(userId) {
  const [rows] = await pool.execute(
    `SELECT id, \`userId\`, email, password, role, \`createTime\`, \`lastLoginTime\`, phoneNumber, avatarUrl, points, nickname, fileIds, inviteCode FROM ${TABLE} WHERE \`userId\` = ?`,
    [userId]
  );
  return rows[0] || null;
}

// 通过email获取用户
export async function getUserByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT id, \`userId\`, email, password, role, \`createTime\`, \`lastLoginTime\`, phoneNumber, avatarUrl, nickname, fileIds FROM ${TABLE} WHERE email = ?`,
    [email]
  );
  return rows[0] || null;
}

// 通过phoneNumber获取用户
export async function getUserByPhoneNumber(phoneNumber) {
  const [rows] = await pool.execute(
    `SELECT id, \`userId\`, email, password, role, \`createTime\`, \`lastLoginTime\`, phoneNumber, avatarUrl, points, nickname, fileIds FROM ${TABLE} WHERE phoneNumber = ?`,
    [phoneNumber]
  );
  // console.log("=======================",rows[0].points);
  // console.log("==========================",rows[0]);
  return rows[0] || null;
}

// 列表获取用户
export async function listUsers({ limit = 50, offset = 0 } = {}) {
  const [rows] = await pool.execute(
    `SELECT id, \`userId\`, email, password, role, \`createTime\`, \`lastLoginTime\`, phoneNumber, avatarUrl, nickname, fileIds
     FROM ${TABLE}
     ORDER BY id ASC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

// 更新用户
export async function updateUser(userId, fields) {
  if (!userId) {
    throw new Error('userId is required to update user');
  }
  const allowed = ['userId', 'email', 'password', 'role', 'createTime', 'lastLoginTime', 'phoneNumber', 'avatarUrl', 'nickname', 'fileIds'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) {
    return await getUserByUserId(String(userId));
  }
  const setFragments = entries.map(([k]) => `\`${k}\` = ?`);
  const values = entries.map(([, v]) => v);
  values.push(String(userId));

  const sql = `UPDATE ${TABLE} SET ${setFragments.join(', ')} WHERE \`userId\` = ?`;
  await pool.execute(sql, values);
  return await getUserByUserId(String(userId));
}

// 删除用户
export async function deleteUser(id) {
  const [result] = await pool.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

// 积分扣减
export async function deductUserPoints(userId, pointsToDeduct) {
  try {
    const deductSql = `
      UPDATE \`user\`
      SET points = points - ?
      WHERE \`userId\` = ? AND points >= ?
    `;

    const [result] = await pool.query(deductSql, [pointsToDeduct, userId, pointsToDeduct]);

    if (result.affectedRows === 0) {
      return {
        success: false,
        message: '积分扣除失败：用户不存在或积分不足'
      };
    }

    return {
      success: true,
      message: '积分扣除成功'
    };

  } catch (error) {
    console.error('扣除积分失败:', error);
    return {
      success: false,
      message: '积分扣除失败：系统错误'
    };
  }
}


// 用户充值积分
export async function addUserPoints(userId, pointsToAdd) {
  try {
    const addSql = `
      UPDATE \`user\`
      SET points = points + ?
      WHERE \`userId\` = ?
    `;

    const [result] = await pool.query(addSql, [pointsToAdd, userId]);

    if (result.affectedRows === 0) {
      return {
        success: false,
        message: '积分增加失败：用户不存在'
      };
    }

    return {
      success: true,
      message: pointsToAdd
    };

  } catch (error) {
    console.error('增加积分失败:', error);
    return {
      success: false,
      message: '积分增加失败：系统错误'
    };
  }
}

/**
 * 根据邀请码获取用户信息
 * */
export async function findUserByInviteCode(inviteCode) {
  if (!inviteCode) {
    return null;
  }

  try {
    const sql = `
      SELECT
        id,
        userId,
        phoneNumber,
        nickname,
        avatarUrl,
        points,
        inviteCode,
        createTime
      FROM \`user\`
      WHERE inviteCode = ?
    `;

    const [rows] = await pool.execute(sql, [inviteCode]);
    return rows[0] || null;

  } catch (error) {
    console.error('根据邀请码查找用户失败:', error);
    throw error;
  }
}

export default {
  createUser,
  getUserById,
  getUserByUserId,
  getUserByEmail,
  getUserByPhoneNumber,
  listUsers,
  updateUser,
  deleteUser,
  closePool,
  deductUserPoints,
  addUserPoints,
  findUserByInviteCode,
  closePool
};


