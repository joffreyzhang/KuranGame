import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { completeGameSessionByParams } from '../../login/controller/gamesController.js';
import { getFileIdBySessionId } from '../../login/service/gamesService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directories
export const WORLD_INTERACTION_DIR = path.join(__dirname, '..', '..', 'public', 'world_interaction');
export const TEMP_DIR = path.join(WORLD_INTERACTION_DIR, 'temp');
export const IMAGES_DIR = path.join(WORLD_INTERACTION_DIR, 'images');
export const SESSIONS_DIR = path.join(WORLD_INTERACTION_DIR, 'sessions');
export const VISUAL_SAVES_DIR = path.join(__dirname, '..', '..', 'visual_saves');

// Ensure directories exist
[TEMP_DIR, IMAGES_DIR, SESSIONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Load JSON file
 */
export function loadJSONFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Save JSON file
 */
export async function saveJSONFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
   // minio save
   try {
    // 根据sessionId => 对应的fileId
    const fileId = await getFileIdBySessionId(data.sessionId);
    if (fileId) {
      await completeGameSessionByParams(data.sessionId, 'public/world_interaction/sessions', fileId);
      console.log(`✅ Session data uploaded to MinIO-yuqq: ${data.sessionId}`);
    }
  } catch (uploadError) {
    console.error('[MinIO Upload] Failed to upload session data:', uploadError.message);
  }
}

/**
 * Get file directory for a given fileId
 */
export function getFileDirectory(fileId) {
  return path.join(TEMP_DIR, fileId);
}

/**
 * Load world interaction game files
 */
export function loadGameFiles(fileId, presetId = null) {
  let baseDir;
  console.log(presetId);
  if (presetId) {
    // Load from visual_saves directory (preset game settings)
    baseDir = path.join(VISUAL_SAVES_DIR, presetId);
    if (!fs.existsSync(baseDir)) {
      throw new Error(`PresetId not found: ${presetId}`);
    }
  } else if (fileId) {
    // Load from temp directory (user-uploaded content)
    baseDir = getFileDirectory(fileId);
    if (!fs.existsSync(baseDir)) {
      baseDir = path.join(VISUAL_SAVES_DIR, fileId);
    }
  } else {
    throw new Error('Either fileId or presetId must be provided');
  }

  const worldSettingPath = path.join(baseDir, 'worldSetting.json');
  const npcSettingPath = path.join(baseDir, 'npcSetting.json');
  const sceneSettingPath = path.join(baseDir, 'sceneSetting.json');

  if (!fs.existsSync(worldSettingPath) || !fs.existsSync(npcSettingPath) || !fs.existsSync(sceneSettingPath)) {
    throw new Error(`Missing required setting files in directory: ${baseDir}`);
  }

  return {
    worldSetting: loadJSONFile(worldSettingPath),
    npcSetting: loadJSONFile(npcSettingPath),
    sceneSetting: loadJSONFile(sceneSettingPath)
  };
}

/**
 * Get all subscenes from all scenes
 */
export function getAllSubscenes(sceneSetting) {
  const subscenes = [];

  sceneSetting.scenes.forEach(scene => {
    if (scene.subscenes && Array.isArray(scene.subscenes)) {
      scene.subscenes.forEach(subscene => {
        subscenes.push({
          ...subscene,
          parentSceneId: scene.id,
          parentSceneName: scene.name
        });
      });
    }
  });

  return subscenes;
}

/**
 * Get subscene by ID
 */
export function getSubsceneById(sceneSetting, subsceneId) {
  for (const scene of sceneSetting.scenes) {
    if (scene.subscenes && Array.isArray(scene.subscenes)) {
      const subscene = scene.subscenes.find(s => s.id === subsceneId);
      if (subscene) {
        return {
          ...subscene,
          parentSceneId: scene.id,
          parentSceneName: scene.name
        };
      }
    }
  }
  return null;
}

/**
 * Get scene by ID
 */
export function getSceneById(sceneSetting, sceneId) {
  return sceneSetting.scenes.find(s => s.id === sceneId) || null;
}

/**
 * Get NPC by ID
 */
export function getNPCById(npcSetting, npcId) {
  return npcSetting.npcs.find(n => n.id === npcId) || null;
}

/**
 * Get key event by index
 */
export function getKeyEventByIndex(worldSetting, index) {
  if (index >= 0 && index < worldSetting.keyEvents.length) {
    return worldSetting.keyEvents[index];
  }
  return null;
}

/**
 * Validate session data structure
 */
export function validateSessionData(session) {
  if (!session.sessionId) throw new Error('Session ID is required');
  if (!session.fileId && !session.presetId) throw new Error('Either File ID or Preset ID is required');
  if (!session.currentRound) throw new Error('Current round is required');
  if (!session.completedKeyEvents) session.completedKeyEvents = [];
  if (!session.activeEvents) session.activeEvents = [];
  if (!session.eventHistory) session.eventHistory = [];
}

/**
 * Sanitize JSON string by replacing problematic characters
 * Only replaces Chinese/smart quotes, preserves ASCII quotes for JSON structure
 */
function sanitizeJSON(jsonString) {
  let sanitized = jsonString
    // Replace Chinese quotation marks with empty string or neutral character
    // They appear inside JSON string values, so we can safely remove/replace them
    .replace(/"/g, '')  // Remove Chinese left quote
    .replace(/"/g, '')  // Remove Chinese right quote
    // Replace smart quotes
    .replace(/'/g, '')
    .replace(/'/g, '')
    // Replace full-width colon with half-width colon
    .replace(/:/g, ':')
    // Replace full-width comma with half-width comma
    .replace(/,/g, ',');

  return sanitized;
}

/**
 * Try to parse JSON with error recovery
 */
function tryParseJSON(jsonString) {
  // First try direct parse
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    // Try with sanitization
    try {
      const sanitized = sanitizeJSON(jsonString);
      return JSON.parse(sanitized);
    } catch (e2) {
      throw e; // Throw original error
    }
  }
}

/**
 * Parse JSON from Claude response (handles code blocks)
 */
export function parseJSONFromResponse(responseText) {
  let lastError = null;

  // Try direct parse first
  try {
    return tryParseJSON(responseText);
  } catch (e) {
    lastError = e;
    console.log('⚠️ Direct JSON parse failed:', e.message);
  }

  // Try multiple patterns for code blocks
  const codeBlockPatterns = [
    /```json\s*([\s\S]*?)\s*```/,  // ```json ... ```
    /```\s*([\s\S]*?)\s*```/,       // ``` ... ```
    /```json\n([\s\S]*?)\n```/,     // ```json\n...\n```
    /```\n([\s\S]*?)\n```/          // ```\n...\n```
  ];

  for (const pattern of codeBlockPatterns) {
    const match = responseText.match(pattern);
    if (match && match[1]) {
      try {
        const parsed = tryParseJSON(match[1].trim());
        console.log('✅ Successfully parsed JSON from code block');
        return parsed;
      } catch (e) {
        lastError = e;
        console.log('⚠️ Code block JSON parse failed with pattern:', pattern.toString());
      }
    }
  }

  // Try to find JSON object in text (last resort)
  const jsonObjMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) {
    try {
      const parsed = tryParseJSON(jsonObjMatch[0]);
      console.log('✅ Successfully parsed JSON from extracted object');
      return parsed;
    } catch (e) {
      lastError = e;
      console.log('⚠️ Extracted JSON parse failed:', e.message);
      console.log('Extracted JSON preview (before sanitization):', jsonObjMatch[0].substring(0, 300));
      // Show sanitized version for debugging
      const sanitized = sanitizeJSON(jsonObjMatch[0]);
      console.log('Sanitized JSON preview:', sanitized.substring(0, 300));
    }
  }

  throw new Error(`No valid JSON found in response. Last error: ${lastError?.message || 'Unknown'}`);
}
