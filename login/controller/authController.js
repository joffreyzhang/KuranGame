// 加密工具库，用于id生成和密码哈希
import crypto from 'crypto';
import {
  createUser,
  getUserByUserId,
  getUserByEmail,
  getUserByPhoneNumber,
  updateUser,
  deductUserPoints
} from '../service/authService.js';
import { getGameDataByFileId } from '../service/gamesService.js';
import { updatePointsPurchaseStatus, createPointsPurchase, checkUserAlreadyPurchased} from '../service/pointsPurchasesService.js';
import { signTokens, signToken, verifyRefreshToken, ACCESS_TOKEN_EXPIRY_SECONDS } from '../util/tokenUtil.js';
import { addPointActivity, getUserTotalPoints, checkUserActivityCompleted } from '../service/userPointService.js';
import { hashPassword, comparePassword } from '../util/passwordUtil.js';
import redisClient from '../storage/redisClient.js';
import { sendEmailCode } from '../util/emailUtil.js';
import { generateInviteCode } from '../util/inviteCodeGenerator.js';

const CODE_TTL_SECONDS = 5 * 60;          // 验证码有效期：5分钟
const RATE_LIMIT_SECONDS = 60;              // 发送频率限制：60秒内只允许一次
const MAX_VERIFY_ATTEMPTS = 5;              // 最大校验次数

function sanitize(user) {
  if (!user) return null;
  // 移除密码 对剩下的属性打包
  const { password, ...safe } = user;
  return safe;
}

// 注册用户
export const register = async (req, res) => {
  try {
    const { phoneNumber, password, avatarUrl, nickname } = req.body;

    // 基本必填校验：邮箱 + 验证码 + 密码
    if (!password) {
      return res.status(400).json({
        success: false,
        message: '需要填写密码'
      });
    }

    // // 先校验邮箱验证码（参考 verifyVerificationCodeHandler，只保留验证码相关逻辑）
    // const { codeKey } = buildKeys(email);
    // const storedCode = await redisClient.get(codeKey);

    // if (!storedCode) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Verification code expired or invalid'
    //   });
    // }

    // if (storedCode !== code) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Invalid verification code'
    //   });
    // }

    // // 验证成功后删除验证码，防止重复使用
    // await redisClient.del(codeKey);

    // 检查手机号格式是否合法
    if (phoneNumber) {
      // 中国手机号正则：11位数字，以1开头，第二位为3-9
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ success: false, message: 'Invalid phone number format' });
      }

      // 检查手机号是否已存在
      const existingPhone = await getUserByPhoneNumber(phoneNumber);
      if (existingPhone) {
        return res.status(409).json({ success: false, message: 'Phone number already exists' });
      }
    }

    // // 检查邮箱是否已存在
    // if (email) {
    //   const existingEmail = await getUserByEmail(email);
    //   if (existingEmail) {
    //     return res.status(409).json({ success: false, message: 'Email already exists' });
    //   }
    // }

    // 设置默认头像URL（如果没有提供或为空）
    const defaultAvatarUrl = 'interactive-fction-game-avatar/1/1763447440878_dfe11825de25f8a0c21c32a9f90086cd.jpg';
    const finalAvatarUrl = avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : defaultAvatarUrl;

    // 设置昵称（如果没有提供或为空，则使用手机号）
    const finalNickname = nickname && nickname.trim() !== '' ? nickname : phoneNumber;

    // 固定角色为普通用户
    const role = 'user';
    const userId = crypto.randomBytes(8).toString('hex');

    //原始密码进行哈希加密，然后存储到数据库
    const hashedPassword = await hashPassword(password);

    const inviteCode = generateInviteCode(phoneNumber);

    const created = await createUser({
      userId,
      email: null,
      password: hashedPassword,
      role,
      createTime: new Date(),
      lastLoginTime: null,
      phoneNumber,
      avatarUrl: finalAvatarUrl,
      nickname: finalNickname,
      inviteCode: inviteCode
    });

    return res.json({ success: true, data: sanitize(created) });
  } catch (err) {
    if (err?.errors) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: err.errors });
    }
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 登录
export const login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // 验证必需字段
    if (!phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'Phone number and password are required' });
    }

    // 通过手机号查找用户
    const user = await getUserByPhoneNumber(phoneNumber);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // 验证密码
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }


    const updatedUser = await updateUser(user.userId, { lastLoginTime: new Date() });

    const tokens = signTokens({
      userId: updatedUser.userId,
      role: updatedUser.role
    });

    const userWithoutPassword = sanitize(updatedUser);

    // 检查用户今天是否已经签到
    const hasSignedIn = await checkUserActivityCompleted(updatedUser.userId, 'signin');
    userWithoutPassword.hasSignedIn = hasSignedIn;

          // if (hasSignedIn) {
          //     return res.status(200).json({
          //         success: true,
          //         message: '今日已签到',
          //         data: {
          //             signedIn: true,
          //             points: 9
          //         }
          //     });
          // }

    return res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        expiresIn: tokens.expiresIn,
        hasSignedIn: hasSignedIn
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 刷新 token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: refreshTokenFromBody } = req.body;

    if (!refreshTokenFromBody) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    // 验证 refreshToken
    const decoded = verifyRefreshToken(refreshTokenFromBody);

    // 根据 decoded 中的 userId 查找用户，确保用户仍然存在
    const user = await getUserByUserId(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    // 生成新的 tokens
    const tokens = signTokens({
      userId: user.userId,
      role: user.role,
    });

    // 移除密码
    const userWithoutPassword = sanitize(user);

    return res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: userWithoutPassword,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(401).json({
      success: false,
      message: error.message === 'Refresh token expired'
        ? 'Refresh token expired, please login again'
        : 'Invalid refresh token',
    });
  }
};

// 通过 refreshToken 仅生成新的 accessToken（不生成新的 refreshToken）
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken: refreshTokenFromBody } = req.body;

    if (!refreshTokenFromBody) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    // 验证 refreshToken
    const decoded = verifyRefreshToken(refreshTokenFromBody);

    // 根据 decoded 中的 userId 查找用户，确保用户仍然存在
    const user = await getUserByUserId(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    // 只生成新的 accessToken（不生成新的 refreshToken）
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ACCESS_TOKEN_EXPIRY_SECONDS;

    const accessToken = signToken({
      userId: user.userId,
      role: user.role,
      type: 'access'
    });

    return res.json({
      success: true,
      message: 'Access token refreshed successfully',
      data: {
        token: accessToken,
        expiresAt: expiresAt,
        expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      },
    });
  } catch (error) {
    console.error('Refresh access token error:', error);
    return res.status(401).json({
      success: false,
      message: error.message === 'Refresh token expired'
        ? 'Refresh token expired, please login again'
        : 'Invalid refresh token',
    });
  }
};

// 发送验证码
export const sendVerificationCodeHandler = async (req, res) => {
  const { email } = req.body;
  const verificationCode = await sendVerificationCodeEmail(email);
  return res.json({ success: true, data: verificationCode });
}

const buildKeys = (email) => {
  const keySafe = String(email).trim().toLowerCase();
  return {
    codeKey: `pwdreset:code:${keySafe}`,
    attemptsKey: `pwdreset:attempts:${keySafe}`,
    rateKey: `pwdreset:rate:${keySafe}`,
  };
};

async function sendVerificationCodeEmail(email) {
  if (!email) {
    throw new Error('Email is required');
  }

  const { codeKey, attemptsKey, rateKey } = buildKeys(email);

  // 频率限制：60秒内只允许一次
  const limited = await redisClient.get(rateKey);
  if (limited) {
    throw new Error('Too many requests, please try again later');
  }

  // 生成6位数字验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 保存验证码与相关控制键
  await redisClient.setEx(codeKey, CODE_TTL_SECONDS, code);
  await redisClient.setEx(rateKey, RATE_LIMIT_SECONDS, '1');
  // 记录可用的最大校验次数
  // await redisClient.setEx(attemptsKey, CODE_TTL_SECONDS, String(MAX_VERIFY_ATTEMPTS));

  // 发送邮件
  await sendEmailCode(email, code);

  // 可选择返回或不返回；你代码里有接收变量，就返回
  return code;
}

// 验证码校验与密码重置
export const verifyVerificationCodeHandler = async (req, res) => {
  try {
    const { email, code, newPassword, confirmNewPassword } = req.body;

    // 验证必需字段
    if (!email || !code || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, code, newPassword and confirmNewPassword are required'
      });
    }

    // 验证两次输入的密码是否相同
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match'
      });
    }

    // 从 Redis 中获取验证码并校验
    const { codeKey } = buildKeys(email);
    const storedCode = await redisClient.get(codeKey);

    if (!storedCode) {
      return res.status(400).json({
        success: false,
        message: 'Verification code expired or invalid'
      });
    }

    if (storedCode !== code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // 根据邮箱查找用户
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 哈希新密码
    const hashedPassword = await hashPassword(newPassword);

    // 更新用户密码
    await updateUser(user.userId, { password: hashedPassword });

    // 删除已使用的验证码（防止重复使用）
    await redisClient.del(codeKey);

    return res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (err) {
    console.error('Verify verification code error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
}

// 根据 userId 获取用户信息
export const getUserInfo = async (req, res) => {
  try {
    const targetUserId = req.user?.userId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：userId'
      });
    }
    const user = await getUserByUserId(String(targetUserId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const userWithoutPassword = sanitize(user);

    // 检查用户今天是否已经签到
    const hasSignedIn = await checkUserActivityCompleted(user.userId, 'signin');
    userWithoutPassword.hasSignedIn = hasSignedIn;

    return res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('getUserInfo error:', error);
    return res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
};

// 积分扣减
export const deductPoints = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const fileId = req.body.fileId;

  // 检查是否已经购买过该游戏
  const alreadyPurchased = await checkUserAlreadyPurchased(userId, fileId);
  if (alreadyPurchased) {
    return res.status(400).json({
      success: false,
      message: '您已经购买过该游戏'
    });
  }


    const gameData = await getGameDataByFileId(fileId);
    // 判断积分值：如果special_price_amount大于等于0且不为空，则使用special_price_amount，否则使用price_amount
    const points = (gameData.special_price_amount && gameData.special_price_amount >= 0)
      ? gameData.special_price_amount
      : gameData.price_amount;

    if (!points) {
      return res.status(400).json({ success: false, message: 'points not found' });
    }

    // 检查用户积分是否足够
    const user = await getUserByUserId(userId);
    if (user.points < points) {
      return res.status(400).json({
        success: false,
        message: '积分不足'
      });
    }

    // 创建购买订单（状态为pending）
    const purchaseNo = generatePurchaseNo(userId);
    await createPointsPurchase({
      purchase_no: purchaseNo,
      user_id: userId,
      file_id: fileId,
      game_title: gameData.title,
      points_cost: points,
      purchase_status: 'pending'
    });

    // 扣减用户积分
    const result = await deductUserPoints(userId, points);
    if (!result.success) {
      // 扣分失败，更新订单状态为failed
      await updatePointsPurchaseStatus(purchaseNo, 'failed');
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    // 更新订单状态为completed
    await updatePointsPurchaseStatus(purchaseNo, 'completed');

    return res.json({
      success: true,
      message: '购买成功',
      data: { purchaseNo }
    });

  } catch (err) {
    console.error('Deduct points error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};



// 创建订单编号函数
function generatePurchaseNo(userId = '') {
  const prefix = 'POINTS';
  
  // 时间部分：YYMMDDHHmmss
  const now = new Date();
  const timestamp = [
    now.getFullYear().toString().slice(2), // 年后两位
    String(now.getMonth() + 1).padStart(2, '0'), // 月
    String(now.getDate()).padStart(2, '0'), // 日
    String(now.getHours()).padStart(2, '0'), // 时
    String(now.getMinutes()).padStart(2, '0'), // 分
    String(now.getSeconds()).padStart(2, '0') // 秒
  ].join('');
  
  // 随机部分：4位随机数
  const random = Math.floor(1000 + Math.random() * 9000);
  
  // 用户标识：取用户ID后4位（如果有）
  const userSuffix = userId ? userId.slice(-4) : '';
  
  return `${prefix}${timestamp}${random}${userSuffix}`;
}


export default { register, login, refreshToken, refreshAccessToken, sendVerificationCodeHandler, verifyVerificationCodeHandler, deductPoints };
