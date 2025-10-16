import express from 'express';
import { uploadPDF, processPDFWithSSE, getPDFStatus, listPDFDataFiles, processPDFDataFile } from '../controllers/pdfController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Upload PDF endpoint
router.post('/upload', upload.single('pdf'), uploadPDF);

// Process PDF with SSE endpoint
router.get('/process/:fileId', processPDFWithSSE);

// Get PDF processing status
router.get('/status/:fileId', getPDFStatus);

// List PDFs from pdf_data directory
router.get('/data/list', listPDFDataFiles);

// Process PDF from pdf_data directory with SSE
router.get('/data/process/:filename', processPDFDataFile);

export default router;

