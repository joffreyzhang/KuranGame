import express from 'express';
// 文件上传依赖
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { registerSchema, loginSchema, refreshTokenSchema, sendVerificationCodeSchema, verifyVerificationCodeSchema } from '../authValidation.js';
import { register, login, refreshToken, refreshAccessToken, sendVerificationCodeHandler, verifyVerificationCodeHandler , deductPoints, getUserInfo} from '../controller/authController.js';
import gamesController, { userGamSession , sessionCreate, listPublicGames, publishGame, deleteGame, gameInfo, deleteGamSession , exportGameHistoryDoc, unpublishGame, markOrderPaid} from '../controller/gamesController.js';
import { deductPointsOption , signin, watchAd, useInviteCode, joinGroup} from '../controller/activityController.js';
import gamesStatusController from '../controller/gamesStatusController.js';
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


// 刷新 accessToken（仅生成新的 accessToken，不生成新的 refreshToken）
router.post('/refresh-access-token', validate(refreshTokenSchema), refreshAccessToken);

// 发送验证码（用于密码重置）
router.post('/code/send', validate(sendVerificationCodeSchema), sendVerificationCodeHandler);

// 验证验证码并重置密码
router.post('/code/verify', validate(verifyVerificationCodeSchema), verifyVerificationCodeHandler);

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

// 测试接口：图片上传到 MinIO
// 字段名image
router.post('/test-upload-image', imageUpload.any(), testUploadImage);

// 测试接口：接收 PDF 并上传到 MinIO（使用磁盘存储中间件）
// 字段名 'file'
router.post('/test-upload-pdf', diskUpload.single('file'), testUploadPdf);

// MinIO：根据 bucket + 前缀下载对象到本地 location 目录
router.post('/minio/download-prefix', async (req, res) => {
  try {
    const { bucket, prefix, destRoot } = req.body || {};
    if (!bucket || !prefix) {
      return res.status(400).json({ success: false, message: '参数缺失：需要 bucket 与 prefix' });
    }
    const result = await downloadPrefixToLocal(bucket, prefix, destRoot || 'location');
    return res.json({ success: true, message: '下载完成', data: result });
  } catch (err) {
    console.error('minio/download-prefix error:', err);
    return res.status(500).json({ success: false, message: err.message || '下载失败' });
  }
});

// MinIO：将本地 uploadfiles 目录递归上传到指定 bucket/prefix （ZZ）
router.post('/minio/upload-folder', async (req, res) => {
  try {
    const { localRoot, file_id, bucketName, user_id } = req.body || {};
    if (!file_id) {
      return res.status(400).json({ success: false, message: '参数缺失：需要 file_id' });
    }
    if (!user_id) {
      return res.status(400).json({ success: false, message: '参数缺失：需要 user_id' });
    }
    const result = await uploadLocalFolderToMinio({
      fileId: file_id,
      userId: String(user_id),
      localRoot,
      bucketName
    });
    return res.json({ success: true, message: '上传完成', data: result });
  } catch (err) {
    console.error('minio/upload-folder error:', err);
    return res.status(500).json({ success: false, message: err.message || '上传失败' });
  }
});

// ========================
// Games APIs
// ========================
// 新增一条游戏记录（支持文件上传：cover 图片和 doc/pdf 文档,最终生成的初始化文件）=》婷
router.post('/games', mixedUpload.any(), gamesController.create);
// 根据 userId 查询游戏列表（支持 limit/offset）=》婷
router.get('/games/user', gamesController.listByUser);
// 获取原始游戏文件（精确匹配，不要改变路由顺序）(ZZ)
router.get('/games/original/files', gamesController.getFilesOfAdminUser);
// 根据 file_id 获取初始化 files（ZZ）
router.get('/games/:fileId/files', gamesController.getInitFilesByFileId);
// 完成游戏会话：上传文件到 MinIO 并创建 game_session 记录
router.post('/games/session', gamesController.completeGameSession);
// 新增：创建游戏会话
router.post('/games/session/create', sessionCreate);
// 发布游戏
router.post('/games/publish', publishGame);
// 下架游戏
router.post('/games/unpublish',unpublishGame);
// 删除游戏
router.delete('/games/delete/:fileId', deleteGame);
// 删除游戏存档
router.delete('/games/session', deleteGamSession);
// 查看仓库
router.get('/games/history', userGamSession);
// 手动标记订单为已支付
router.post('/games/orders/mark-paid', markOrderPaid);
//游戏数据的导出
router.get('/session/:sessionId/export-history', exportGameHistoryDoc);
// 用户信息
router.get('/user/info', getUserInfo);

// ========================
// Games Statistics APIs
// ========================
// 页面访问统计 - 同时增加 PV 和 UV（用户访问游戏详情页时调用）
router.post('/games-stats/visit', gamesStatusController.incrementVisit);
// 增加转化统计（Conversion Count）- 用户点击"开始游戏"时调用
router.post('/games-stats/conversion', gamesStatusController.incrementConversion);
// 增加点赞统计（Like Count）- 用户点赞游戏时调用
router.post('/games-stats/like', gamesStatusController.incrementLike);
// 获取游戏数据（PV、点赞数、平均评分）
router.get('/games-stats/data/:fileId', gamesStatusController.getGameData);
// 获取用户游戏数据的总统计量
router.get('/games-stats/total-data', gamesStatusController.getGameDataByUser);

// ========================
// Points Statistics APIs
// ========================
//用户积分扣减
router.post('/user/deduct-points', deductPoints);
//选项积分扣减
router.post('/user/option', deductPointsOption);
//签到加分
router.post('/user/signin', signin);
//看完广告加分
router.post('/user/watch-ad', watchAd);
// //输入邀请码加分
router.post('/invite/use-code', useInviteCode);
// //加群加分
router.post('/user/join-group', joinGroup);

export default router;


