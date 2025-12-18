import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { transformImagePaths } from '../services/visual/utils.js';
import {
  createVisualGameSession,
  loadVisualSession,
  processVisualGameAction,
  getVisualSessionState,
  regenerateVisualGameResponse,
  editVisualGameHistory
} from '../services/visual/visualGameService.js';
import {
  processVisualDocument,
  getVisualGameFiles,
  listVisualGameFiles,
  deleteVisualGameFiles
} from '../services/visual/visualGameInitializtion.js';
import {
  generateAllVisualGameImages,
  generateVisualNPCImage,
  generateNPCVariantImage,
  generateVisualSceneImage,
  generateVisualPlayerImage
} from '../services/visual/imageGeneration.js';

// ============================================
// DOCUMENT MANAGEMENT CONTROLLERS
// ============================================

export async function processDocumentFile(fileBuffer, options = {}) {
  const {
    originalname = 'document.pdf',
    mimetype = 'application/pdf',
    generateImages = false,
    cleanupTempFile = true,
    timeout = 1500000
  } = options;

  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid file buffer provided');
  }

  const fileId = randomUUID();
  const fileType = path.extname(originalname).toLowerCase().substring(1);

  // Create temp file path
  const tempDir = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, originalname);

  try {
    console.log(`📤 Processing document file: ${originalname} (${fileType}), size: ${fileBuffer.length} bytes`);
    console.log(`[文档解析] 超时设置: ${timeout}ms (${timeout / 60000} 分钟)`);

    // Write buffer to temp file
    fs.writeFileSync(filePath, fileBuffer);

    // Process the document with timeout
    const processPromise = await processVisualDocument(fileId, filePath, fileType);
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

    // Generate images if requested (async, non-blocking)
    let imageGenerationResult = null;
    if (generateImages) {
      console.log('🎨 Starting automatic image generation for all game elements...');

      // 修改1：添加 await
      imageGenerationResult = await generateAllVisualGameImages(fileId, {
        generateNPCs: true,
        generateScenes: true,
        generatePlayers: true,
        generateVariants: false,
        removeBg: false,
        updateJSON: true
      });

      console.log('✅ Automatic image generation completed');
    }


    return {
      success: true,
      fileId,
      message: 'Document processed successfully',
      metadata: result.metadata,
      worldSetting: result.worldSetting,
      npcSetting: result.npcSetting,
      sceneSetting: result.sceneSetting,
      preview: {
        title: result.worldSetting.title,
        playerName: (result.worldSetting.player || result.worldSetting.Player)?.name,
        npcCount: result.npcSetting.npcs.length,
        sceneCount: result.sceneSetting.scenes.length
      }
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Clean up temp directory if empty
    try {
      const files = fs.readdirSync(tempDir);
      if (files.length === 0) {
        fs.rmdirSync(tempDir);
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    throw error;
  }
}

/**
 * Upload and process document for visual game
 * POST /api/visual/document/upload
 */
export async function uploadAndProcessDocument(req, res) {
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
    const result = await processVisualDocument(fileId, filePath, fileType);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Automatically generate all images (except NPC variants)
    console.log('🎨 Starting automatic image generation for all game elements...');
    try {
      await generateAllVisualGameImages(fileId, {
        generateNPCs: true,
        generateScenes: true,
        generatePlayers: true,
        generateVariants: false,
        removeBg: false,
        updateJSON: true
      });
      console.log('✅ Automatic image generation completed');
    } catch (imageError) {
      console.error('⚠️ Error during automatic image generation:', imageError);
      // Continue even if image generation fails
    }

 res.json({
      success: true,
      message: 'Document processed successfully',
      fileId,
      metadata: result.metadata,
      preview: {
        title: result.worldSetting.title,
        playerName: (result.worldSetting.player || result.worldSetting.Player)?.name,
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
 * Get visual game files by fileId
 * GET /api/visual/document/:fileId
 */
export function getDocumentFiles(req, res) {
  try {
    const { fileId } = req.params;
    const files = getVisualGameFiles(fileId);

    res.json({
      success: true,
      fileId,
      ...files
    });
  } catch (error) {
    console.error('Error getting visual game files:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * List all uploaded visual game files
 * GET /api/visual/document/list/all
 */
export function listAllDocuments(req, res) {
  try {
    const files = listVisualGameFiles();

    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    console.error('Error listing visual game files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete visual game files by fileId
 * DELETE /api/visual/document/:fileId
 */
export function deleteDocument(req, res) {
  try {
    const { fileId } = req.params;
    const deleted = deleteVisualGameFiles(fileId);

    if (deleted) {
      res.json({
        success: true,
        message: 'Files deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
  } catch (error) {
    console.error('Error deleting visual game files:', error);
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
 * Create a new visual game session
 * POST /api/visual/session/create
 */
export function createSession(req, res) {
  try {
    const { fileId, presetId, playerName } = req.body;
    const sessionId = randomUUID();

    // Create session with optional fileId or presetId
    const sessionState = createVisualGameSession(sessionId, fileId, presetId);

    // Override player name if provided
    if (playerName) {
      sessionState.player.name = playerName;
    }

    res.json({
      success: true,
      message: 'Visual game session created successfully',
      sessionId,
      fileId: fileId || null,
      presetId: presetId || null,
      player: sessionState.player,
      currentScene: {
        id: sessionState.currentScene,
        name: sessionState.sceneSetting.scenes.find(s => s.id === sessionState.currentScene)?.name
      },
      worldInfo: {
        title: sessionState.worldSetting.title,
        summary: sessionState.worldSetting.summary,
        theme: sessionState.worldSetting.Theme
      }
    });
  } catch (error) {
    console.error('Error creating visual game session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get visual game session state
 * GET /api/visual/session/:sessionId
 */
export function getSessionState(req, res) {
  try {
    const { sessionId } = req.params;
    const sessionState = getVisualSessionState(sessionId);

    if (!sessionState) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      sessionState
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
 * Send action to visual game with SSE streaming
 * POST /api/visual/session/:sessionId/action/stream
 */
export async function sendActionWithStream(req, res) {
  try {
    const { sessionId } = req.params;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: 'Starting narrative generation...',
      action
    })}\n\n`);

    const session = loadVisualSession(sessionId);
    if (!session) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Session not found'
      })}\n\n`);
      res.end();
      return;
    }

    // Process action with streaming from Claude
    const result = await processVisualGameAction(sessionId, action, (data, index) => {
      // The data is already JSON string from parseVisualNarrativeSteps
      res.write(`data: ${data}\n`);
    });

    // Send final completion event with all data
    res.write(`data: ${JSON.stringify({
      type: 'data',
      success: true,
      response: result.response,
      narrativeSteps: result.narrativeSteps,
      actionOptions: result.actionOptions,
      currentScene: result.currentScene,
      npcs: result.npcs,
      metadata: result.metadata,
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.write(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error processing visual game action with stream:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to process action',
      message: error.message
    })}\n\n`);
    res.end();
  }
}

/**
 * Get conversation history
 * GET /api/visual/session/:sessionId/history
 */
export function getHistory(req, res) {
  try {
    const { sessionId } = req.params;
    const session = loadVisualSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      history: session.conversationHistory,
      visitedScenes: session.visitedScenes
    });
  } catch (error) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Regenerate a response from conversation history with SSE streaming
 * POST /api/visual/session/:sessionId/regenerate
 */
export async function regenerateResponse(req, res) {
  try {
    const { sessionId } = req.params;
    const { historyIndex } = req.body;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const session = loadVisualSession(sessionId);
    if (!session) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Session not found'
      })}\n\n`);
      res.end();
      return;
    }

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: 'Regenerating response...',
      historyIndex: historyIndex ?? null
    })}\n\n`);

    // Regenerate the response with streaming
    const result = await regenerateVisualGameResponse(sessionId, historyIndex ?? null, (data, index) => {
      res.write(`data: ${data}\n`);
    });

    // Send final completion event with all data
    res.write(`data: ${JSON.stringify({
      type: 'data',
      success: true,
      response: result.response,
      narrativeSteps: result.narrativeSteps,
      actionOptions: result.actionOptions,
      currentScene: result.currentScene,
      npcs: result.npcs,
      metadata: result.metadata,
      regenerated: result.regenerated,
      regeneratedFrom: result.regeneratedFrom,
      truncatedMessages: result.truncatedMessages,
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.write(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error regenerating response:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to regenerate response',
      message: error.message
    })}\n\n`);
    res.end();
  }
}

/**
 * Edit a message in conversation history
 * PUT /api/visual/session/:sessionId/history/:historyIndex
 */
export function editHistory(req, res) {
  try {
    const { sessionId, historyIndex } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    const index = parseInt(historyIndex, 10);
    if (isNaN(index)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid history index'
      });
    }

    const result = editVisualGameHistory(sessionId, index, content);

    res.json(result);
  } catch (error) {
    console.error('Error editing history:', error);
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
 * Generate all images for a visual game
 * POST /api/visual/images/generate-all
 */
export async function generateAllImages(req, res) {
  try {
    const { fileId, generateNPCs, generateScenes, generatePlayers, generateVariants, removeBg } = req.body;

    console.log(`🎨 Starting image generation for fileId: ${fileId || 'preset'}`);

    const results = await generateAllVisualGameImages(fileId || null, {
      generateNPCs: generateNPCs !== false,
      generateScenes: generateScenes !== false,
      generatePlayers: generatePlayers !== false,
      generateVariants: generateVariants === true,
      removeBg: removeBg !== false,
      updateJSON: true
    });

    res.json({
      success: true,
      message: 'Image generation completed',
      results: {
        npcs: results.npcs.length,
        npcVariants: results.npcVariants.length,
        scenes: results.scenes.length,
        players: results.players.length,
        errors: results.errors.length
      },
      details: results
    });
  } catch (error) {
    console.error('Error generating all images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate single NPC image
 * POST /api/visual/images/generate-npc
 */
export async function generateNPCImage(req, res) {
  try {
    const { npc, fileId, pluginType, removeBg } = req.body;

    if (!npc || !npc.id || !npc.name) {
      return res.status(400).json({
        success: false,
        error: 'NPC data (id, name) is required'
      });
    }

    console.log(`🎨 Generating image for NPC: ${npc.name}`);

    const imagePath = await generateVisualNPCImage(
      npc,
      fileId || null,
      removeBg !== false,
      null, // presetId
      pluginType
    );

    // Update npcSetting.json with the new image path
    try {
      let npcSettingPath;

      // Detect plugin type from pluginType parameter or baseImagePath
      const detectedPluginType = pluginType;

      if (detectedPluginType === 'world-interaction' && fileId) {
        // World-interaction plugin
        npcSettingPath = path.join(process.cwd(), 'public', 'world_interaction', 'temp', fileId, 'npcSetting.json');
      } else if (detectedPluginType === 'visual' && fileId) {
        // Visual game - user uploaded
        npcSettingPath = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'npcSetting.json');
      } else if (detectedPluginType === 'preset') {
        // Preset game - extract presetId from path or use from request
        const { presetId } = req.body;
        const presetIdFromPath = match ? match[1] : presetId;

        if (presetIdFromPath) {
          npcSettingPath = path.join(process.cwd(), 'visual_saves', presetIdFromPath, 'npcSetting.json');
        }
      } else if (fileId) {
        // Fallback: try visual game path
        npcSettingPath = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'npcSetting.json');
      }

      if (npcSettingPath && fs.existsSync(npcSettingPath)) {
        const npcSetting = JSON.parse(fs.readFileSync(npcSettingPath, 'utf-8'));

        // Find and update the NPC in the settings
        const npcIndex = npcSetting.npcs.findIndex(n => n.id === npc.id);
        if (npcIndex !== -1) {
          if (!npcSetting.npcs[npcIndex].images) {
            npcSetting.npcs[npcIndex].images = {};
          }
          npcSetting.npcs[npcIndex].images['base'] = imagePath;

          // Save updated settings
          fs.writeFileSync(npcSettingPath, JSON.stringify(npcSetting, null, 2), 'utf-8');
          console.log(`✅ Updated npcSetting.json with image path for NPC: ${npc.id}`);
        }
      } else if (npcSettingPath) {
        console.warn(`⚠️ NPC setting file not found: ${npcSettingPath}`);
      }
    } catch (updateError) {
      console.error('⚠️ Error updating npcSetting.json:', updateError.message);
      // Continue even if update fails
    }

    res.json({
      success: true,
      message: `Image generated for NPC: ${npc.name}`,
      imagePath
    });
  } catch (error) {
    console.error('Error generating NPC image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate NPC variant image using base image as reference
 * POST /api/visual/images/generate-npc-variant
 */
export async function generateNPCVariant(req, res) {
  try {
    const { npcId, baseImagePath, variant, fileId, removeBg, pluginType } = req.body;

    if (!npcId) {
      return res.status(400).json({
        success: false,
        error: 'npcId is required'
      });
    }

    if (!baseImagePath) {
      return res.status(400).json({
        success: false,
        error: 'baseImagePath is required'
      });
    }

    if (!variant || !variant.type || !variant.value) {
      return res.status(400).json({
        success: false,
        error: 'variant object with type and value is required'
      });
    }

    console.log(`🎨 Generating variant image for NPC: ${npcId} (${variant.type}: ${variant.value})`);

    const imagePath = await generateNPCVariantImage(
      npcId,
      baseImagePath,
      variant,
      fileId || null,
      removeBg !== false,
      null, // presetId
      pluginType || null // Pass pluginType to service
    );

    // Update npcSetting.json with the new variant image path
    try {
      let npcSettingPath;

      // Detect plugin type from pluginType parameter or baseImagePath
      const detectedPluginType = pluginType ||
        (baseImagePath.startsWith('/api/world-interaction/images') ? 'world-interaction' :
         baseImagePath.startsWith('/api/visual/presets/') ? 'preset' : 'visual');

      if (detectedPluginType === 'world-interaction' && fileId) {
        // World-interaction plugin
        npcSettingPath = path.join(process.cwd(), 'public', 'world_interaction','temp', fileId, 'npcSetting.json');
      } else if (detectedPluginType === 'visual' && fileId) {
        // Visual game - user uploaded
        npcSettingPath = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'npcSetting.json');
      } else if (detectedPluginType === 'preset') {
        // Preset game - extract presetId from path or use from request
        const { presetId } = req.body;
        const match = baseImagePath.match(/\/api\/visual\/presets\/([^\/]+)\//);
        const presetIdFromPath = match ? match[1] : presetId;

        if (presetIdFromPath) {
          npcSettingPath = path.join(process.cwd(), 'visual_saves', presetIdFromPath, 'npcSetting.json');
        }
      } else if (fileId) {
        // Fallback: try visual game path
        npcSettingPath = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'npcSetting.json');
      }

      if (npcSettingPath && fs.existsSync(npcSettingPath)) {
        const npcSetting = JSON.parse(fs.readFileSync(npcSettingPath, 'utf-8'));

        // Find and update the NPC in the settings
        const npcIndex = npcSetting.npcs.findIndex(n => n.id === npcId);
        if (npcIndex !== -1) {
          if (!npcSetting.npcs[npcIndex].images) {
            npcSetting.npcs[npcIndex].images = {};
          }

          // Store variant image path with key like "expression_happy" or "clothing_casual"
          const variantKey = `${variant.type}_${variant.value.replace(/\s+/g, '_')}`;
          npcSetting.npcs[npcIndex].images[variantKey] = imagePath;

          // Save updated settings
          fs.writeFileSync(npcSettingPath, JSON.stringify(npcSetting, null, 2), 'utf-8');
          console.log(`✅ Updated npcSetting.json with new variant image path for NPC: ${npcId}`);
        }
      } else if (npcSettingPath) {
        console.warn(`⚠️ NPC setting file not found: ${npcSettingPath}`);
      }
    } catch (updateError) {
      console.error('⚠️ Error updating npcSetting.json:', updateError.message);
      // Continue even if update fails
    }

    res.json({
      success: true,
      message: `Variant image generated for NPC: ${npcId}`,
      imagePath,
      variant: {
        type: variant.type,
        value: variant.value
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

/**
 * Generate single scene image
 * POST /api/visual/images/generate-scene
 */
export async function generateSceneImage(req, res) {
  try {
    const { scene, fileId, pluginType } = req.body;

    if (!scene || !scene.id || !scene.name) {
      return res.status(400).json({
        success: false,
        error: 'Scene data (id, name) is required'
      });
    }

    console.log(`🎨 Generating image for scene: ${scene.name}`);

    // Determine plugin type: 'world-interaction' or 'visual' (default)
    const detectedPluginType = pluginType || 'visual';

    const imagePath = await generateVisualSceneImage(
      scene,
      fileId || null,
      null, // presetId
      detectedPluginType
    );

    // Update sceneSetting.json with the new image path
    try {
      let sceneSettingPath;
      const isWorldInteraction = detectedPluginType === 'world-interaction';
      const { presetId } = req.body;

      if (isWorldInteraction && fileId) {
        // World-interaction plugin
        sceneSettingPath = path.join(process.cwd(), 'public', 'world_interaction','temp', fileId, 'sceneSetting.json');
      } else if (fileId) {
        // Visual game - user uploaded
        sceneSettingPath = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'sceneSetting.json');
      } else if (presetId) {
        // Preset game
        sceneSettingPath = path.join(process.cwd(), 'visual_saves', presetId, 'sceneSetting.json');
      }

      if (sceneSettingPath && fs.existsSync(sceneSettingPath)) {
        const sceneSetting = JSON.parse(fs.readFileSync(sceneSettingPath, 'utf-8'));

        // Find and update the scene in the settings
        const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === scene.id);
        if (sceneIndex !== -1) {
          sceneSetting.scenes[sceneIndex].image = imagePath;

          // Save updated settings
          fs.writeFileSync(sceneSettingPath, JSON.stringify(sceneSetting, null, 2), 'utf-8');
          console.log(`✅ Updated sceneSetting.json with new image path for scene: ${scene.name}`);
        }
      } else if (sceneSettingPath) {
        console.warn(`⚠️ Scene setting file not found: ${sceneSettingPath}`);
      }
    } catch (updateError) {
      console.error('⚠️ Error updating sceneSetting.json:', updateError.message);
      // Continue even if update fails
    }

    res.json({
      success: true,
      message: `Image generated for scene: ${scene.name}`,
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
 * Generate player image
 * POST /api/visual/images/generate-player
 */
export async function generatePlayerImage(req, res) {
  try {
    const { player, fileId, removeBg, pluginType } = req.body;

    if (!player || !player.name) {
      return res.status(400).json({
        success: false,
        error: 'Player data (name) is required'
      });
    }

    console.log(`🎨 Generating image for Player: ${player.name}`);

    // Determine plugin type: 'world-interaction' or 'visual' (default)
    const detectedPluginType = pluginType || 'visual';

    const imagePath = await generateVisualPlayerImage(
      player,
      fileId || null,
      removeBg !== false,
      null, // presetId
      detectedPluginType
    );

    // Update worldSetting.json with the new image path
    try {
      let worldSettingPath;
      const isWorldInteraction = detectedPluginType === 'world-interaction';
      const { presetId } = req.body;

      if (isWorldInteraction && fileId) {
        // World-interaction plugin
        worldSettingPath = path.join(process.cwd(), 'public', 'world_interaction', 'temp', fileId, 'worldSetting.json');
      } else if (fileId) {
        // Visual game - user uploaded
        worldSettingPath = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'worldSetting.json');
      } else if (presetId) {
        // Preset game
        worldSettingPath = path.join(process.cwd(), 'visual_saves', presetId, 'worldSetting.json');
      }

      if (worldSettingPath && fs.existsSync(worldSettingPath)) {
        const worldSetting = JSON.parse(fs.readFileSync(worldSettingPath, 'utf-8'));

        // Update player image path (handle both 'player' and 'Player' property names)
        if (worldSetting.player) {
          worldSetting.player.images = imagePath;

          // Save updated settings
          fs.writeFileSync(worldSettingPath, JSON.stringify(worldSetting, null, 2), 'utf-8');
          console.log(`✅ Updated worldSetting.json with new image path for Player: ${player.name}`);
        }
      } else if (worldSettingPath) {
        console.warn(`⚠️ World setting file not found: ${worldSettingPath}`);
      }
    } catch (updateError) {
      console.error('⚠️ Error updating worldSetting.json:', updateError.message);
      // Continue even if update fails
    }

    res.json({
      success: true,
      message: `Image generated for Player: ${player.name}`,
      imagePath
    });
  } catch (error) {
    console.error('Error generating player image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Serve visual game images
 * GET /api/visual/images/:fileId/:type/:npcId?/:filename
 */
export function serveImage(req, res) {
  try {
    const { fileId, type, npcId, filename } = req.params;

    let imagePath;

    // Try both permanent images directory and temp directory
    const permanentBaseDir = path.join(process.cwd(), 'public', 'visual_game', 'images', fileId, type);
    const tempBaseDir = path.join(process.cwd(), 'public', 'visual_game', 'temp', fileId, 'images', type);

    if (type === 'npcs' && npcId) {
      // NPC image: /api/visual/images/{fileId}/npcs/{npcId}/{filename}
      const permanentPath = path.join(permanentBaseDir, npcId, filename);
      const tempPath = path.join(tempBaseDir, npcId, filename);

      // Check permanent location first, then temp
      if (fs.existsSync(permanentPath)) {
        imagePath = permanentPath;
      } else if (fs.existsSync(tempPath)) {
        imagePath = tempPath;
      }
    } else if (type === 'scenes') {
      // Scene image: /api/visual/images/{fileId}/scenes/{filename}
      // In this case, npcId is actually the filename
      const permanentPath = path.join(permanentBaseDir, npcId);
      const tempPath = path.join(tempBaseDir, npcId);

      if (fs.existsSync(permanentPath)) {
        imagePath = permanentPath;
      } else if (fs.existsSync(tempPath)) {
        imagePath = tempPath;
      }
    } else if (type === 'players') {
      // Player image: /api/visual/images/{fileId}/players/{filename}
      // In this case, npcId is actually the filename
      const permanentPath = path.join(permanentBaseDir, npcId);
      const tempPath = path.join(tempBaseDir, npcId);

      if (fs.existsSync(permanentPath)) {
        imagePath = permanentPath;
      } else if (fs.existsSync(tempPath)) {
        imagePath = tempPath;
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid image path'
      });
    }

    if (!imagePath || !fs.existsSync(imagePath)) {
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
// PRESET GAMES CONTROLLERS (visual_saves)
// ============================================


export function getPresetsList(req, res) {
  try {
    const presetsDir = path.join(process.cwd(), 'visual_saves');

    if (!fs.existsSync(presetsDir)) {
      return res.json({
        success: true,
        count: 0,
        presets: []
      });
    }

    const presetIds = fs.readdirSync(presetsDir).filter(item => {
      const itemPath = path.join(presetsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    const presets = presetIds.map(presetId => {
      try {
        const worldSettingPath = path.join(presetsDir, presetId, 'worldSetting.json');

        if (fs.existsSync(worldSettingPath)) {
          const worldSetting = JSON.parse(fs.readFileSync(worldSettingPath, 'utf-8'));
          return {
            presetId,
            title: worldSetting.title,
            summary: worldSetting.summary,
            themes: worldSetting.Theme,
            playerName: (worldSetting.player || worldSetting.Player)?.name
          };
        }

        return {
          presetId,
          title: 'Unknown',
          summary: '',
          themes: [],
          playerName: ''
        };
      } catch (error) {
        console.error(`Error reading preset ${presetId}:`, error);
        return null;
      }
    }).filter(preset => preset !== null);

    res.json({
      success: true,
      count: presets.length,
      presets
    });
  } catch (error) {
    console.error('Error getting presets list:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export function getPresetGame(req, res) {
  try {
    const { presetId } = req.params;
    // const { updateFiles = 'true' } = req.query; // Option to update files (default: true)
    // const shouldUpdateFiles = updateFiles === 'true';
    const presetDir = path.join(process.cwd(), 'visual_saves', presetId);

    if (!fs.existsSync(presetDir)) {
      return res.status(404).json({
        success: false,
        error: 'Preset game not found'
      });
    }

    // Read all setting files
    const worldSettingPath = path.join(presetDir, 'worldSetting.json');
    const npcSettingPath = path.join(presetDir, 'npcSetting.json');
    const sceneSettingPath = path.join(presetDir, 'sceneSetting.json');

    if (!fs.existsSync(worldSettingPath) || !fs.existsSync(npcSettingPath) || !fs.existsSync(sceneSettingPath)) {
      return res.status(404).json({
        success: false,
        error: 'Preset game files incomplete'
      });
    }

    const worldSetting = JSON.parse(fs.readFileSync(worldSettingPath, 'utf-8'));
    const npcSetting = JSON.parse(fs.readFileSync(npcSettingPath, 'utf-8'));
    const sceneSetting = JSON.parse(fs.readFileSync(sceneSettingPath, 'utf-8'));

    // const transformedNpcSetting = {
    //   ...npcSetting,
    //   npcs: npcSetting.npcs.map(npc => ({
    //     ...npc,
    //     images: transformImagePaths(npc.images, 'npcs', npc.id, presetId)
    //   }))
    // };

    // // Transform image paths in scene settings
    // const transformedSceneSetting = {
    //   ...sceneSetting,
    //   scenes: sceneSetting.scenes.map(scene => ({
    //     ...scene,
    //     image: `/api/visual/presets/${presetId}/images/scenes/${scene.id}.png`
    //   }))
    // };

    // // Write transformed paths back to files if updateFiles is true
    // if (shouldUpdateFiles) {
    //   fs.writeFileSync(npcSettingPath, JSON.stringify(transformedNpcSetting, null, 2), 'utf-8');
    //   fs.writeFileSync(sceneSettingPath, JSON.stringify(transformedSceneSetting, null, 2), 'utf-8');
    //   console.log(`✅ Updated image paths for preset: ${presetId}`);
    // }

    res.json({
      success: true,
      presetId,
      worldSetting,
      npcSetting: npcSetting,
      sceneSetting: sceneSetting
      // filesUpdated: shouldUpdateFiles
    });
  } catch (error) {
    console.error('Error getting preset game:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export function servePresetImage(req, res) {
  try {
    const { presetId, type, imageId, filename } = req.params;
    const presetDir = path.join(process.cwd(), 'visual_saves', presetId);

    if (!fs.existsSync(presetDir)) {
      return res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    }

    let imagePath;

    if (type === 'npcs' && imageId && filename) {
      // NPC image: /api/visual/presets/{presetId}/images/npcs/{npcId}/{filename}
      imagePath = path.join(presetDir, 'npcs', imageId, filename);
    } else if (type === 'scenes' && imageId) {
      // Scene image: /api/visual/presets/{presetId}/images/scenes/{sceneId}.png
      // imageId contains the full filename in this case
      imagePath = path.join(presetDir, 'scenes', imageId);
    } else if (type === 'players' && imageId) {
      // Player image: /api/visual/presets/{presetId}/images/players/{filename}
      // imageId contains the full filename in this case
      imagePath = path.join(presetDir, 'players', imageId);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid image path'
      });
    }

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Image not found',
        path: imagePath
      });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error('Error serving preset image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Serve preset music files
 * GET /api/visual/presets/:presetId/musics/:filename
 */
export function servePresetMusic(req, res) {
  try {
    const { presetId, filename } = req.params;
    const musicPath = path.join(process.cwd(), 'visual_saves', presetId, 'musics', filename);

    if (!fs.existsSync(musicPath)) {
      return res.status(404).json({
        success: false,
        error: 'Music file not found',
        path: musicPath
      });
    }

    // Set proper content type for audio files
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4'
    };

    if (contentTypes[ext]) {
      res.set('Content-Type', contentTypes[ext]);
    }

    res.sendFile(musicPath);
  } catch (error) {
    console.error('Error serving preset music:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
