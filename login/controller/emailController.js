import express from 'express';
import { sendEmail, sendEmailCode, verifyEmailConfig } from '../util/emailUtil.js';

const router = express.Router();

/**
 * 测试邮件配置
 * GET /api/auth/email/test-config
 */
const testEmailConfig = async (req, res) => {
  try {
    const isValid = await verifyEmailConfig();
    if (isValid) {
      return res.json({
        success: true,
        message: '邮件服务器配置验证成功'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: '邮件服务器配置验证失败，请检查环境变量配置'
      });
    }
    
  } catch (error) {
    console.error('Test email config error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '邮件配置验证失败'
    });
  }
};

/**
 * 发送验证码邮件
 * POST /api/auth/email/send-verification-code
 * Body: { to: string, code: string }
 */
const sendVerificationCodeEmail = async (req, res) => {
  try {
    const { to, code } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: '收件人邮箱不能为空'
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: '验证码不能为空'
      });
    }

    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: '邮箱格式不正确'
      });
    }

    const result = await sendEmailCode(to, code);
    
    return res.json({
      success: true,
      message: '验证码邮件发送成功',
      data: result
    });
  } catch (error) {
    console.error('Send verification code email error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '验证码邮件发送失败'
    });
  }
};

/**
 * 发送自定义邮件
 * POST /api/auth/email/send
 * Body: { to: string, subject: string, text?: string, html?: string }
 */
const sendCustomEmail = async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: '收件人邮箱不能为空'
      });
    }

    if (!subject) {
      return res.status(400).json({
        success: false,
        message: '邮件主题不能为空'
      });
    }

    if (!text && !html) {
      return res.status(400).json({
        success: false,
        message: '邮件内容不能为空（text 或 html 至少提供一个）'
      });
    }

    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: '邮箱格式不正确'
      });
    }

    const result = await sendEmail({ to, subject, text, html });
    
    return res.json({
      success: true,
      message: '邮件发送成功',
      data: result
    });
  } catch (error) {
    console.error('Send custom email error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '邮件发送失败'
    });
  }
};

// 定义路由
router.get('/email/test-config', testEmailConfig);
router.post('/email/send-verification-code', sendVerificationCodeEmail);
router.post('/email/send', sendCustomEmail);

export default router;

