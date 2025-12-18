import bcrypt from 'bcryptjs';

// 密码哈希的盐值轮数（复杂度，默认 10）
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

/**
 * 哈希密码（注册时使用）
 * @param {string} plainPassword - 用户输入的原始密码（明文）
 * @returns {Promise<string>} 哈希后的密码
 */
export async function hashPassword(plainPassword) {
  try {
    const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    console.error('Password hashing error:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * 验证密码（登录时使用）
 * @param {string} plainPassword - 用户输入的原始密码（明文）
 * @param {string} hashedPassword - 数据库中存储的哈希密码
 * @returns {Promise<boolean>} 密码是否匹配
 * 
 * 工作原理：
 * 1. 用户输入原始密码（如："123456"）
 * 2. bcrypt.compare 会自动对输入的密码进行哈希
 * 3. 然后与数据库中存储的哈希值进行比较
 * 4. 返回 true/false
 */
export async function comparePassword(plainPassword, hashedPassword) {
  try {
    // bcrypt.compare 会：
    // 1. 自动对 plainPassword 进行哈希处理
    // 2. 与 hashedPassword 进行比较
    // 3. 返回是否匹配的布尔值
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}

export default {
  hashPassword,
  comparePassword
};

