import { verifyToken } from './util/tokenUtil.js';
import { getUserByUserId } from './service/authService.js';

// 必须提供有效的 token
export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication token required' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    
    // 验证用户是否存在
    if (!decoded.userId) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token: missing user information' 
      });
    }
    
    const user = await getUserByUserId(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    // 用户信息挂载到请求对象上
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false,
      message: error.message === 'Token expired' ? 'Token expired' : 'Invalid or expired token' 
    });
  }
};

// 可选认证
export const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // 没有提供 token，继续执行但 req.user 为 undefined
    req.user = undefined;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    // Token 无效，继续执行但不设置 req.user
    req.user = undefined;
    next();
  }
};

// 管理员用户
export const adminOnlyMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication required' 
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false,
      message: 'Admin access required' 
    });
  }

  next();
};

export default authMiddleware;

