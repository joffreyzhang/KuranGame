// utils/shortIdGenerator.js

/**
 * 生成短ID（默认8位）
 * @param {number} length - ID长度，默认8位
 * @returns {string} 短ID
 */
export function generateShortId(length = 8) {
    // 使用时间戳 + 随机数组合生成
    const timestamp = Date.now().toString(36); // 时间戳的36进制
    const random = Math.random().toString(36).slice(2, 11); // 随机数

    // 组合并截取指定长度
    const combined = timestamp + random;
    return combined.slice(0, length);
}

/**
 * 生成纯数字短ID
 * @param {number} length - ID长度，默认8位
 * @returns {string} 纯数字短ID
 */
export function generateNumericShortId(length = 8) {
    let result = '';
    const numbers = '0123456789';

    for (let i = 0; i < length; i++) {
        result += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }

    return result;
}