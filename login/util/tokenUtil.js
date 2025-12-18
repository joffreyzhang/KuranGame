import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load envs (supports running from repo root or login folder)
dotenv.config();

// Secrets
const ACCESS_SECRET = process.env.JWT_SECRET || 'default_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default_refresh_secret';

// Expirations (in seconds)
export const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60;        // 1 hour
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

// 生成 accessToken 与 refreshToken，含过期信息
export function signTokens(payload) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ACCESS_TOKEN_EXPIRY_SECONDS;

  const accessToken = jwt.sign({ ...payload, type: 'access' }, ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS
  });

  const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY_SECONDS
  });

  return {
    accessToken,
    refreshToken,
    expiresAt,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS
  };
}

// 仅生成 accessToken
export function signToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS });
}

// 校验 accessToken，过期抛 “Token expired”，无效抛 “Invalid token”
export function verifyToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw new Error('Invalid token');
  }
}

// 校验 refreshToken，且强制 type 为 'refresh'
export function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);
    if (decoded && decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    }
    throw new Error('Invalid refresh token');
  }
}

// 返回 { expiresAt, expiresIn }
export function getTokenExpirationInfo(token) {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    if (!decoded || typeof decoded !== 'object' || decoded.exp == null) {
      throw new Error('Token has no expiration');
    }
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = decoded.exp - now;
    return { expiresAt: decoded.exp, expiresIn: Math.max(0, expiresIn) };
  } catch (error) {
    throw new Error('Cannot get token expiration info');
  }
}

export default {
  signTokens,
  signToken,
  verifyToken,
  verifyRefreshToken,
  getTokenExpirationInfo
};


