import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import { processPDFFile } from '../services/pdfService.js';
import { processDocxFile } from '../services/docxService.js';
import { extractGameSettings, saveDetailedGameData } from '../services/gameSettingsService.js';
import { storeGameSettings, persistGameSettings } from '../services/gameService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store processing status in memory (in production, use Redis or database)
const processingStatus = new Map();

// Document data directory path (supports both PDF and DOCX)
const DOCUMENT_DATA_DIR = path.join(__dirname, '..', 'pdf_data');

// Helper function to determine file type
const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  return null;
};

// Helper function to process document based on type
const processDocument = async (filePath, progressCallback) => {
  const fileType = getFileType(filePath);

  if (fileType === 'pdf') {
    return await processPDFFile(filePath, progressCallback);
  } else if (fileType === 'docx') {
    const docxData = await processDocxFile(filePath, progressCallback);
    // Transform DOCX data to match PDF data structure
    return {
      text: docxData.text,
      numpages: null, // DOCX doesn't have page concept
      info: docxData.metadata,
      metadata: docxData.metadata
    };
  }

  throw new Error('Unsupported file type');
};

export const uploadPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileType = getFileType(req.file.originalname);
    if (!fileType) {
      return res.status(400).json({ error: 'Unsupported file type. Only PDF and DOCX files are supported.' });
    }

    const fileId = path.parse(req.file.filename).name;
    const fileInfo = {
      fileId,
      filename: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      type: fileType,
      uploadedAt: new Date().toISOString(),
      status: 'uploaded'
    };

    // Initialize processing status
    processingStatus.set(fileId, {
      ...fileInfo,
      progress: 0,
      stage: 'uploaded'
    });

    res.json({
      success: true,
      fileId,
      message: 'File uploaded successfully',
      file: fileInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file', message: error.message });
  }
};

export const processPDFWithSSE = async (req, res) => {
  const { fileId } = req.params;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  const status = processingStatus.get(fileId);
  
  if (!status) {
    res.write(`data: ${JSON.stringify({ error: 'File not found' })}\n\n`);
    res.end();
    return;
  }

  if (!fs.existsSync(status.path)) {
    res.write(`data: ${JSON.stringify({ error: 'File does not exist' })}\n\n`);
    res.end();
    return;
  }

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ 
    stage: 'connected', 
    progress: 0,
    message: 'Connection established' 
  })}\n\n`);

  try {
    // Update progress function
    const updateProgress = (stage, progress, message, data = null) => {
      const update = { stage, progress, message, data };
      processingStatus.set(fileId, { ...status, ...update });
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    };

    // Stage 1: Reading document
    updateProgress('reading', 10, `Reading ${status.type?.toUpperCase() || 'document'} file...`);

    const documentData = await processDocument(status.path, (progress) => {
      updateProgress('reading', 10 + progress * 0.3, `Reading ${status.type?.toUpperCase() || 'document'}: ${Math.round(progress)}%`);
    });

    // Stage 2: Extracting text
    updateProgress('extracting', 40, 'Extracting text content...');

    // Stage 3: Analyzing content
    updateProgress('analyzing', 60, 'Analyzing game settings...');

    const gameSettings = await extractGameSettings(documentData, (progress) => {
      updateProgress('analyzing', 60 + progress * 0.2, `Analyzing: ${Math.round(progress)}%`);
    });

    // Store game settings for later use (in memory and disk)
    storeGameSettings(fileId, gameSettings);
    persistGameSettings(fileId, gameSettings);

    // Stage 4: Saving structured game data (uses data from gameSettings.detailedGameData)
    updateProgress('initializing', 85, 'Saving structured game data...');
    saveDetailedGameData(fileId, gameSettings);
    updateProgress('initializing', 95, 'Game data initialized successfully');

    // Stage 5: Complete
    updateProgress('complete', 100, 'Processing complete', {
      documentData: {
        numPages: documentData.numpages,
        textLength: documentData.text.length,
        info: documentData.info,
        type: status.type
      },
      gameSettings,
      gameData: {
        hasBackgroundData: !!gameSettings.detailedGameData?.backgroundData,
        hasPlayerData: true,
        hasItemData: true,
        hasWorldData: !!gameSettings.detailedGameData?.worldData
      },
      fileId
    });

    // Send completion event
    res.write(`event: complete\ndata: ${JSON.stringify({
      success: true,
      fileId,
      gameSettings
    })}\n\n`);

  } catch (error) {
    console.error('Processing error:', error);
    res.write(`data: ${JSON.stringify({ 
      stage: 'error', 
      progress: 0,
      error: error.message 
    })}\n\n`);
    
    processingStatus.set(fileId, { 
      ...status, 
      status: 'error',
      error: error.message 
    });
  } finally {
    res.end();
  }
};

export const getPDFStatus = async (req, res) => {
  const { fileId } = req.params;
  
  const status = processingStatus.get(fileId);
  
  if (!status) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.json(status);
};

export const listPDFDataFiles = async (req, res) => {
  try {
    if (!fs.existsSync(DOCUMENT_DATA_DIR)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(DOCUMENT_DATA_DIR)
      .filter(file => {
        const ext = file.toLowerCase();
        return ext.endsWith('.pdf') || ext.endsWith('.docx');
      })
      .map(file => {
        const filePath = path.join(DOCUMENT_DATA_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          modified: stats.mtime,
          type: getFileType(file),
          path: `pdf_data/${file}`
        };
      });

    res.json({ files });
  } catch (error) {
    console.error('List document files error:', error);
    res.status(500).json({ error: 'Failed to list files', message: error.message });
  }
};

export const processPDFDataFile = async (req, res) => {
  const { filename } = req.params;
  const decodedFilename = decodeURIComponent(filename);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const filePath = path.join(DOCUMENT_DATA_DIR, decodedFilename);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(DOCUMENT_DATA_DIR)) {
    res.write(`data: ${JSON.stringify({ error: 'Invalid file path' })}\n\n`);
    res.end();
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.write(`data: ${JSON.stringify({ error: 'File not found' })}\n\n`);
    res.end();
    return;
  }

  const fileType = getFileType(decodedFilename);
  if (!fileType) {
    res.write(`data: ${JSON.stringify({ error: 'Unsupported file type' })}\n\n`);
    res.end();
    return;
  }

  // Generate fileId for this processing
  const fileId = crypto.randomBytes(16).toString('hex');
  const fileInfo = {
    fileId,
    filename: decodedFilename,
    path: filePath,
    size: fs.statSync(filePath).size,
    type: fileType,
    uploadedAt: new Date().toISOString(),
    status: 'processing',
    source: 'pdf_data'
  };

  processingStatus.set(fileId, fileInfo);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    stage: 'connected',
    progress: 0,
    message: 'Connection established',
    fileId
  })}\n\n`);

  try {
    // Update progress function
    const updateProgress = (stage, progress, message, data = null) => {
      const update = { stage, progress, message, data, fileId };
      processingStatus.set(fileId, { ...fileInfo, ...update });
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    };

    // Stage 1: Reading document
    updateProgress('reading', 10, `Reading ${fileType.toUpperCase()} file...`);

    const documentData = await processDocument(filePath, (progress) => {
      updateProgress('reading', 10 + progress * 0.3, `Reading ${fileType.toUpperCase()}: ${Math.round(progress)}%`);
    });

    // Stage 2: Extracting text
    updateProgress('extracting', 40, 'Extracting text content (支持中文)...');

    // Stage 3: Analyzing content
    updateProgress('analyzing', 60, 'Analyzing game settings...');

    const gameSettings = await extractGameSettings(documentData, (progress) => {
      updateProgress('analyzing', 60 + progress * 0.2, `Analyzing: ${Math.round(progress)}%`);
    });

    // Store game settings for later use (in memory and disk)
    storeGameSettings(fileId, gameSettings);
    persistGameSettings(fileId, gameSettings);

    // Stage 4: Saving structured game data (uses data from gameSettings.detailedGameData)
    updateProgress('initializing', 85, 'Saving structured game data...');
    saveDetailedGameData(fileId, gameSettings);
    updateProgress('initializing', 95, 'Game data initialized successfully');

    // Stage 5: Complete
    updateProgress('complete', 100, 'Processing complete', {
      documentData: {
        numPages: documentData.numpages,
        textLength: documentData.text.length,
        info: documentData.info,
        type: fileType
      },
      gameSettings,
      gameData: {
        hasBackgroundData: !!gameSettings.detailedGameData?.backgroundData,
        hasPlayerData: true,
        hasItemData: true,
        hasWorldData: !!gameSettings.detailedGameData?.worldData
      },
      fileId
    });

    // Send completion event
    res.write(`event: complete\ndata: ${JSON.stringify({
      success: true,
      fileId,
      gameSettings
    })}\n\n`);

  } catch (error) {
    console.error('Processing error:', error);
    res.write(`data: ${JSON.stringify({ 
      stage: 'error', 
      progress: 0,
      error: error.message 
    })}\n\n`);
    
    processingStatus.set(fileId, { 
      ...fileInfo, 
      status: 'error',
      error: error.message 
    });
  } finally {
    res.end();
  }
};

