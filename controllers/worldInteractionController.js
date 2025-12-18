import {
  createWorldInteractionSession,
  getSessionState,
  startNewRound,
  loadWorldInteractionSession,
  getInteractionHistory
} from '../services/world_interaction/sessionManager.js';
import {
  generateAndDistributeEvent,
  interactWithNPC,
  selectOption,
  getActiveEventsWithInfo
} from '../services/world_interaction/eventManager.js';
import {
  generateAllWorldInteractionImages,
  generateWorldMapImage,
  generateSceneImage,
  generateSubsceneImage,
  generateAllScenesAndSubscenesImages,
  generateAllNPCImages
} from '../services/world_interaction/imageGenerator.js';
import { loadGameFiles } from '../services/world_interaction/utils.js';
import {
  processWorldInteractionDocument,
  getWorldInteractionGameFiles,
  listWorldInteractionGameFiles,
  deleteWorldInteractionGameFiles
} from '../services/world_interaction/worldInteractionInitialization.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// ============================================
// DOCUMENT MANAGEMENT CONTROLLERS
// ============================================

/**
 * Process world interaction document file (function form)
 * @param {Buffer} fileBuffer - File buffer
 * @param {Object} options - Options object
 * @param {string} options.originalname - Original filename
 * @param {string} options.mimetype - MIME type
 * @param {boolean} options.cleanupTempFile - Whether to cleanup temp file, default true
 * @param {number} options.timeout - Timeout in milliseconds, default 1500000
 * @returns {Promise<Object>} Processing result
 */
export async function processWorldInteractionDocumentFile(fileBuffer, options = {}) {
  const {
    originalname = 'document.pdf',
    mimetype = 'application/pdf',
    cleanupTempFile = true,
    timeout = 1500000
  } = options;

  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid file buffer provided');
  }

  const fileId = randomUUID();
  const fileType = path.extname(originalname).toLowerCase().substring(1);

  // Create temp file path
  const tempDir = path.join(process.cwd(), 'public', 'world_interaction', 'temp', fileId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, originalname);

  try {
    console.log(`📤 Processing world interaction document file: ${originalname} (${fileType}), size: ${fileBuffer.length} bytes`);
    console.log(`[文档解析] 超时设置: ${timeout}ms (${timeout / 60000} 分钟)`);

    // Write buffer to temp file
    fs.writeFileSync(filePath, fileBuffer);

    // Process the document with timeout
    const processPromise =  processWorldInteractionDocument(fileId, filePath, fileType);
    const timeoutPromise = new Promise((_, reject) => {
     setTimeout(() => reject(new Error(`文档解析超时，耗时超过 ${timeout / 60000} 分钟`)), timeout);
   });

    const result = await Promise.race([processPromise, timeoutPromise]);

    // Clean up temp file if requested
    if (cleanupTempFile && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn('Failed to cleanup temp file:', e.message);
      }
    }

    return {
      fileId,
      ...result
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn('Failed to cleanup temp file on error:', e.message);
      }
    }
    throw error;
  }
}

/**
 * Upload and process document for world interaction game
 * POST /api/world-interaction/document/upload
 */
export async function uploadAndProcessDocumentController(req, res) {
  try {
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const fileId = randomUUID();
    const fileType = path.extname(req.file.originalname).toLowerCase().substring(1);
    const filePath = req.file.path;

    console.log(`📤 Processing uploaded file: ${req.file.originalname} (${fileType})`);

    // Process the document
    const result = await processWorldInteractionDocument(fileId, filePath, fileType);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'Document processed successfully',
      fileId,
      metadata: result.metadata,
      preview: {
        title: result.worldSetting.title,
        playerName: result.worldSetting.Player?.name,
        npcCount: result.npcSetting.npcs.length,
        sceneCount: result.sceneSetting.scenes.length
      }
    });
  } catch (error) {
    console.error('Error uploading and processing document:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get world interaction game files by fileId
 * GET /api/world-interaction/document/:fileId
 */
export function getDocumentFilesController(req, res) {
  try {
    const { fileId } = req.params;
    const files = getWorldInteractionGameFiles(fileId);

    res.json({
      success: true,
      fileId,
      ...files
    });
  } catch (error) {
    console.error('Error getting world interaction game files:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * List all uploaded world interaction game files
 * GET /api/world-interaction/document/list/all
 */
export function listAllDocumentsController(req, res) {
  try {
    const files = listWorldInteractionGameFiles();

    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    console.error('Error listing world interaction game files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete world interaction game files by fileId
 * DELETE /api/world-interaction/document/:fileId
 */
export function deleteDocumentController(req, res) {
  try {
    const { fileId } = req.params;
    const deleted = deleteWorldInteractionGameFiles(fileId);

    if (deleted) {
      res.json({
        success: true,
        message: 'World interaction game files deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
  } catch (error) {
    console.error('Error deleting world interaction game files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// SESSION MANAGEMENT CONTROLLERS
// ============================================

/**
 * Create a new world interaction session
 * POST /api/world-interaction/session/create
 *
 * Request body: {
 *   fileId?: string  // Optional - load from temp directory
 *   presetId?: string  // Optional - load from visual_saves directory
 * }
 * Either fileId or presetId must be provided
 */
export function createSessionController(req, res) {
  try {
    const { fileId, presetId } = req.body;

    if (!fileId && !presetId) {
      return res.status(400).json({
        success: false,
        error: 'Either fileId or presetId is required'
      });
    }

    const session = createWorldInteractionSession(fileId, presetId);

    res.json({
      success: true,
      message: 'Session created successfully',
      session: {
        sessionId: session.sessionId,
        fileId: session.fileId,
        presetId: session.presetId,
        currentRound: session.currentRound,
        worldInfo: session.worldInfo,
        player: session.player
      }
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get session state
 * GET /api/world-interaction/session/:sessionId
 */
export function getSessionStateController(req, res) {
  try {
    const { sessionId } = req.params;

    const state = getSessionState(sessionId);

    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error getting session state:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Start a new round (round over button)
 * POST /api/world-interaction/session/:sessionId/next-round
 */
export async function startNewRoundController(req, res) {
  try {
    const { sessionId } = req.params;

    // Load the session first
    const session = loadWorldInteractionSession(sessionId);

    // Start new round (now async - will auto-generate events)
    const updatedSession = await startNewRound(session);

    res.json({
      success: true,
      message: `Round ${updatedSession.currentRound} started`,
      currentRound: updatedSession.currentRound,
      currentKeyEventIndex: updatedSession.currentKeyEventIndex,
      activeEvents: updatedSession.activeEvents
    });
  } catch (error) {
    console.error('Error starting new round:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get interaction history
 * GET /api/world-interaction/session/:sessionId/history
 */
export function getHistoryController(req, res) {
  try {
    const { sessionId } = req.params;

    const interactions = getInteractionHistory(sessionId);

    res.json({
      success: true,
      sessionId,
      interactions,
      count: interactions.length
    });
  } catch (error) {
    console.error('Error getting interaction history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// EVENT MANAGEMENT CONTROLLERS
// ============================================

/**
 * Generate and distribute a new event
 * POST /api/world-interaction/session/:sessionId/distribute-event
 */
export async function distributeEventController(req, res) {
  try {
    const { sessionId } = req.params;

    const result = await generateAndDistributeEvent(sessionId);

    res.json({
      success: true,
      message: 'Event distributed successfully',
      event: result.event,
      npc: {
        id: result.npc.id,
        name: result.npc.name,
        image: result.npc.images?.base || null
      },
      subscene: {
        id: result.subscene.id,
        name: result.subscene.name,
        parentSceneName: result.subscene.parentSceneName
      }
    });
  } catch (error) {
    console.error('Error distributing event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get all active events
 * GET /api/world-interaction/session/:sessionId/events/active
 */
export function getActiveEventsController(req, res) {
  try {
    const { sessionId } = req.params;

    const events = getActiveEventsWithInfo(sessionId);

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    console.error('Error getting active events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Interact with an NPC (click on distributed NPC)
 * POST /api/world-interaction/session/:sessionId/interact/:eventId
 */
export async function interactWithNPCController(req, res) {
  try {
    const { sessionId, eventId } = req.params;

    const interaction = await interactWithNPC(sessionId, eventId);

    res.json({
      success: true,
      interaction
    });
  } catch (error) {
    console.error('Error interacting with NPC:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Select an option (player's choice)
 * POST /api/world-interaction/session/:sessionId/select-option
 *
 * Request body: {
 *   eventId: string,
 *   optionId: string
 * }
 */
export async function selectOptionController(req, res) {
  try {
    const { sessionId } = req.params;
    const { eventId, optionId } = req.body;

    if (!eventId || !optionId) {
      return res.status(400).json({
        success: false,
        error: 'eventId and optionId are required'
      });
    }

    const result = await selectOption(sessionId, eventId, optionId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error selecting option:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// IMAGE GENERATION CONTROLLERS
// ============================================

/**
 * Generate all images for world interaction
 * POST /api/world-interaction/images/generate-all
 *
 * Request body: {
 *   fileId: string
 * }
 */
export async function generateAllImagesController(req, res) {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    const results = await generateAllWorldInteractionImages(fileId);

    res.json({
      success: true,
      message: 'Image generation completed',
      results: {
        worldMap: results.worldMap,
        scenesGenerated: results.scenes.filter(s => s.success).length,
        scenesTotal: results.scenes.length,
        subscenesGenerated: results.subscenes.filter(s => s.success).length,
        subscenesTotal: results.subscenes.length,
        errors: results.errors.length
      },
      details: results
    });
  } catch (error) {
    console.error('Error generating images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate world map image only
 * POST /api/world-interaction/images/generate-world-map
 */
export async function generateWorldMapController(req, res) {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    const imagePath = await generateWorldMapImage(fileId);

    res.json({
      success: true,
      message: 'World map generated successfully',
      imagePath
    });
  } catch (error) {
    console.error('Error generating world map:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate single scene image
 * POST /api/world-interaction/images/generate-scene
 *
 * Request body: {
 *   fileId: string,
 *   sceneId: string
 * }
 */
export async function generateSceneImageController(req, res) {
  try {
    const { fileId, sceneId } = req.body;

    if (!fileId || !sceneId) {
      return res.status(400).json({
        success: false,
        error: 'fileId and sceneId are required'
      });
    }

    const imagePath = await generateSceneImage(fileId, sceneId);

    res.json({
      success: true,
      message: 'Scene image generated successfully',
      sceneId,
      imagePath
    });
  } catch (error) {
    console.error('Error generating scene image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate single subscene image
 * POST /api/world-interaction/images/generate-subscene
 *
 * Request body: {
 *   fileId: string,
 *   sceneId: string,
 *   subsceneId: string
 * }
 */
export async function generateSubsceneImageController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.body;

    if (!fileId || !sceneId || !subsceneId) {
      return res.status(400).json({
        success: false,
        error: 'fileId, sceneId, and subsceneId are required'
      });
    }

    const imagePath = await generateSubsceneImage(fileId, sceneId, subsceneId);

    res.json({
      success: true,
      message: 'Subscene image generated successfully',
      subsceneId,
      imagePath
    });
  } catch (error) {
    console.error('Error generating subscene image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Serve image files
 * GET /api/world-interaction/images/:fileId/:type/:npcId/:filename (for NPCs)
 * GET /api/world-interaction/images/:fileId/:type/:filename (for scenes, subscenes, players)
 *
 * Supports serving images from both:
 * - /public/world_interaction/images/{fileId}/ (generated images)
 * - /visual_saves/{presetId}/ (preset images)
 */
export function serveImageController(req, res) {
  try {
    const { fileId, type, npcId, filename } = req.params;

    let imagePath;

    // Try world_interaction/images directory first (for generated images)
    const generatedBaseDir = path.join(process.cwd(), 'public', 'world_interaction', 'images', fileId);

    // Fallback to visual_saves directory (for preset images)
    const presetBaseDir = path.join(process.cwd(), 'visual_saves', fileId);

    // Determine image path based on type
    let generatedPath, presetPath;

    if (type === 'npcs' && npcId && filename) {
      // NPC image with npcId subdirectory: /api/world-interaction/images/{fileId}/npcs/{npcId}/{filename}
      generatedPath = path.join(generatedBaseDir, 'npcs', npcId, filename);
      presetPath = path.join(presetBaseDir, 'npcs', npcId, filename);
    } else if (type === 'world_map.png') {
      // World map: /api/world-interaction/images/{fileId}/world_map.png/dummy
      generatedPath = path.join(generatedBaseDir, 'world_map.png');
      presetPath = path.join(presetBaseDir, 'world_map.png');
    } else if (type === 'scenes') {
      // Scene image: /api/world-interaction/images/{fileId}/scenes/{filename}
      // In this case, npcId is actually the filename when no npcId param
      const actualFilename = filename || npcId;
      generatedPath = path.join(generatedBaseDir, 'scenes', actualFilename);
      presetPath = path.join(presetBaseDir, 'scenes', actualFilename);
    } else if (type === 'subscenes') {
      // Subscene image: /api/world-interaction/images/{fileId}/subscenes/{filename}
      const actualFilename = filename || npcId;
      generatedPath = path.join(generatedBaseDir, 'subscenes', actualFilename);
      presetPath = path.join(presetBaseDir, 'subscenes', actualFilename);
    } else if (type === 'players') {
      // Player image: /api/world-interaction/images/{fileId}/players/{filename}
      const actualFilename = filename || npcId;
      generatedPath = path.join(generatedBaseDir, 'players', actualFilename);
      presetPath = path.join(presetBaseDir, 'players', actualFilename);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid image type'
      });
    }

    // Try generated images first, then preset images
    if (fs.existsSync(generatedPath)) {
      imagePath = generatedPath;
    } else if (fs.existsSync(presetPath)) {
      imagePath = presetPath;
    } else {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// DATA ACCESS CONTROLLERS
// ============================================

/**
 * Get game files for a fileId
 * GET /api/world-interaction/files/:fileId
 */
export function getGameFilesController(req, res) {
  try {
    const { fileId } = req.params;

    const files = loadGameFiles(fileId);

    res.json({
      success: true,
      fileId,
      ...files
    });
  } catch (error) {
    console.error('Error getting game files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate all scenes and subscenes images
 * POST /api/world-interaction/images/generate-scenes
 */
export async function generateScenesAndSubscenesController(req, res) {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    const results = await generateAllScenesAndSubscenesImages(fileId);

    res.json({
      success: true,
      message: 'Scene and subscene image generation completed',
      results: {
        scenesGenerated: results.scenes.filter(s => s.success).length,
        scenesTotal: results.scenes.length,
        subscenesGenerated: results.subscenes.filter(s => s.success).length,
        subscenesTotal: results.subscenes.length,
        errors: results.errors.length
      },
      details: results
    });
  } catch (error) {
    console.error('Error generating scene and subscene images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate all NPC images
 * POST /api/world-interaction/images/generate-npcs
 */
export async function generateNPCImagesController(req, res) {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    const results = await generateAllNPCImages(fileId);

    res.json({
      success: true,
      message: 'NPC image generation completed',
      results: {
        npcsGenerated: results.npcs.filter(n => n.success).length,
        npcsTotal: results.npcs.length,
        errors: results.errors.length
      },
      details: results
    });
  } catch (error) {
    console.error('Error generating NPC images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate NPC variant image (one by one)
 * POST /api/world-interaction/images/generate-npc-variant
 */
export async function generateNPCVariantController(req, res) {
  try {
    const { fileId, npcId, variant } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    if (!npcId) {
      return res.status(400).json({
        success: false,
        error: 'npcId is required'
      });
    }

    if (!variant || !variant.type || !variant.value) {
      return res.status(400).json({
        success: false,
        error: 'variant is required with type and value properties (e.g., {type: "expression", value: "happy", description: "..."})'
      });
    }

    const { generateNPCVariantImage } = await import('../services/world_interaction/imageGenerator.js');
    const imagePath = await generateNPCVariantImage(fileId, npcId, variant);

    res.json({
      success: true,
      message: 'NPC variant image generated successfully',
      result: {
        npcId,
        variant: variant.value,
        variantType: variant.type,
        imagePath
      }
    });
  } catch (error) {
    console.error('Error generating NPC variant image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
