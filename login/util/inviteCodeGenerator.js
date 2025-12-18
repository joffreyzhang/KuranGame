// utils/inviteCodeGenerator.js

/**
 * 生成邀请码（手机号的7位哈希值）
 * @param {string} phoneNumber - 手机号
 * @returns {string} 7位邀请码
 */
export function generateInviteCode(phoneNumber) {
    if (!phoneNumber) {
        throw new Error('手机号不能为空');
    }
    
    // 简单哈希算法生成7位固定值
    let hash = 0;
    for (let i = 0; i < phoneNumber.length; i++) {
        const char = phoneNumber.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // 取绝对值并转换为36进制，取前7位
    const code = Math.abs(hash).toString(36);
    
    // 确保是7位，不足补0，超过截取
    if (code.length < 7) {
        return code.padEnd(7, '0');
    } else if (code.length > 7) {
        return code.substr(0, 7);
    }
    
    return code;
}

/**
 * 验证手机号和邀请码是否匹配
 */
export function verifyInviteCode(phoneNumber, inviteCode) {
    const generatedCode = generateInviteCode(phoneNumber);
    return generatedCode === inviteCode;
}