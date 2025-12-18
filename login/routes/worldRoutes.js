import express from 'express';
import multer from 'multer';
import path from 'path';
import { worldInteractionSessionCreate, uploadAndProcessWorldInteractionDocument } from '../controller/worldInteractionController.js';

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


// createSession-worldInteraction
router.post('/session/create', worldInteractionSessionCreate);

// uploadAndProcessWorldInteractionDocument
router.post('/document/upload', upload.single('document'), uploadAndProcessWorldInteractionDocument);

export default router;