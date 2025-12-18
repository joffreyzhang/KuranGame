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
  getSubscenesBySceneId,
  getSubsceneById,
  addSubscene,
  updateSubscene,
  deleteSubscene,
  moveSubscene,
  updateScenePositions,
  updateSubscenePositions,
  updateSubsceneNpcSlots,
  uploadNPCImage,
  uploadSceneImage,
  uploadSubsceneImage,
  uploadPlayerImage,
  uploadWorldMapImage,
  deleteNPCImage,
  deleteSceneImage,
  deleteSubsceneImage
} from '../services/world_interaction/worldInteractionEditing.js';
import fs from 'fs';

// ============================================
// WORLD SETTING CONTROLLERS
// ============================================

/**
 * Update world setting
 * PUT /api/world-interaction/edit/:fileId/world-setting
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
 * Update player
 * PUT /api/world-interaction/edit/:fileId/player
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
// NPC CONTROLLERS
// ============================================

/**
 * Get all NPCs
 * GET /api/world-interaction/edit/:fileId/npcs
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
 * Get NPC by ID
 * GET /api/world-interaction/edit/:fileId/npcs/:npcId
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
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add new NPC
 * POST /api/world-interaction/edit/:fileId/npcs
 */
export function addNPCController(req, res) {
  try {
    const { fileId } = req.params;
    const npcData = req.body;

    const newNPC = addNPC(fileId, npcData);

    res.json({
      success: true,
      message: 'NPC added successfully',
      npc: newNPC
    });
  } catch (error) {
    console.error('Error adding NPC:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update NPC
 * PUT /api/world-interaction/edit/:fileId/npcs/:npcId
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete NPC
 * DELETE /api/world-interaction/edit/:fileId/npcs/:npcId
 */
export function deleteNPCController(req, res) {
  try {
    const { fileId, npcId } = req.params;

    deleteNPC(fileId, npcId);

    res.json({
      success: true,
      message: 'NPC deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting NPC:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update subscene NPC slots
 * PUT /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId/npc-slots
 *
 * Request body: {
 *   npcSlots: [
 *     { position: [0.5, 0.3], zoom: 0.8 },
 *     { position: [0.5, 0.3], zoom: 0.8 },
 *     { position: [0.5, 0.3], zoom: 0.8 }
 *   ]
 * }
 */
export function updateSubsceneNpcSlotsController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.params;
    const { npcSlots } = req.body;

    if (!npcSlots || !Array.isArray(npcSlots)) {
      return res.status(400).json({
        success: false,
        error: 'npcSlots must be an array with 3 slot configurations'
      });
    }

    const result = updateSubsceneNpcSlots(fileId, sceneId, subsceneId, npcSlots);

    res.json({
      success: true,
      message: result.message,
      subscene: result.subscene
    });
  } catch (error) {
    console.error('Error updating subscene NPC slots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// SCENE CONTROLLERS
// ============================================

/**
 * Get all scenes
 * GET /api/world-interaction/edit/:fileId/scenes
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
 * Get scene by ID
 * GET /api/world-interaction/edit/:fileId/scenes/:sceneId
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
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add new scene
 * POST /api/world-interaction/edit/:fileId/scenes
 */
export function addSceneController(req, res) {
  try {
    const { fileId } = req.params;
    const sceneData = req.body;

    const newScene = addScene(fileId, sceneData);

    res.json({
      success: true,
      message: 'Scene added successfully',
      scene: newScene
    });
  } catch (error) {
    console.error('Error adding scene:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update scene
 * PUT /api/world-interaction/edit/:fileId/scenes/:sceneId
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete scene
 * DELETE /api/world-interaction/edit/:fileId/scenes/:sceneId
 */
export function deleteSceneController(req, res) {
  try {
    const { fileId, sceneId } = req.params;

    deleteScene(fileId, sceneId);

    res.json({
      success: true,
      message: 'Scene deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting scene:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// SUBSCENE CONTROLLERS
// ============================================

/**
 * Get all subscenes for a scene
 * GET /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes
 */
export function getSubscenesController(req, res) {
  try {
    const { fileId, sceneId } = req.params;

    const subscenes = getSubscenesBySceneId(fileId, sceneId);

    res.json({
      success: true,
      sceneId,
      count: subscenes.length,
      subscenes
    });
  } catch (error) {
    console.error('Error getting subscenes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get subscene by ID
 * GET /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId
 */
export function getSubsceneController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.params;

    const subscene = getSubsceneById(fileId, sceneId, subsceneId);

    res.json({
      success: true,
      subscene
    });
  } catch (error) {
    console.error('Error getting subscene:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add new subscene
 * POST /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes
 */
export function addSubsceneController(req, res) {
  try {
    const { fileId, sceneId } = req.params;
    const subsceneData = req.body;

    const newSubscene = addSubscene(fileId, sceneId, subsceneData);

    res.json({
      success: true,
      message: 'Subscene added successfully',
      subscene: newSubscene
    });
  } catch (error) {
    console.error('Error adding subscene:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update subscene
 * PUT /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId
 */
export function updateSubsceneController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.params;
    const updates = req.body;

    const updatedSubscene = updateSubscene(fileId, sceneId, subsceneId, updates);

    res.json({
      success: true,
      message: 'Subscene updated successfully',
      subscene: updatedSubscene
    });
  } catch (error) {
    console.error('Error updating subscene:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete subscene
 * DELETE /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId
 */
export function deleteSubsceneController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.params;

    deleteSubscene(fileId, sceneId, subsceneId);

    res.json({
      success: true,
      message: 'Subscene deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscene:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// SCENE-SUBSCENE RELATIONSHIP CONTROLLERS
// ============================================

/**
 * Move subscene from one scene to another
 * POST /api/world-interaction/edit/:fileId/subscenes/:subsceneId/move
 *
 * Request body: {
 *   fromSceneId: string,
 *   toSceneId: string
 * }
 */
export function moveSubsceneController(req, res) {
  try {
    const { fileId, subsceneId } = req.params;
    const { fromSceneId, toSceneId } = req.body;

    if (!fromSceneId || !toSceneId) {
      return res.status(400).json({
        success: false,
        error: 'fromSceneId and toSceneId are required'
      });
    }

    const result = moveSubscene(fileId, subsceneId, fromSceneId, toSceneId);

    res.json({
      success: true,
      message: result.message,
      subscene: result.subscene,
      fromSceneId: result.fromSceneId,
      toSceneId: result.toSceneId
    });
  } catch (error) {
    console.error('Error moving subscene:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update multiple scene positions
 * PUT /api/world-interaction/edit/:fileId/scenes/positions
 *
 * Request body: {
 *   positions: {
 *     "scene1": [0.5, 0.5],
 *     "scene2": [0.3, 0.7],
 *     "scene3": [0.8, 0.2]
 *   }
 * }
 */
export function updateScenePositionsController(req, res) {
  try {
    const { fileId } = req.params;
    const { positions } = req.body;

    if (!positions || typeof positions !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'positions must be an object mapping sceneId to position arrays'
      });
    }

    const result = updateScenePositions(fileId, positions);

    res.json({
      success: true,
      message: result.message,
      updatedCount: result.updatedCount,
      scenes: result.scenes
    });
  } catch (error) {
    console.error('Error updating scene positions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update multiple subscene positions within a scene
 * PUT /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/positions
 *
 * Request body: {
 *   positions: {
 *     "subscene1": [0.5, 0.5],
 *     "subscene2": [0.3, 0.7],
 *     "subscene3": [0.8, 0.2]
 *   }
 * }
 */
export function updateSubscenePositionsController(req, res) {
  try {
    const { fileId, sceneId } = req.params;
    const { positions } = req.body;

    if (!positions || typeof positions !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'positions must be an object mapping subsceneId to position arrays'
      });
    }

    const result = updateSubscenePositions(fileId, sceneId, positions);

    res.json({
      success: true,
      message: result.message,
      sceneId: result.sceneId,
      updatedCount: result.updatedCount,
      subscenes: result.subscenes
    });
  } catch (error) {
    console.error('Error updating subscene positions:', error);
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
 * POST /api/world-interaction/edit/:fileId/npcs/:npcId/image
 */
export async function uploadNPCImageController(req, res) {
  try {
    const { fileId, npcId } = req.params;
    const { variant = 'base' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = await uploadNPCImage(fileId, npcId, req.file, variant);

    // Clean up uploaded file
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: 'NPC image uploaded successfully',
      ...result
    });
  } catch (error) {
    console.error('Error uploading NPC image:', error);

    // Clean up on error
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
 * Upload scene image
 * POST /api/world-interaction/edit/:fileId/scenes/:sceneId/image
 */
export async function uploadSceneImageController(req, res) {
  try {
    const { fileId, sceneId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = await uploadSceneImage(fileId, sceneId, req.file);

    // Clean up uploaded file
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: 'Scene image uploaded successfully',
      ...result
    });
  } catch (error) {
    console.error('Error uploading scene image:', error);

    // Clean up on error
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
 * Upload subscene image
 * POST /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId/image
 */
export async function uploadSubsceneImageController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = await uploadSubsceneImage(fileId, sceneId, subsceneId, req.file);

    // Clean up uploaded file
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: 'Subscene image uploaded successfully',
      ...result
    });
  } catch (error) {
    console.error('Error uploading subscene image:', error);

    // Clean up on error
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
 * Upload player image
 * POST /api/world-interaction/edit/:fileId/player/image
 */
export async function uploadPlayerImageController(req, res) {
  try {
    const { fileId } = req.params;
    const { variant = 'base' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = await uploadPlayerImage(fileId, req.file, variant);

    // Clean up uploaded file
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: 'Player image uploaded successfully',
      ...result
    });
  } catch (error) {
    console.error('Error uploading player image:', error);

    // Clean up on error
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
 * Upload world map image
 * POST /api/world-interaction/edit/:fileId/world-map/image
 */
export async function uploadWorldMapImageController(req, res) {
  try {
    const { fileId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const result = await uploadWorldMapImage(fileId, req.file);

    // Clean up uploaded file
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: result.message,
      imagePath: result.imagePath
    });
  } catch (error) {
    console.error('Error uploading world map image:', error);

    // Clean up on error
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

// ============================================
// IMAGE DELETION CONTROLLERS
// ============================================

/**
 * Delete NPC image
 * DELETE /api/world-interaction/edit/:fileId/npcs/:npcId/image/:variant
 */
export function deleteNPCImageController(req, res) {
  try {
    const { fileId, npcId, variant } = req.params;

    deleteNPCImage(fileId, npcId, variant);

    res.json({
      success: true,
      message: 'NPC image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting NPC image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete scene image
 * DELETE /api/world-interaction/edit/:fileId/scenes/:sceneId/image
 */
export function deleteSceneImageController(req, res) {
  try {
    const { fileId, sceneId } = req.params;

    deleteSceneImage(fileId, sceneId);

    res.json({
      success: true,
      message: 'Scene image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting scene image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete subscene image
 * DELETE /api/world-interaction/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId/image
 */
export function deleteSubsceneImageController(req, res) {
  try {
    const { fileId, sceneId, subsceneId } = req.params;

    deleteSubsceneImage(fileId, sceneId, subsceneId);

    res.json({
      success: true,
      message: 'Subscene image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscene image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
