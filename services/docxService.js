import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

export const processDocxFile = async (filePath, progressCallback) => {
  try {
    // Simulate progress for reading file
    if (progressCallback) progressCallback(30);

    const dataBuffer = fs.readFileSync(filePath);

    if (progressCallback) progressCallback(60);

    // Extract text and metadata
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    const messages = result.messages || [];

    // Get file stats for additional metadata
    const stats = fs.statSync(filePath);

    if (progressCallback) progressCallback(100);

    return {
      text: result.value,
      messages: messages,
      metadata: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        warnings: messages.filter(m => m.type === 'warning'),
        errors: messages.filter(m => m.type === 'error')
      }
    };
  } catch (error) {
    console.error('DOCX processing error:', error);
    throw new Error(`Failed to process DOCX: ${error.message}`);
  }
};

export const extractTextFromDocx = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer: dataBuffer });
  return result.value;
};

export const getDocxMetadata = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer: dataBuffer });
  const stats = fs.statSync(filePath);

  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    messages: result.messages || [],
    warnings: (result.messages || []).filter(m => m.type === 'warning'),
    errors: (result.messages || []).filter(m => m.type === 'error')
  };
};
