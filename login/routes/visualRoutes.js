import express from 'express';
import multer from 'multer';
import path from 'path';
import { 
    visualSessionCreate, 
    uploadAndProcessDocument, 
    uploadGameCover,
    uploadAndProcessDocumentAsync,
    getTaskStatus,
    resumeTask,
    getUserTasks
} from '../controller/visualController.js';

const router = express.Router();

// 配置 multer 用于文件上传
const upload = multer({
    storage: multer.memoryStorage(), // 使用内存存储
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOCX and image files are allowed'), false);
        }
    }
});


// createSession
router.post('/games/session/create', visualSessionCreate);

// upload-pdf - 使用 multer 中间件处理 'document' 字段的文件
router.post('/games/upload', upload.single('document'), uploadAndProcessDocument);

// 上传游戏封面图片接口
router.post('/games/upload-cover', upload.single('cover'), uploadGameCover);

// ==================
// 异步任务管理接口
// ==================

// POST /api/optical/document/upload-async - 异步上传文档接口（立即返回任务ID）
router.post('/document/upload-async', upload.single('document'), uploadAndProcessDocumentAsync);

// GET /api/optical/tasks/:taskId - 查询任务状态
router.get('/tasks/:taskId', getTaskStatus);

// POST /api/optical/tasks/:taskId/resume - 恢复中断的任务
router.post('/tasks/:taskId/resume', resumeTask);

// GET /api/optical/tasks - 获取用户任务列表
router.get('/tasks', getUserTasks);

export default router;