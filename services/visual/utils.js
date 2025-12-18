import dotenv from 'dotenv';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directories
const VISUAL_GAME_DATA_DIR = path.join(__dirname, '..', '..', 'public', 'visual_game');
const VISUAL_TEMP_DIR = path.join(VISUAL_GAME_DATA_DIR, 'temp');
const VISUAL_SESSION_SAVES_DIR = path.join(VISUAL_GAME_DATA_DIR, 'sessions');
const VISUAL_PRESET_DIR = path.join(__dirname, '..', '..', 'visual_saves');

/**
 * Parse JSON from Claude's response text
 * Handles various formats: code blocks, plain JSON, etc.
 */
export function parseJSONFromResponse(responseText) {
  let jsonText = responseText.trim();

  // Try to extract JSON from markdown code blocks
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                    responseText.match(/```\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  // Try to extract JSON object if not already
  if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
    const objectMatch = jsonText.match(/(\{[\s\S]*\})/);
    if (objectMatch) {
      jsonText = objectMatch[1];
    }
  }

  try {
    // First attempt: direct parse
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn('⚠️ First JSON parse attempt failed, trying sanitization...');

    try {
      // Second attempt: sanitize common issues
      let sanitized = jsonText
        // Remove any text before first { or [
        .replace(/^[^{[]*/, '')
        // Remove any text after last } or ]
        .replace(/[^}\]]*$/, '')
        // Remove trailing commas before } or ]
        .replace(/,(\s*[}\]])/g, '$1')
        // Remove comments (// and /* */)
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      return JSON.parse(sanitized);
    } catch (secondError) {
      console.warn('⚠️ Second parse failed, trying aggressive cleanup...');

      try {
        // Third attempt: Fix truncated/malformed JSON
        let aggressiveSanitized = jsonText
          .replace(/^[^{[]*/, '')
          .replace(/[^}\]]*$/, '');

        // Find the last complete JSON object by searching for the last properly closed brace
        const lastCloseBrace = aggressiveSanitized.lastIndexOf('}');
        if (lastCloseBrace !== -1) {
          // Try to extract up to the last closing brace
          let truncatedToLastBrace = aggressiveSanitized.substring(0, lastCloseBrace + 1);

          // Count opening and closing braces to find balanced JSON
          let openCount = (truncatedToLastBrace.match(/\{/g) || []).length;
          let closeCount = (truncatedToLastBrace.match(/\}/g) || []).length;

          // If unbalanced, try to find the largest balanced substring
          if (openCount !== closeCount) {
            let depth = 0;
            let lastValidPos = -1;

            for (let i = 0; i < aggressiveSanitized.length; i++) {
              if (aggressiveSanitized[i] === '{') depth++;
              else if (aggressiveSanitized[i] === '}') {
                depth--;
                if (depth === 0) {
                  lastValidPos = i;
                }
              }
            }

            if (lastValidPos !== -1) {
              aggressiveSanitized = aggressiveSanitized.substring(0, lastValidPos + 1);
            }
          } else {
            aggressiveSanitized = truncatedToLastBrace;
          }
        }

        // Clean up common issues
        aggressiveSanitized = aggressiveSanitized
          .replace(/,(\s*[}\]])/g, '$1')
          // Fix unquoted property names
          .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
          // Fix single quotes to double quotes (but be careful with strings)
          .replace(/'/g, '"')
          // Remove any incomplete trailing values (e.g., "key": "value without closing quote)
          .replace(/:\s*"[^"]*$/, ': ""')
          // Fix duplicate consecutive commas
          .replace(/,+/g, ',');

        return JSON.parse(aggressiveSanitized);
      } catch (thirdError) {
        console.error('❌ Failed to parse JSON after all attempts');
        console.error('Original error:', error.message);
        console.error('Second error:', secondError.message);
        console.error('Third error:', thirdError.message);
        console.error('Response preview:', responseText.substring(0, 500));

        // Try to show the problematic area
        const position = parseInt(error.message.match(/position (\d+)/)?.[1] || '0');
        if (position > 0) {
          const start = Math.max(0, position - 100);
          const end = Math.min(jsonText.length, position + 100);
          console.error('Context:', jsonText.substring(start, end));
        }

        throw new Error(`Could not parse JSON from response: ${error.message}`);
      }
    }
  }
}

/**
 * Validate world setting has required fields
 */
export function validateWorldSetting(worldSetting) {
  const required = ['title', 'background', 'preamble', 'initialPlot', 'literary'];

  for (const field of required) {
    if (!worldSetting[field]) {
      throw new Error(`Missing required field in worldSetting: ${field}`);
    }
  }

  if (!worldSetting.player) {
    throw new Error('Missing Player in worldSetting');
  }

  const requiredPlayerFields = ['name', 'gender', 'appearance'];
  for (const field of requiredPlayerFields) {
    if (!worldSetting.player[field]) {
      throw new Error(`Missing required Player field: ${field}`);
    }
  }

  return true;
}

/**
 * Validate NPC setting has required fields
 */
export function validateNPCSetting(npcSetting) {
  if (!npcSetting.npcs || !Array.isArray(npcSetting.npcs)) {
    throw new Error('npcSetting must have npcs array');
  }

  const required = ['id', 'name', 'gender', 'description', 'appearance', 'tone'];

  npcSetting.npcs.forEach((npc, index) => {
    for (const field of required) {
      if (!npc[field]) {
        throw new Error(`NPC at index ${index} missing required field: ${field}`);
      }
    }
  });

  return true;
}

/**
 * Validate scene setting has required fields
 */
export function validateSceneSetting(sceneSetting) {
  if (!sceneSetting.scenes || !Array.isArray(sceneSetting.scenes)) {
    throw new Error('sceneSetting must have scenes array');
  }

  const required = ['id', 'name', 'description'];

  sceneSetting.scenes.forEach((scene, index) => {
    for (const field of required) {
      if (!scene[field]) {
        throw new Error(`Scene at index ${index} missing required field: ${field}`);
      }
    }
  });

  return true;
}


export function transformImagePaths(images, type, id, presetId) {
  if (!images) return {};

  const transformed = {};
  for (const [key, value] of Object.entries(images)) {
    // Transform paths to use preset API endpoint
    if (typeof value === 'string' && value.includes('/api/')) {
      // Extract the filename from the original path
      const filename = `${key}.png`;
      transformed[key] = `/api/visual/presets/${presetId}/images/${type}/${id}/${filename}`;
    } else {
      transformed[key] = value;
    }
  }
  return transformed;
}

export function loadVisualGameSettings(fileId = null, presetId = null) {
  try {
    let baseDir;

    if (fileId) {
      // Load from temp directory (user-uploaded content)
      baseDir = path.join(VISUAL_TEMP_DIR, fileId);
      if (!fsSync.existsSync(baseDir)) {
        throw new Error(`FileId not found: ${fileId}`);
      }
    } else if (presetId) {
      // Load from specific preset subdirectory in visual_saves
      baseDir = path.join(VISUAL_PRESET_DIR, presetId);
      if (!fsSync.existsSync(baseDir)) {
        throw new Error(`PresetId not found: ${presetId}`);
      }
    } else {
      // Load from preset directory root (default/first preset)
      baseDir = VISUAL_PRESET_DIR;
    }

    const worldSettingPath = path.join(baseDir, 'worldSetting.json');
    const npcSettingPath = path.join(baseDir, 'npcSetting.json');
    const sceneSettingPath = path.join(baseDir, 'sceneSetting.json');

    if (!fsSync.existsSync(worldSettingPath) || !fsSync.existsSync(npcSettingPath) || !fsSync.existsSync(sceneSettingPath)) {
      throw new Error('Missing required JSON files');
    }

    const worldSetting = JSON.parse(fsSync.readFileSync(worldSettingPath, 'utf-8'));
    const npcSetting = JSON.parse(fsSync.readFileSync(npcSettingPath, 'utf-8'));
    const sceneSetting = JSON.parse(fsSync.readFileSync(sceneSettingPath, 'utf-8'));

    return { worldSetting, npcSetting, sceneSetting };
  } catch (error) {
    console.error('Error loading visual game settings:', error);
    throw error;
  }
}