import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { validateWorldSetting, validateNPCSetting, validateSceneSetting } from './utils.js';
import { completeGameByParams } from '../../login/controller/gamesController.js'
import { downloadInitFilesAndReturnFiles } from '../../login/controller/visualController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directories
const VISUAL_TEMP_DIR = path.join(__dirname, '..', '..', 'public', 'visual_game', 'temp');
const VISUAL_PRESET_DIR = path.join(__dirname, '..', '..', 'visual_saves');
const VISUAL_IMAGES_DIR = path.join(__dirname, '..', '..', 'public', 'visual_game', 'images');


function getFileDirectory(fileId) {
  return path.join(VISUAL_TEMP_DIR, fileId);
}

function loadJSONFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function saveJSONFile(fileId, filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  //minio upload can be added here if needed
  try {
    console.log("====================save:presetId:", fileId);
    await completeGameByParams(filePath, fileId);
    console.log(`✅ InitJsonData data uploaded to MinIO: ${fileId}`);
  } catch (uploadError) {
    console.error('[MinIO Upload] Failed to upload InitJsonData data:', uploadError.message);
  }
}


export async function updateWorldSetting(fileId, updates) {
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
    await saveJSONFile(fileId, worldSettingPath, updatedWorldSetting);

    console.log(`✅ World setting updated for fileId: ${fileId}`);
    return updatedWorldSetting;
  } catch (error) {
    console.error('Error updating world setting:', error);
    throw error;
  }
}


export async function updatePlayer(fileId, playerUpdates) {
  try {
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');

    const worldSetting = loadJSONFile(worldSettingPath);
    worldSetting.player = { ...worldSetting.player, ...playerUpdates };

    // Validate
    validateWorldSetting(worldSetting);

    // Save
    await saveJSONFile(fileId, worldSettingPath, worldSetting);

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


export async function addNPC(fileId, npcData) {
  try {
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    const npcSetting = loadJSONFile(npcSettingPath);

    // Check if NPC ID already exists
    if (npcSetting.npcs.some(n => n.id === npcData.id)) {
      throw new Error(`NPC with ID '${npcData.id}' already exists`);
    }

    // Validate required fields
    const requiredFields = ['id', 'name', 'gender', 'description', 'appearance', 'tone'];
    for (const field of requiredFields) {
      if (!npcData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    npcSetting.npcs.push(npcData);

    // Validate
    validateNPCSetting(npcSetting);

    // Save
    await saveJSONFile(fileId, npcSettingPath, npcSetting);

    console.log(`✅ NPC added: ${npcData.id}`);
    return npcData;
  } catch (error) {
    console.error('Error adding NPC:', error);
    throw error;
  }
}

export async function updateNPC(fileId, npcId, updates) {
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
    await saveJSONFile(fileId, npcSettingPath, npcSetting);

    console.log(`✅ NPC updated: ${npcId}`);
    return npcSetting.npcs[npcIndex];
  } catch (error) {
    console.error('Error updating NPC:', error);
    throw error;
  }
}


export async function deleteNPC(fileId, npcId) {
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
    await saveJSONFile(fileId, npcSettingPath, npcSetting);

    // Also delete NPC images if they exist
    const npcImageDir = path.join(fileDir, 'images', 'npcs', npcId);
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


export async function addScene(fileId, sceneData) {
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

    sceneSetting.scenes.push(sceneData);

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    await saveJSONFile(fileId, sceneSettingPath, sceneSetting);

    console.log(`✅ Scene added: ${sceneData.id}`);
    return sceneData;
  } catch (error) {
    console.error('Error adding scene:', error);
    throw error;
  }
}

export async function updateScene(fileId, sceneId, updates) {
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

    // Apply updates
    sceneSetting.scenes[sceneIndex] = { ...sceneSetting.scenes[sceneIndex], ...updates };

    // Validate
    validateSceneSetting(sceneSetting);

    // Save
    await saveJSONFile(fileId, sceneSettingPath, sceneSetting);

    console.log(`✅ Scene updated: ${sceneId}`);
    return sceneSetting.scenes[sceneIndex];
  } catch (error) {
    console.error('Error updating scene:', error);
    throw error;
  }
}

export async function deleteScene(fileId, sceneId) {
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
    await saveJSONFile(fileId, sceneSettingPath, sceneSetting);

    // Also delete scene image if it exists
    const sceneImagePath = path.join(fileDir, 'images', 'scenes', `${sceneId}.png`);
    if (fs.existsSync(sceneImagePath)) {
      fs.unlinkSync(sceneImagePath);
      console.log(`🗑️ Deleted scene image: ${sceneId}`);
    }

    console.log(`✅ Scene deleted: ${sceneId}`);
    return true;
  } catch (error) {
    console.error('Error deleting scene:', error);
    throw error;
  }
}


export async function uploadNPCImage(fileId, npcId, file, variant = 'base') {
  try {
    if (variant === 'undefined' || variant === '') {
      variant = 'base';
    }
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');

    // Verify NPC exists
    const npcSetting = loadJSONFile(npcSettingPath);
    const npc = npcSetting.npcs.find(n => n.id === npcId);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Create NPC images directory if it doesn't exist
    const npcImageDir = path.join(VISUAL_IMAGES_DIR, fileId, 'npcs', npcId);
    if (!fs.existsSync(npcImageDir)) {
      fs.mkdirSync(npcImageDir, { recursive: true });
    }

    // Determine file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Save the image
    const filename = `${variant}${ext}`;
    const imagePath = path.join(npcImageDir, filename);
    fs.copyFileSync(file.path, imagePath);

    // Upload image to MinIO
    try {
      await completeGameByParams(imagePath, fileId);
      console.log(`✅ NPC image uploaded to MinIO: ${imagePath}`);
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload NPC image:', uploadError.message);
      // Don't throw - allow the operation to continue even if MinIO upload fails
    }

    // Update NPC with image path
    const apiImagePath = `/api/visual/images/${fileId}/npcs/${npcId}/${filename}`;

    if (!npc.images || typeof npc.images !== 'object' || Array.isArray(npc.images)) {
      npc.images = {};
    }
    npc.images[variant] = apiImagePath;

    // Save updated NPC setting
    await saveJSONFile(fileId, npcSettingPath, npcSetting);

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
    const scene = sceneSetting.scenes.find(s => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    // Create scenes images directory if it doesn't exist
    const sceneImageDir = path.join(VISUAL_IMAGES_DIR, fileId, 'scenes');
    if (!fs.existsSync(sceneImageDir)) {
      fs.mkdirSync(sceneImageDir, { recursive: true });
    }

    // Determine file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Delete old scene image if it exists
    const existingFiles = fs.readdirSync(sceneImageDir).filter(f => f.startsWith(sceneId + '.'));
    existingFiles.forEach(f => fs.unlinkSync(path.join(sceneImageDir, f)));

    // Save the image
    const filename = `${sceneId}${ext}`;
    const imagePath = path.join(sceneImageDir, filename);
    fs.copyFileSync(file.path, imagePath);

    // Upload image to MinIO
    try {
      await completeGameByParams(imagePath, fileId);
      console.log(`✅ Scene image uploaded to MinIO: ${imagePath}`);
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload scene image:', uploadError.message);
      // Don't throw - allow the operation to continue even if MinIO upload fails
    }

    // Update scene with image path
    const apiImagePath = `/api/visual/images/${fileId}/scenes/${filename}`;
    scene.image = apiImagePath;

    // Save updated scene setting
    await saveJSONFile(fileId, sceneSettingPath, sceneSetting);

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

export async function uploadPlayerImage(fileId, file, variant = 'base') {
  try {
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');

    // Load world setting
    const worldSetting = loadJSONFile(worldSettingPath);

    // Create player images directory if it doesn't exist
    const playerImageDir = path.join(VISUAL_IMAGES_DIR, fileId, 'players');
    if (!fs.existsSync(playerImageDir)) {
      fs.mkdirSync(playerImageDir, { recursive: true });
    }

    // Determine file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP are allowed.');
    }

    // Save the image
    const filename = `base${ext}`;
    const imagePath = path.join(playerImageDir, filename);
    fs.copyFileSync(file.path, imagePath);

    // Upload image to MinIO
    try {
      await completeGameByParams(imagePath, fileId);
      console.log(`✅ Player image uploaded to MinIO: ${imagePath}`);
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload player image:', uploadError.message);
      // Don't throw - allow the operation to continue even if MinIO upload fails
    }

    // Update player with image path
    const apiImagePath = `/api/visual/images/${fileId}/players/${filename}`;

    if (!worldSetting.player) {
      worldSetting.player = {};
    }
    if (!worldSetting.player.images || typeof worldSetting.player.images !== 'object' || Array.isArray(worldSetting.player.images)) {
      worldSetting.player.images = {};
    }
    worldSetting.player.images['base'] = apiImagePath;

    // Save updated world setting
    await saveJSONFile(fileId, worldSettingPath, worldSetting);

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

export async function deleteNPCImage(fileId, npcId, variant) {
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
    const npcImageDir = path.join(fileDir, 'images', 'npcs', npcId);
    if (fs.existsSync(npcImageDir)) {
      const files = fs.readdirSync(npcImageDir).filter(f => f.startsWith(variant + '.'));
      files.forEach(f => fs.unlinkSync(path.join(npcImageDir, f)));
    }

    // Remove from NPC images object
    if (npc.images && npc.images[variant]) {
      delete npc.images[variant];
    }

    // Save updated NPC setting
    await saveJSONFile(fileId, npcSettingPath, npcSetting);

    console.log(`✅ NPC image deleted: ${npcId} - ${variant}`);
    return true;
  } catch (error) {
    console.error('Error deleting NPC image:', error);
    throw error;
  }
}

// ============================================
// COMPLETE DATA
// ============================================

export async function getCompleteGameData(fileId) {
  try {
    let fileDir = getFileDirectory(fileId);


    if (!fs.existsSync(fileDir)) {
      console.log("============================fileDir not found, using presetDir:", fileId);
      fileDir = path.join(VISUAL_PRESET_DIR, fileId);
      if (!fs.existsSync(fileDir)) {
        console.log("============================下载初始化文件");
        await downloadInitFilesAndReturnFiles(fileId, 'visual_saves');
        await new Promise(resolve => setTimeout(resolve, 5000));
        // copy folder recursive
        copyFolderRecursive(fileDir, path.join(VISUAL_IMAGES_DIR, fileId));
        copyFilesOnly(fileDir, path.join(VISUAL_TEMP_DIR, fileId));
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log("============================copied folder to temporary directory");
      }
    }

    const worldSetting = loadJSONFile(path.join(fileDir, 'worldSetting.json'));
    const npcSetting = loadJSONFile(path.join(fileDir, 'npcSetting.json'));
    const sceneSetting = loadJSONFile(path.join(fileDir, 'sceneSetting.json'));

    let metadata = null;
    const metadataPath = path.join(fileDir, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      metadata = loadJSONFile(metadataPath);
    }

    return {
      worldSetting,
      npcSetting,
      sceneSetting,
      metadata
    };
  } catch (error) {
    console.error('Error getting complete game data:', error);
    throw error;
  }
}

// 复制文件夹辅助函数（只复制文件夹结构，不复制文件）
function copyFolderRecursive(source, target) {
  // 检查源文件夹是否存在
  if (!fs.existsSync(source)) {
    console.log(`Source folder does not exist: ${source}`);
    return;
  }

  // 创建目标文件夹
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    console.log(`Created folder: ${target}`);
  }

  // 获取源文件夹中的所有项目
  const items = fs.readdirSync(source, { withFileTypes: true });

  console.log(`Found ${items.length} items in ${source}`);

  for (const item of items) {
    const sourcePath = path.join(source, item.name);
    const targetPath = path.join(target, item.name);

    if (item.isDirectory()) {
      // 如果是文件夹，递归复制整个文件夹
      console.log(`Copying folder recursively: ${item.name}`);
      copyFolderRecursive(sourcePath, targetPath);
    } else if (item.isFile()) {
      // 如果是文件，直接复制
      console.log(`Copying file: ${item.name}`);
      fs.copyFileSync(sourcePath, targetPath);
    }
    // 注意：如果是符号链接或其他类型，这里不处理
  }
}

// 只复制文件夹中的文件，不复制子文件夹
function copyFilesOnly(source, target) {
  // 检查源文件夹是否存在
  if (!fs.existsSync(source)) {
    console.log(`Source folder does not exist: ${source}`);
    return;
  }

  // 确保目标文件夹存在
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    console.log(`Created target folder: ${target}`);
  }

  // 获取源文件夹中的所有项目
  const items = fs.readdirSync(source, { withFileTypes: true });

  // 只过滤出文件（排除文件夹）
  const files = items.filter(item => item.isFile());

  console.log(`Found ${files.length} files in ${source}`);

  // 复制每个文件
  for (const file of files) {
    const fileName = file.name;
    const sourcePath = path.join(source, fileName);
    const targetPath = path.join(target, fileName);

    try {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`Copied file: ${fileName}`);
    } catch (error) {
      console.error(`Failed to copy file ${fileName}:`, error.message);
    }
  }
}