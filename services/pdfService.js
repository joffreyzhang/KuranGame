import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export const processPDFFile = async (filePath, progressCallback) => {
  try {
    // Simulate progress for reading file
    if (progressCallback) progressCallback(30);

    const dataBuffer = fs.readFileSync(filePath);
    
    if (progressCallback) progressCallback(60);

    const data = await pdf(dataBuffer);
    
    if (progressCallback) progressCallback(100);

    return {
      numpages: data.numpages,
      numrender: data.numrender,
      info: data.info,
      metadata: data.metadata,
      text: data.text,
      version: data.version
    };
  } catch (error) {
    console.error('PDF processing error:', error);
    throw new Error(`Failed to process PDF: ${error.message}`);
  }
};

export const extractTextFromPDF = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
};

export const getPDFMetadata = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return {
    numpages: data.numpages,
    info: data.info,
    metadata: data.metadata
  };
};

