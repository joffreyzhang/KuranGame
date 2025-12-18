import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sharp from 'sharp';
import { validateWorldSetting, validateNPCSetting, validateSceneSetting } from '../visual/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directories
const WORLD_INTERACTION_TEMP_DIR = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'temp');
const WORLD_INTERACTION_IMAGES_DIR = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'images');

// Standard image dimensions for world interaction
const STANDARD_IMAGE_WIDTH = 768;
const STANDARD_IMAGE_HEIGHT = 1344;


function getFileDirectory(fileId) {
  return path.join(WORLD_INTERACTION_TEMP_DIR, fileId);
}

function loadJSONFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function resizeImageToStandard(imageBuffer, outputPath) {
  try {
    await sharp(imageBuffer)
      .resize(STANDARD_IMAGE_WIDTH, STANDARD_IMAGE_HEIGHT, {
        fit: 'cover', // Cover the entire area, crop if needed
        position: 'center' // Center the image when cropping
      })
      .png() // Convert to PNG for consistency
      .toFile(outputPath);

    console.log(`✅ Image resized to ${STANDARD_IMAGE_WIDTH}x${STANDARD_IMAGE_HEIGHT}: ${outputPath}`);
  } catch (error) {
    console.error('Error resizing image:', error);
    throw new Error(`Failed to resize image: ${error.message}`);
  }
}

export function updateWorldSetting(fileId, updates) {
  try {
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');

    // Load current world setting
    const worldSetting = loadJSONFile(worldSettingPath);

    // Apply updates (deep merge for nested objects like player)
    if (updates.player) {
      worldSetting.player = { ...worldSetting.player, ...updates.player };
      delete updates.player;
    }

    const updatedWorldSetting = { ...worldSetting, ...updates };

    // Validate
    validateWorldSetting(updatedWorldSetting);

    // Save
    saveJSONFile(worldSettingPath, updatedWorldSetting);

    console.log(`✅ World setting updated for fileId: ${fileId}`);
    return updatedWorldSetting;
  } catch (error) {
    console.error('Error updating world setting:', error);
    throw error;
  }
}


export function updatePlayer(fileId, playerUpdates) {
  try {
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');

    const worldSetting = loadJSONFile(worldSettingPath);
    worldSetting.player = { ...worldSetting.player, ...playerUpdates };

    // Validate
    validateWorldSetting(worldSetting);

    // Save
    saveJSONFile(worldSettingPath, worldSetting);

    console.log(`✅ Player updated for fileId: ${fileId}`);
    return worldSetting.player;
  } catch (error) {
    console.error('Error updating player:', error);
    throw error;
  }
}


export function getAllNPCs(fileId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    const npcSetting = loadJSONFile(npcSettingPath);
    return npcSetting.npcs || [];
  } catch (error) {
    console.error('Error getting NPCs:', error);
    throw error;
  }
}

export function getNPCById(fileId, npcId) {
  try {
    const npcs = getAllNPCs(fileId);
    const npc = npcs.find(n => n.id === npcId);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    return npc;
  } catch (error) {
    console.error('Error getting NPC:', error);
    throw error;
  }
}


export function addNPC(fileId, npcData) {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    const npcSetting = loadJSONFile(npcSettingPath);

    // Check if NPC ID already exists
    if (npcSetting.npcs.some(n => n.id === npcData.id)) {
      throw new Error(`NPC with ID '${npcData.id}' already exists`);
    }

    // Validate required fields
    const requiredFields = ['id', 'name', 'gender', 'appearance', 'tone'];
    for (const field of requiredFields) {
      if (!npcData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    npcSetting.npcs.push(npcData);

    // Validate
    validateNPCSetting(npcSetting);

    // Save
    saveJSONFile(npcSettingPath, npcSetting);

    console.log(`✅ NPC added: ${npcData.id}`);
    return npcData;
  } catch (error) {
    console.error('Error adding NPC:', error);
    throw error;
  }
}

export function updateNPC(fileId, npcId, updates) {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    const npcSetting = loadJSONFile(npcSettingPath);
    const npcIndex = npcSetting.npcs.findIndex(n => n.id === npcId);

    if (npcIndex === -1) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Don't allow changing the ID
    if (updates.id && updates.id !== npcId) {
      throw new Error('Cannot change NPC ID. Delete and create a new NPC instead.');
    }

    // Apply updates
    npcSetting.npcs[npcIndex] = { ...npcSetting.npcs[npcIndex], ...updates };

    // Validate
    validateNPCSetting(npcSetting);

    // Save
    saveJSONFile(npcSettingPath, npcSetting);

    console.log(`✅ NPC updated: ${npcId}`);
    return npcSetting.npcs[npcIndex];
  } catch (error) {
    console.error('Error updating NPC:', error);
    throw error;
  }
}


export function deleteNPC(fileId, npcId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    const npcSetting = loadJSONFile(npcSettingPath);
    const npcIndex = npcSetting.npcs.findIndex(n => n.id === npcId);

    if (npcIndex === -1) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Remove NPC
    npcSetting.npcs.splice(npcIndex, 1);

    // Save
    saveJSONFile(npcSettingPath, npcSetting);

    // Also delete NPC images if they exist
    const npcImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'npcs', npcId);
    if (fs.existsSync(npcImageDir)) {
      fs.rmSync(npcImageDir, { recursive: true, force: true });
      console.log(`🗑️ Deleted NPC images: ${npcId}`);
    }

    console.log(`✅ NPC deleted: ${npcId}`);
    return true;
  } catch (error) {
    console.error('Error deleting NPC:', error);
    throw error;
  }
}


export function getAllScenes(fileId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    return sceneSetting.scenes || [];
  } catch (error) {
    console.error('Error getting scenes:', error);
    throw error;
  }
}

export function getSceneById(fileId, sceneId) {
  try {
    const scenes = getAllScenes(fileId);
    const scene = scenes.find(s => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    return scene;
  } catch (error) {
    console.error('Error getting scene:', error);
    throw error;
  }
}


export function addScene(fileId, sceneData) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);

    // Check if scene ID already exists
    if (sceneSetting.scenes.some(s => s.id === sceneData.id)) {
      throw new Error(`Scene with ID '${sceneData.id}' already exists`);
    }

    // Validate required fields
    const requiredFields = ['id', 'name', 'description'];
    for (const field of requiredFields) {
      if (!sceneData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Initialize subscenes array if not present
    if (!sceneData.subscenes) {
      sceneData.subscenes = [];
    }

    sceneSetting.scenes.push(sceneData);

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Scene added: ${sceneData.id}`);
    return sceneData;
  } catch (error) {
    console.error('Error adding scene:', error);
    throw error;
  }
}

export function updateScene(fileId, sceneId, updates) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    // Don't allow changing the ID
    if (updates.id && updates.id !== sceneId) {
      throw new Error('Cannot change scene ID. Delete and create a new scene instead.');
    }

    // Apply updates (preserve subscenes if not in updates)
    sceneSetting.scenes[sceneIndex] = { ...sceneSetting.scenes[sceneIndex], ...updates };

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Scene updated: ${sceneId}`);
    return sceneSetting.scenes[sceneIndex];
  } catch (error) {
    console.error('Error updating scene:', error);
    throw error;
  }
}

export function deleteScene(fileId, sceneId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    // Remove scene
    sceneSetting.scenes.splice(sceneIndex, 1);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    // Also delete scene image if it exists
    const sceneImagePath = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'scenes', `${sceneId}.png`);
    if (fs.existsSync(sceneImagePath)) {
      fs.unlinkSync(sceneImagePath);
      console.log(`🗑️ Deleted scene image: ${sceneId}`);
    }

    // Delete all subscene images for this scene
    const subsceneImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'subscenes');
    if (fs.existsSync(subsceneImageDir)) {
      const subsceneFiles = fs.readdirSync(subsceneImageDir).filter(f => f.startsWith(`${sceneId}_`));
      subsceneFiles.forEach(f => {
        fs.unlinkSync(path.join(subsceneImageDir, f));
        console.log(`🗑️ Deleted subscene image: ${f}`);
      });
    }

    console.log(`✅ Scene deleted: ${sceneId}`);
    return true;
  } catch (error) {
    console.error('Error deleting scene:', error);
    throw error;
  }
}


export function getSubscenesBySceneId(fileId, sceneId) {
  try {
    const scene = getSceneById(fileId, sceneId);
    return scene.subscenes || [];
  } catch (error) {
    console.error('Error getting subscenes:', error);
    throw error;
  }
}


export function getSubsceneById(fileId, sceneId, subsceneId) {
  try {
    const subscenes = getSubscenesBySceneId(fileId, sceneId);
    const subscene = subscenes.find(ss => ss.id === subsceneId);

    if (!subscene) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${sceneId}`);
    }

    return subscene;
  } catch (error) {
    console.error('Error getting subscene:', error);
    throw error;
  }
}

export function addSubscene(fileId, sceneId, subsceneData) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    // Initialize subscenes array if it doesn't exist
    if (!scene.subscenes) {
      scene.subscenes = [];
    }

    // Check if subscene ID already exists in this scene
    if (scene.subscenes.some(ss => ss.id === subsceneData.id)) {
      throw new Error(`Subscene with ID '${subsceneData.id}' already exists in scene '${sceneId}'`);
    }

    // Validate required fields
    const requiredFields = ['id', 'name', 'description'];
    for (const field of requiredFields) {
      if (!subsceneData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Initialize npcs array if not present
    if (!subsceneData.npcs) {
      subsceneData.npcs = [];
    }

    scene.subscenes.push(subsceneData);

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Subscene added: ${subsceneData.id} to scene: ${sceneId}`);
    return subsceneData;
  } catch (error) {
    console.error('Error adding subscene:', error);
    throw error;
  }
}

export function updateSubscene(fileId, sceneId, subsceneId, updates) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    if (!scene.subscenes) {
      throw new Error(`No subscenes found in scene: ${sceneId}`);
    }

    const subsceneIndex = scene.subscenes.findIndex(ss => ss.id === subsceneId);

    if (subsceneIndex === -1) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${sceneId}`);
    }

    // Don't allow changing the ID
    if (updates.id && updates.id !== subsceneId) {
      throw new Error('Cannot change subscene ID. Delete and create a new subscene instead.');
    }

    // Apply updates
    scene.subscenes[subsceneIndex] = { ...scene.subscenes[subsceneIndex], ...updates };

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Subscene updated: ${subsceneId} in scene: ${sceneId}`);
    return scene.subscenes[subsceneIndex];
  } catch (error) {
    console.error('Error updating subscene:', error);
    throw error;
  }
}

export function deleteSubscene(fileId, sceneId, subsceneId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    if (!scene.subscenes) {
      throw new Error(`No subscenes found in scene: ${sceneId}`);
    }

    const subsceneIndex = scene.subscenes.findIndex(ss => ss.id === subsceneId);

    if (subsceneIndex === -1) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${sceneId}`);
    }

    // Remove subscene
    scene.subscenes.splice(subsceneIndex, 1);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    // Delete subscene image if it exists
    const subsceneImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'subscenes');
    if (fs.existsSync(subsceneImageDir)) {
      const subsceneFiles = fs.readdirSync(subsceneImageDir).filter(f => f.startsWith(`${sceneId}_${subsceneId}.`));
      subsceneFiles.forEach(f => {
        fs.unlinkSync(path.join(subsceneImageDir, f));
        console.log(`🗑️ Deleted subscene image: ${f}`);
      });
    }

    console.log(`✅ Subscene deleted: ${subsceneId} from scene: ${sceneId}`);
    return true;
  } catch (error) {
    console.error('Error deleting subscene:', error);
    throw error;
  }
}

// ============================================
// NPC SETTINGS FUNCTIONS (Zoom & Position)
// ============================================

export function updateSubsceneNpcSlots(fileId, sceneId, subsceneId, npcSlots) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    if (!scene.subscenes) {
      throw new Error(`No subscenes found in scene: ${sceneId}`);
    }

    const subsceneIndex = scene.subscenes.findIndex(ss => ss.id === subsceneId);

    if (subsceneIndex === -1) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${sceneId}`);
    }

    const subscene = scene.subscenes[subsceneIndex];

    // Validate npcSlots array
    if (!Array.isArray(npcSlots)) {
      throw new Error('npcSlots must be an array with exactly 3 slots');
    }

    // Validate each slot
    for (let i = 0; i < npcSlots.length; i++) {
      const slot = npcSlots[i];
      if (!slot.position || !Array.isArray(slot.position) || slot.position.length !== 2) {
        throw new Error(`Slot ${i} must have a position array with 2 numbers [x, y]`);
      }
      if (typeof slot.zoom !== 'number') {
        throw new Error(`Slot ${i} must have a numeric zoom value`);
      }
    }

    // Update the subscene with new npcs_slots
    subscene.npcs_slots = npcSlots;

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Updated NPC slots for subscene: ${subsceneId} in scene: ${sceneId}`);
    return {
      subscene,
      message: `Successfully updated NPC slots for subscene ${subsceneId}`
    };
  } catch (error) {
    console.error('Error updating subscene NPC slots:', error);
    throw error;
  }
}

// ============================================
// SCENE-SUBSCENE RELATIONSHIP FUNCTIONS
// ============================================

export function moveSubscene(fileId, subsceneId, fromSceneId, toSceneId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);

    // Find source scene
    const fromSceneIndex = sceneSetting.scenes.findIndex(s => s.id === fromSceneId);
    if (fromSceneIndex === -1) {
      throw new Error(`Source scene not found: ${fromSceneId}`);
    }

    // Find target scene
    const toSceneIndex = sceneSetting.scenes.findIndex(s => s.id === toSceneId);
    if (toSceneIndex === -1) {
      throw new Error(`Target scene not found: ${toSceneId}`);
    }

    const fromScene = sceneSetting.scenes[fromSceneIndex];
    const toScene = sceneSetting.scenes[toSceneIndex];

    // Find subscene in source scene
    if (!fromScene.subscenes || fromScene.subscenes.length === 0) {
      throw new Error(`No subscenes found in source scene: ${fromSceneId}`);
    }

    const subsceneIndex = fromScene.subscenes.findIndex(ss => ss.id === subsceneId);
    if (subsceneIndex === -1) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${fromSceneId}`);
    }

    // Remove subscene from source scene
    const [subscene] = fromScene.subscenes.splice(subsceneIndex, 1);

    // Initialize target scene subscenes array if needed
    if (!toScene.subscenes) {
      toScene.subscenes = [];
    }

    // Add subscene to target scene
    toScene.subscenes.push(subscene);

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Subscene moved: ${subsceneId} from ${fromSceneId} to ${toSceneId}`);
    return {
      subscene,
      fromSceneId,
      toSceneId,
      message: `Subscene ${subsceneId} successfully moved from ${fromSceneId} to ${toSceneId}`
    };
  } catch (error) {
    console.error('Error moving subscene:', error);
    throw error;
  }
}


export function updateScenePositions(fileId, positions) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);

    // Validate that we have position data for all scenes
    if (!positions || typeof positions !== 'object') {
      throw new Error('positions must be an object mapping sceneId to position arrays');
    }

    let updatedCount = 0;

    // Update positions for all provided scenes
    for (const sceneId in positions) {
      const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);
      if (sceneIndex !== -1) {
        const position = positions[sceneId];

        // Validate position format
        if (!Array.isArray(position) || position.length !== 2) {
          throw new Error(`Invalid position format for scene ${sceneId}. Expected [x, y] array.`);
        }

        sceneSetting.scenes[sceneIndex].position = position;
        updatedCount++;
      }
    }

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Updated positions for ${updatedCount} scenes`);
    return {
      updatedCount,
      scenes: sceneSetting.scenes,
      message: `Successfully updated ${updatedCount} scene positions`
    };
  } catch (error) {
    console.error('Error updating scene positions:', error);
    throw error;
  }
}


export function updateSubscenePositions(fileId, sceneId, positions) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    if (!scene.subscenes) {
      throw new Error(`No subscenes found in scene: ${sceneId}`);
    }

    // Validate that we have position data
    if (!positions || typeof positions !== 'object') {
      throw new Error('positions must be an object mapping subsceneId to position arrays');
    }

    let updatedCount = 0;

    // Update positions for all provided subscenes
    for (const subsceneId in positions) {
      const subsceneIndex = scene.subscenes.findIndex(ss => ss.id === subsceneId);
      if (subsceneIndex !== -1) {
        const position = positions[subsceneId];

        // Validate position format
        if (!Array.isArray(position) || position.length !== 2) {
          throw new Error(`Invalid position format for subscene ${subsceneId}. Expected [x, y] array.`);
        }

        scene.subscenes[subsceneIndex].position = position;
        updatedCount++;
      }
    }

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Updated positions for ${updatedCount} subscenes in scene: ${sceneId}`);
    return {
      sceneId,
      updatedCount,
      subscenes: scene.subscenes,
      message: `Successfully updated ${updatedCount} subscene positions in scene ${sceneId}`
    };
  } catch (error) {
    console.error('Error updating subscene positions:', error);
    throw error;
  }
}

// ============================================
// IMAGE UPLOAD FUNCTIONS
// ============================================

export async function uploadNPCImage(fileId, npcId, file, variant = 'base') {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    // Verify NPC exists
    const npcSetting = loadJSONFile(npcSettingPath);
    const npc = npcSetting.npcs.find(n => n.id === npcId);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Create NPC images directory if it doesn't exist
    const npcImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'npcs', npcId);
    if (!fs.existsSync(npcImageDir)) {
      fs.mkdirSync(npcImageDir, { recursive: true });
    }

    // Validate image format
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Read and resize the image to standard dimensions
    const imageBuffer = fs.readFileSync(file.path);
    const filename = `${variant}.png`; // Always save as PNG after resizing
    const imagePath = path.join(npcImageDir, filename);
    await resizeImageToStandard(imageBuffer, imagePath);

    // Update NPC with image path
    const apiImagePath = `/api/world-interaction/images/${fileId}/npcs/${npcId}/${filename}`;

    if (!npc.images) {
      npc.images = {};
    }
    npc.images[variant] = apiImagePath;

    // Save updated NPC setting
    saveJSONFile(npcSettingPath, npcSetting);

    console.log(`✅ NPC image uploaded: ${npcId} - ${variant}`);
    return {
      imagePath: apiImagePath,
      variant,
      npcId
    };
  } catch (error) {
    console.error('Error uploading NPC image:', error);
    throw error;
  }
}


export async function uploadSceneImage(fileId, sceneId, file) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    // Verify scene exists
    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    // Create scenes images directory if it doesn't exist
    const sceneImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'scenes');
    if (!fs.existsSync(sceneImageDir)) {
      fs.mkdirSync(sceneImageDir, { recursive: true });
    }

    // Validate image format
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Delete old scene image if it exists
    const existingFiles = fs.readdirSync(sceneImageDir).filter(f => f.startsWith(sceneId + '.'));
    existingFiles.forEach(f => fs.unlinkSync(path.join(sceneImageDir, f)));

    // Read and resize the image to standard dimensions
    const imageBuffer = fs.readFileSync(file.path);
    const filename = `${sceneId}.png`; // Always save as PNG after resizing
    const imagePath = path.join(sceneImageDir, filename);
    await resizeImageToStandard(imageBuffer, imagePath);

    // Update scene with image path
    const apiImagePath = `/api/world-interaction/images/${fileId}/scenes/${filename}`;
    scene.image = apiImagePath;

    // Save updated scene setting
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Scene image uploaded: ${sceneId}`);
    return {
      imagePath: apiImagePath,
      sceneId
    };
  } catch (error) {
    console.error('Error uploading scene image:', error);
    throw error;
  }
}


export async function uploadSubsceneImage(fileId, sceneId, subsceneId, file) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    // Verify scene and subscene exist
    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    if (!scene.subscenes) {
      throw new Error(`No subscenes found in scene: ${sceneId}`);
    }

    const subsceneIndex = scene.subscenes.findIndex(ss => ss.id === subsceneId);

    if (subsceneIndex === -1) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${sceneId}`);
    }

    const subscene = scene.subscenes[subsceneIndex];

    // Create subscenes images directory if it doesn't exist
    const subsceneImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'subscenes');
    if (!fs.existsSync(subsceneImageDir)) {
      fs.mkdirSync(subsceneImageDir, { recursive: true });
    }

    // Validate image format
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Delete old subscene image if it exists
    const existingFiles = fs.readdirSync(subsceneImageDir).filter(f => f.startsWith(`${sceneId}_${subsceneId}.`));
    existingFiles.forEach(f => fs.unlinkSync(path.join(subsceneImageDir, f)));

    // Read and resize the image to standard dimensions
    const imageBuffer = fs.readFileSync(file.path);
    const filename = `${sceneId}_${subsceneId}.png`; // Always save as PNG after resizing
    const imagePath = path.join(subsceneImageDir, filename);
    await resizeImageToStandard(imageBuffer, imagePath);

    // Update subscene with image path
    const apiImagePath = `/api/world-interaction/images/${fileId}/subscenes/${filename}`;
    subscene.image = apiImagePath;

    // Save updated scene setting
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Subscene image uploaded: ${subsceneId} in scene: ${sceneId}`);
    return {
      imagePath: apiImagePath,
      sceneId,
      subsceneId
    };
  } catch (error) {
    console.error('Error uploading subscene image:', error);
    throw error;
  }
}


export async function uploadPlayerImage(fileId, file, variant = 'base') {
  try {
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');

    // Load world setting
    const worldSetting = loadJSONFile(worldSettingPath);

    // Create player images directory if it doesn't exist
    const playerImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'players');
    if (!fs.existsSync(playerImageDir)) {
      fs.mkdirSync(playerImageDir, { recursive: true });
    }

    // Validate image format
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Read and resize the image to standard dimensions
    const imageBuffer = fs.readFileSync(file.path);
    const filename = `${variant}.png`; // Always save as PNG after resizing
    const imagePath = path.join(playerImageDir, filename);
    await resizeImageToStandard(imageBuffer, imagePath);

    // Update player with image path
    const apiImagePath = `/api/world-interaction/images/${fileId}/players/${filename}`;

    if (!worldSetting.player) {
      worldSetting.player = {};
    }
    if (!worldSetting.player.images) {
      worldSetting.player.images = {};
    }
    worldSetting.player.images[variant] = apiImagePath;

    // Save updated world setting
    saveJSONFile(worldSettingPath, worldSetting);

    console.log(`✅ Player image uploaded: ${variant}`);
    return {
      imagePath: apiImagePath,
      variant
    };
  } catch (error) {
    console.error('Error uploading player image:', error);
    throw error;
  }
}


export async function uploadWorldMapImage(fileId, file) {
  try {
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');

    // Load world setting
    const worldSetting = loadJSONFile(worldSettingPath);

    // Create world map images directory if it doesn't exist
    const worldMapImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId);
    if (!fs.existsSync(worldMapImageDir)) {
      fs.mkdirSync(worldMapImageDir, { recursive: true });
    }

    // Validate image format
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Delete old world map image if it exists
    const existingFiles = fs.readdirSync(worldMapImageDir).filter(f => f.startsWith('world_map.'));
    existingFiles.forEach(f => fs.unlinkSync(path.join(worldMapImageDir, f)));

    // Read and resize the image to standard dimensions
    const imageBuffer = fs.readFileSync(file.path);
    const filename = `world_map.png`; // Always save as PNG after resizing
    const imagePath = path.join(worldMapImageDir, filename);
    await resizeImageToStandard(imageBuffer, imagePath);

    // Update world setting with image path
    const apiImagePath = `/api/world-interaction/images/${fileId}/${filename}`;
    worldSetting.worldMapImage = apiImagePath;

    // Save updated world setting
    saveJSONFile(worldSettingPath, worldSetting);

    console.log(`✅ World map image uploaded`);
    return {
      imagePath: apiImagePath,
      message: 'World map image uploaded successfully'
    };
  } catch (error) {
    console.error('Error uploading world map image:', error);
    throw error;
  }
}


export function deleteNPCImage(fileId, npcId, variant) {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    // Load NPC setting
    const npcSetting = loadJSONFile(npcSettingPath);
    const npc = npcSetting.npcs.find(n => n.id === npcId);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Delete image file
    const npcImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'npcs', npcId);
    if (fs.existsSync(npcImageDir)) {
      const files = fs.readdirSync(npcImageDir).filter(f => f.startsWith(variant + '.'));
      files.forEach(f => fs.unlinkSync(path.join(npcImageDir, f)));
    }

    // Remove from NPC images object
    if (npc.images && npc.images[variant]) {
      delete npc.images[variant];
    }

    // Save updated NPC setting
    saveJSONFile(npcSettingPath, npcSetting);

    console.log(`✅ NPC image deleted: ${npcId} - ${variant}`);
    return true;
  } catch (error) {
    console.error('Error deleting NPC image:', error);
    throw error;
  }
}


export function deleteSceneImage(fileId, sceneId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    // Load scene setting
    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    // Delete image file
    const sceneImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'scenes');
    if (fs.existsSync(sceneImageDir)) {
      const files = fs.readdirSync(sceneImageDir).filter(f => f.startsWith(sceneId + '.'));
      files.forEach(f => fs.unlinkSync(path.join(sceneImageDir, f)));
    }

    // Remove from scene
    delete scene.image;

    // Save updated scene setting
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Scene image deleted: ${sceneId}`);
    return true;
  } catch (error) {
    console.error('Error deleting scene image:', error);
    throw error;
  }
}


export function deleteSubsceneImage(fileId, sceneId, subsceneId) {
  try {
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    // Load scene setting
    const sceneSetting = loadJSONFile(sceneSettingPath);
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneSetting.scenes[sceneIndex];

    if (!scene.subscenes) {
      throw new Error(`No subscenes found in scene: ${sceneId}`);
    }

    const subsceneIndex = scene.subscenes.findIndex(ss => ss.id === subsceneId);

    if (subsceneIndex === -1) {
      throw new Error(`Subscene not found: ${subsceneId} in scene: ${sceneId}`);
    }

    const subscene = scene.subscenes[subsceneIndex];

    // Delete image file
    const subsceneImageDir = path.join(WORLD_INTERACTION_IMAGES_DIR, fileId, 'subscenes');
    if (fs.existsSync(subsceneImageDir)) {
      const files = fs.readdirSync(subsceneImageDir).filter(f => f.startsWith(`${sceneId}_${subsceneId}.`));
      files.forEach(f => fs.unlinkSync(path.join(subsceneImageDir, f)));
    }

    // Remove from subscene
    delete subscene.image;

    // Save updated scene setting
    saveJSONFile(sceneSettingPath, sceneSetting);

    console.log(`✅ Subscene image deleted: ${subsceneId} in scene: ${sceneId}`);
    return true;
  } catch (error) {
    console.error('Error deleting subscene image:', error);
    throw error;
  }
}

