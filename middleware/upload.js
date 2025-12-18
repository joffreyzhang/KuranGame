import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads');
  },
  filename: (req, file, cb) => {
    const fileId = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimetypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
  ];

  const allowedExtensions = ['.pdf', '.docx'];

  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimetypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and DOCX files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  }
});

