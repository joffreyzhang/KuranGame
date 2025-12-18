import express from 'express';
// 文件上传依赖
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { registerSchema, loginSchema, refreshTokenSchema, sendVerificationCodeSchema, verifyVerificationCodeSchema } from '../authValidation.js';
import { register, login, refreshToken, refreshAccessToken, sendVerificationCodeHandler, verifyVerificationCodeHandler , deductPoints, getUserInfo} from '../controller/authController.js';
import gamesController, { userGamSession , sessionCreate, listPublicGames, listPublicGamesWithDiscount,  publishGame, deleteGame, gameInfo, deleteGamSession , exportGameHistoryDoc} from '../controller/gamesController.js';
import { authMiddleware, optionalAuthMiddleware, adminOnlyMiddleware } from '../authMiddleware.js';
import { testUploadImage, testUploadPdf, downloadPrefixToLocal, uploadLocalFolderToMinio } from '../service/minioService.js';
import { upload as diskUpload } from '../../middleware/upload.js';

//  Zod 校验中间件
function validate(schema) {
  return (req, res, next) => {
    try {
      schema.parse({ body: req.body });
      return next();
    } catch (err) {
      // 提取 Zod 错误信息（Zod 的错误在 err.issues 中）
      const errors = err.issues || [];
      const errorMessages = errors.map(e => ({
        path: e.path?.join('.') || '',
        message: e.message || 'Validation error'
      }));
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: errorMessages.length > 0 ? errorMessages : [{ message: err.message || 'Validation error' }]
      });
    }
  };
}

const router = express.Router();

// 配置 multer 用于图片上传：内存存储
const imageUpload = multer({
  storage: multer.memoryStorage(), 
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB 限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件格式（jpg, png, gif, webp 等）'), false);
    }
  }
});

// 配置 multer 用于混合上传（图片 + PDF/DOC）：使用磁盘存储，支持多个文件
const mixedUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, process.env.UPLOAD_DIR || 'uploads');
    },
    filename: (req, file, cb) => {
      const fileId = crypto.randomBytes(16).toString('hex');
      const ext = path.extname(file.originalname);
      cb(null, `${fileId}${ext}`);
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 限制
  },
  fileFilter: (req, file, cb) => {
    // 允许图片和 PDF/DOC 文件
    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';
    const isDoc = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const ext = path.extname(file.originalname).toLowerCase();
    const isDocExt = ['.pdf', '.docx'].includes(ext);
    
    if (isImage || isPdf || isDoc || isDocExt) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件（jpg, png 等）和文档文件（pdf, docx）'), false);
    }
  }
});

// 注册
router.post('/register', validate(registerSchema), register);

// 登录
router.post('/login', validate(loginSchema), login);

// 查询公开游戏列表（没有优惠价格）
router.get('/games/public/no-discount', optionalAuthMiddleware, listPublicGames);

//查询优惠列表
router.get('/games/public/with-discount', optionalAuthMiddleware, listPublicGamesWithDiscount);

// 查看单个游戏信息
router.get('/games/info', optionalAuthMiddleware, gameInfo);

// 刷新 token（生成新的 accessToken 和 refreshToken）
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

// 测试接口：验证 token（需要认证）
router.get('/test-token', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    message: 'Token 验证成功',
    user: req.user
  });
});

// 测试接口：可选认证
router.get('/test-optional-auth', optionalAuthMiddleware, (req, res) => {
  if (req.user) {
    return res.json({
      success: true,
      message: '已认证用户访问',
      user: req.user
    });
  } else {
    return res.json({
      success: true,
      message: '未认证用户访问（游客模式）'
    });
  }
});

// 测试接口：管理员权限（需要 ADMIN 角色）
router.get('/test-admin', authMiddleware, adminOnlyMiddleware, (req, res) => {
  return res.json({
    success: true,
    message: '管理员权限验证成功',
    user: req.user
  });
});

export default router;


