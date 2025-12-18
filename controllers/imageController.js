import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateAllGameImages } from '../services/imageGenerationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');
const GAME_SAVES_DIR = path.join(__dirname, '..', 'game_saves');

/**
 * POST /api/backend/images/generate/:fileId
 */
export const generateGameImages = async (req, res) => {
  try {
    const { fileId } = req.params;

    // Parse boolean values from form-data or JSON body
    const generateNPCs = req.body.generateNPCs !== 'false' && req.body.generateNPCs !== false;
    const generateScenes = req.body.generateScenes !== 'false' && req.body.generateScenes !== false;
    const generateBuildings = req.body.generateBuildings !== 'false' && req.body.generateBuildings !== false;
    const generateWorld = req.body.generateWorld !== 'false' && req.body.generateWorld !== false;
    const generateUser = req.body.generateUser !== 'false' && req.body.generateUser !== false;
    const updateJSON = req.body.updateJSON !== 'false' && req.body.updateJSON !== false;

    console.log(`Starting image generation for fileId: ${fileId}`);

    const results = await generateAllGameImages(fileId, {
      generateNPCs,
      generateScenes,
      generateBuildings,
      generateWorld,
      generateUser,
      updateJSON
    });

    res.json({
      success: true,
      message: 'Image generation completed',
      fileId,
      results: {
        npcsGenerated: results.npcs.length,
        scenesGenerated: results.scenes.length,
        buildingsGenerated: results.buildings.length,
        worldGenerated: results.world?.success || false,
        userGenerated: results.user?.success || false,
        errorsCount: results.errors.length,
        details: results
      }
    });
  } catch (error) {
    console.error('Generate images error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate images',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/images/:fileId/world
 */
export const serveWorldImage = async (req, res) => {
  try {
    const { fileId } = req.params;

    // Try multiple paths in order of priority
    const possiblePaths = [
      path.join(GAME_DATA_DIR, 'images', fileId, 'world.png'),
      path.join(GAME_SAVES_DIR, fileId, `world_${fileId}.png`),
      path.join(GAME_DATA_DIR, 'images', `world_${fileId}.png`)
    ];

    let imagePath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        imagePath = testPath;
        break;
      }
    }

    if (!imagePath) {
      return res.status(404).json({
        success: false,
        error: 'World image not found',
        message: `World image not found for fileId: ${fileId}`
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send the file
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve world image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve world image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/images/:fileId/player
 */
export const servePlayerImage = async (req, res) => {
  try {
    const { fileId } = req.params;

    // Try multiple paths in order of priority
    const possiblePaths = [
      path.join(GAME_DATA_DIR, 'images', fileId, 'player.png'),
      path.join(GAME_SAVES_DIR, fileId, `player_${fileId}.png`),
      path.join(GAME_DATA_DIR, 'images', `player_${fileId}.png`)
    ];

    let imagePath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        imagePath = testPath;
        break;
      }
    }

    if (!imagePath) {
      return res.status(404).json({
        success: false,
        error: 'Player image not found',
        message: `Player image not found for fileId: ${fileId}`
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send the file
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve player image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve player image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/saves/:saveId/scenes/:filename
 */
export const serveSceneImage = async (req, res) => {
  try {
    const { saveId, filename } = req.params;

    const imagePath = path.join(GAME_SAVES_DIR, saveId, 'scenes', filename);

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Scene image not found',
        message: `Scene image not found: ${filename}`
      });
    }

    // Set appropriate headers for images
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send the file
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve scene image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve scene image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/images/:fileId/serve/scenes/:filename
 */
export const serveSceneImageFromFileId = async (req, res) => {
  try {
    const { fileId, filename } = req.params;

    // Try multiple paths in order of priority
    const possiblePaths = [
      path.join(GAME_DATA_DIR, 'images', fileId, 'scenes', filename),
      path.join(GAME_DATA_DIR, 'images', 'scenes', filename),
      path.join(GAME_SAVES_DIR, fileId, 'scenes', filename)
    ];

    let imagePath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        imagePath = testPath;
        break;
      }
    }

    if (!imagePath) {
      return res.status(404).json({
        success: false,
        error: 'Scene image not found',
        message: `Scene image not found: ${filename}`
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve scene image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve scene image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/saves/:saveId/icons/:filename
 */
export const serveIconImage = async (req, res) => {
  try {
    const { saveId, filename } = req.params;

    const imagePath = path.join(GAME_SAVES_DIR, saveId, 'icons', filename);

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Icon image not found',
        message: `Icon image not found: ${filename}`
      });
    }

    // Set appropriate headers for images
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send the file
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve icon image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve icon image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/images/:fileId/serve/icons/:filename
 */
export const serveIconImageFromFileId = async (req, res) => {
  try {
    const { fileId, filename } = req.params;

    // Try multiple paths in order of priority
    const possiblePaths = [
      path.join(GAME_DATA_DIR, 'images', fileId, 'icons', filename),
      path.join(GAME_DATA_DIR, 'images', 'icons', filename),
      path.join(GAME_SAVES_DIR, fileId, 'icons', filename)
    ];

    let imagePath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        imagePath = testPath;
        break;
      }
    }

    if (!imagePath) {
      return res.status(404).json({
        success: false,
        error: 'Icon image not found',
        message: `Icon image not found: ${filename}`
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve icon image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve icon image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/saves/:saveId/avatars/:filename
 */
export const serveAvatarImage = async (req, res) => {
  try {
    const { saveId, filename } = req.params;

    const imagePath = path.join(GAME_SAVES_DIR, saveId, 'avatars', filename);

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Avatar image not found',
        message: `Avatar image not found: ${filename}`
      });
    }

    // Set appropriate headers for images
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send the file
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve avatar image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve avatar image',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/images/:fileId/serve/avatars/:filename
 */
export const serveAvatarImageFromFileId = async (req, res) => {
  try {
    const { fileId, filename } = req.params;

    // Try multiple paths in order of priority
    const possiblePaths = [
      path.join(GAME_DATA_DIR, 'images', fileId, 'avatars', filename),
      path.join(GAME_DATA_DIR, 'images', 'avatars', filename),
      path.join(GAME_SAVES_DIR, fileId, 'avatars', filename)
    ];

    let imagePath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        imagePath = testPath;
        break;
      }
    }

    if (!imagePath) {
      return res.status(404).json({
        success: false,
        error: 'Avatar image not found',
        message: `Avatar image not found: ${filename}`
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.sendFile(imagePath);
  } catch (error) {
    console.error('Serve avatar image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve avatar image',
      message: error.message
    });
  }
};
