import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load envs (supports running from repo root or login folder)
dotenv.config();

// QQ 邮箱 SMTP 配置
const QQ_EMAIL = process.env.QQ_EMAIL || '29269381@qq.com';
const QQ_EMAIL_PASSWORD = process.env.QQ_EMAIL_PASSWORD || 'ohwugehsxwvldcja'; // QQ 邮箱授权码，不是登录密码

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true, // 使用 SSL
  auth: {
    user: QQ_EMAIL,
    pass: QQ_EMAIL_PASSWORD
  }
});

/**
 * 发送邮件
 * @param {Object} options - 邮件选项
 * @param {string} options.to - 收件人邮箱
 * @param {string} options.subject - 邮件主题
 * @param {string} options.text - 纯文本内容（可选）
 * @param {string} options.html - HTML 内容（可选）
 * @returns {Promise<Object>} 发送结果
 */
export async function sendEmail({ to, subject, text, html }) {
  try {
    if (!QQ_EMAIL || !QQ_EMAIL_PASSWORD) {
      throw new Error('QQ邮箱配置未设置，请检查环境变量 QQ_EMAIL 和 QQ_EMAIL_PASSWORD');
    }

    if (!to || !subject) {
      throw new Error('收件人和邮件主题不能为空');
    }

    const mailOptions = {
      from: `"${process.env.QQ_EMAIL_NAME || '系统'}" <${QQ_EMAIL}>`,
      to,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('邮件发送成功:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      message: '邮件发送成功'
    };
  } catch (error) {
    console.error('邮件发送失败:', error);
    throw new Error(`邮件发送失败: ${error.message}`);
  }
}

/**
 * 发送验证码邮件
 * @param {string} to - 收件人邮箱
 * @param {string} code - 验证码
 * @returns {Promise<Object>} 发送结果
 */
export async function sendEmailCode(to, code) {
  const subject = '验证码';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>您的验证码</h2>
      <p>您的验证码是：<strong style="font-size: 24px; color: #1890ff;">${code}</strong></p>
      <p>验证码有效期为 5 分钟，请勿泄露给他人。</p>
      <p style="color: #999; font-size: 12px;">如果这不是您的操作，请忽略此邮件。</p>
    </div>
  `;
  const text = `您的验证码是：${code}，验证码有效期为 10 分钟，请勿泄露给他人。`;

  return await sendEmail({ to, subject, text, html });
}

/**
 * 测试邮件配置
 * @returns {Promise<boolean>} 配置是否有效
 */
export async function verifyEmailConfig() {
  try {
    await transporter.verify();
    console.log('邮件服务器配置验证成功');
    return true;
  } catch (error) {
    console.error('邮件服务器配置验证失败:', error);
    return false;
  }
}

export default {
  sendEmail,
  sendEmailCode,
  verifyEmailConfig
};

