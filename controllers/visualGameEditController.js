import {
  updateWorldSetting,
  updatePlayer,
  getAllNPCs,
  getNPCById,
  addNPC,
  updateNPC,
  deleteNPC,
  getAllScenes,
  getSceneById,
  addScene,
  updateScene,
  deleteScene,
  getCompleteGameData,
  uploadNPCImage,
  uploadSceneImage,
  uploadPlayerImage,
  deleteNPCImage
} from '../services/visual/visualGameEditing.js';
import fs from 'fs';

// ============================================
// WORLD SETTING EDIT CONTROLLERS
// ============================================

/**
 * Update world setting
 * PUT /api/visual/edit/:fileId/world
 */
export function updateWorldSettingController(req, res) {
  try {
    const { fileId } = req.params;
    const updates = req.body;

    const updatedWorldSetting = updateWorldSetting(fileId, updates);

    res.json({
      success: true,
      message: 'World setting updated successfully',
      worldSetting: updatedWorldSetting
    });
  } catch (error) {
    console.error('Error updating world setting:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update player information
 * PUT /api/visual/edit/:fileId/player
 */
export function updatePlayerController(req, res) {
  try {
    const { fileId } = req.params;
    const playerUpdates = req.body;

    const updatedPlayer = updatePlayer(fileId, playerUpdates);

    res.json({
      success: true,
      message: 'Player updated successfully',
      player: updatedPlayer
    });
  } catch (error) {
    console.error('Error updating player:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// NPC EDIT CONTROLLERS
// ============================================

/**
 * Get all NPCs
 * GET /api/visual/edit/:fileId/npcs
 */
export function getAllNPCsController(req, res) {
  try {
    const { fileId } = req.params;
    const npcs = getAllNPCs(fileId);

    res.json({
      success: true,
      count: npcs.length,
      npcs
    });
  } catch (error) {
    console.error('Error getting NPCs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get single NPC by ID
 * GET /api/visual/edit/:fileId/npcs/:npcId
 */
export function getNPCController(req, res) {
  try {
    const { fileId, npcId } = req.params;
    const npc = getNPCById(fileId, npcId);

    res.json({
      success: true,
      npc
    });
  } catch (error) {
    console.error('Error getting NPC:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add a new NPC
 * POST /api/visual/edit/:fileId/npcs
 */
export function addNPCController(req, res) {
  try {
    const { fileId } = req.params;
    const npcData = req.body;

    const addedNPC = addNPC(fileId, npcData);

    res.json({
      success: true,
      message: 'NPC added successfully',
      npc: addedNPC
    });
  } catch (error) {
    console.error('Error adding NPC:', error);
    res.status(error.message.includes('already exists') ? 409 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update an existing NPC
 * PUT /api/visual/edit/:fileId/npcs/:npcId
 */
export function updateNPCController(req, res) {
  try {
    const { fileId, npcId } = req.params;
    const updates = req.body;

    const updatedNPC = updateNPC(fileId, npcId, updates);

    res.json({
      success: true,
      message: 'NPC updated successfully',
      npc: updatedNPC
    });
  } catch (error) {
    console.error('Error updating NPC:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete an NPC
 * DELETE /api/visual/edit/:fileId/npcs/:npcId
 */
export function deleteNPCController(req, res) {
  try {
    const { fileId, npcId } = req.params;

    deleteNPC(fileId, npcId);

    res.json({
      success: true,
      message: `NPC '${npcId}' deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting NPC:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// SCENE EDIT CONTROLLERS
// ============================================

/**
 * Get all scenes
 * GET /api/visual/edit/:fileId/scenes
 */
export function getAllScenesController(req, res) {
  try {
    const { fileId } = req.params;
    const scenes = getAllScenes(fileId);

    res.json({
      success: true,
      count: scenes.length,
      scenes
    });
  } catch (error) {
    console.error('Error getting scenes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get single scene by ID
 * GET /api/visual/edit/:fileId/scenes/:sceneId
 */
export function getSceneController(req, res) {
  try {
    const { fileId, sceneId } = req.params;
    const scene = getSceneById(fileId, sceneId);

    res.json({
      success: true,
      scene
    });
  } catch (error) {
    console.error('Error getting scene:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add a new scene
 * POST /api/visual/edit/:fileId/scenes
 */
export function addSceneController(req, res) {
  try {
    const { fileId } = req.params;
    const sceneData = req.body;

    const addedScene = addScene(fileId, sceneData);

    res.json({
      success: true,
      message: 'Scene added successfully',
      scene: addedScene
    });
  } catch (error) {
    console.error('Error adding scene:', error);
    res.status(error.message.includes('already exists') ? 409 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update an existing scene
 * PUT /api/visual/edit/:fileId/scenes/:sceneId
 */
export function updateSceneController(req, res) {
  try {
    const { fileId, sceneId } = req.params;
    const updates = req.body;

    const updatedScene = updateScene(fileId, sceneId, updates);

    res.json({
      success: true,
      message: 'Scene updated successfully',
      scene: updatedScene
    });
  } catch (error) {
    console.error('Error updating scene:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete a scene
 * DELETE /api/visual/edit/:fileId/scenes/:sceneId
 */
export function deleteSceneController(req, res) {
  try {
    const { fileId, sceneId } = req.params;

    deleteScene(fileId, sceneId);

    res.json({
      success: true,
      message: `Scene '${sceneId}' deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting scene:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// COMPLETE DATA CONTROLLER
// ============================================

/**
 * Get complete game data for editing
 * GET /api/visual/edit/:fileId/complete
 */
export async function getCompleteGameDataController(req, res) {
  try {
    const { fileId } = req.params;
    const gameData = await getCompleteGameData(fileId);
    res.json({
      success: true,
      fileId,
      ...gameData
    });
  } catch (error) {
    console.error('Error getting complete game data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// IMAGE UPLOAD CONTROLLERS
// ============================================

/**
 * Upload NPC image
 * POST /api/visual/edit/:fileId/npcs/:npcId/image
 */
export function uploadNPCImageController(req, res) {
  try {
    const { fileId, npcId } = req.params;
    const { variant = 'base' } = req.body;

    console.log(`Uploading NPC image for fileId=${fileId}, npcId=${npcId}, variant=${variant}`);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = uploadNPCImage(fileId, npcId, req.file, variant);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `NPC image uploaded successfully`,
      ...result
    });
  } catch (error) {
    console.error('Error uploading NPC image:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Upload scene image
 * POST /api/visual/edit/:fileId/scenes/:sceneId/image
 */
export function uploadSceneImageController(req, res) {
  try {
    const { fileId, sceneId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = uploadSceneImage(fileId, sceneId, req.file);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Scene image uploaded successfully`,
      ...result
    });
  } catch (error) {
    console.error('Error uploading scene image:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Upload player image
 * POST /api/visual/edit/:fileId/player/image
 */
export function uploadPlayerImageController(req, res) {
  try {
    const { fileId } = req.params;
    const { variant = 'base' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = uploadPlayerImage(fileId, req.file, variant);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Player image uploaded successfully`,
      ...result
    });
  } catch (error) {
    console.error('Error uploading player image:', error);

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
 * Delete NPC image variant
 * DELETE /api/visual/edit/:fileId/npcs/:npcId/image/:variant
 */
export function deleteNPCImageController(req, res) {
  try {
    const { fileId, npcId, variant } = req.params;

    deleteNPCImage(fileId, npcId, variant);

    res.json({
      success: true,
      message: `NPC image variant '${variant}' deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting NPC image:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}
