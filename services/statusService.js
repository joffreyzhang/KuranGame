import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Claude client for attribute parsing
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

// Configuration: Enable/disable LLM-based attribute parsing
// Set to false to use regex-only parsing (faster, cheaper, but less accurate)
const ENABLE_LLM_PARSING = process.env.ENABLE_LLM_PARSING !== 'false';

// Directory for storing game saves
const SAVES_DIR = path.join(__dirname, '..', 'game_saves');

// Ensure saves directory exists
if (!fs.existsSync(SAVES_DIR)) {
  fs.mkdirSync(SAVES_DIR, { recursive: true });
}

// Utility: sanitize strings for filenames (Windows-safe)
function sanitizeFilename(name) {
  if (!name) return 'player';
  return name
    .toString()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_') // illegal chars
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, 50) // limit length
    .replace(/[.]+$/g, ''); // no trailing dots
}

// Utility: read session metadata directly from meta file
function getSessionMetadata(sessionId) {
  try {
    const metaPath = path.join(SAVES_DIR, `${sessionId}_meta.json`);
    if (fs.existsSync(metaPath)) {
      const data = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    // ignore and fall back
  }
  return null;
}

// Build a pretty, deterministic status filename using metadata
function buildPrettyStatusFilename(sessionId) {
  const meta = getSessionMetadata(sessionId);
  if (!meta) return `${sessionId}.json`;

  const createdAt = meta.createdAt || new Date().toISOString();
  const d = new Date(createdAt);
  const pad = (n) => `${n}`.padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  const player = sanitizeFilename(meta.playerName || 'Player');
  const fileIdShort = (meta.fileId || '').toString().slice(0, 8) || 'file';
  const sessionShort = sessionId.slice(0, 8);

  return `${stamp}__${player}__${fileIdShort}__${sessionShort}.json`;
}

/**
 * Default character status structure
 * Note: attributes will be dynamically extracted from PDF
 */
const DEFAULT_STATUS = {
  character: {
    name: 'Player',
    level: 1,
    health: 100,
    maxHealth: 100,
    energy: 100,
    maxEnergy: 100,
    experience: 0,
    money: 0
  },
  attributes: {}, // Dynamic attributes from PDF
  inventory: [],
  location: 'start',
  flags: {}, // Game state flags (e.g., questCompleted, metCharacter)
  relationships: {}, // Character relationships
  achievements: []
};

/**
 * Get the file path for a session's status
 */
function getStatusFilePath(sessionId) {
  // Prefer pretty filename based on metadata
  const pretty = buildPrettyStatusFilename(sessionId);
  return path.join(SAVES_DIR, pretty);
}

/**
 * Initialize status for a new session
 * @param {string} sessionId - Unique session identifier
 * @param {object} pdfAttributes - Attributes extracted from PDF
 */
export function initializeStatus(sessionId, pdfAttributes = {}) {
  const status = {
    ...JSON.parse(JSON.stringify(DEFAULT_STATUS)),
    sessionId,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    // Merge PDF attributes into the attributes object
    attributes: { ...pdfAttributes }
  };

  saveStatus(sessionId, status);
  return status;
}

/**
 * Load status from file
 */
export function loadStatus(sessionId) {
  const prettyPath = getStatusFilePath(sessionId);
  const legacyPath = path.join(SAVES_DIR, `${sessionId}.json`);

  try {
    if (fs.existsSync(prettyPath)) {
      const data = fs.readFileSync(prettyPath, 'utf-8');
      return JSON.parse(data);
    }
    if (fs.existsSync(legacyPath)) {
      const data = fs.readFileSync(legacyPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading status for session ${sessionId}:`, error);
  }
  return null;
}

/**
 * Save status to file
 */
export function saveStatus(sessionId, status) {
  const filePath = getStatusFilePath(sessionId);
  
  try {
    const dataToSave = {
      ...status,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error saving status for session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Update specific status fields
 */
export function updateStatus(sessionId, updates) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  // Deep merge updates
  const updatedStatus = deepMerge(status, updates);
  saveStatus(sessionId, updatedStatus);
  
  return updatedStatus;
}

/**
 * Update character attributes
 */
export function updateCharacter(sessionId, characterUpdates) {
  return updateStatus(sessionId, { character: characterUpdates });
}

/**
 * Update attributes (strength, intelligence, etc.)
 */
export function updateAttributes(sessionId, attributeUpdates) {
  return updateStatus(sessionId, { attributes: attributeUpdates });
}

/**
 * Add item to inventory
 */
export function addToInventory(sessionId, item) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  const itemWithId = {
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: item.name || item,
    description: item.description || '',
    quantity: item.quantity || 1,
    addedAt: new Date().toISOString(),
    ...item
  };

  status.inventory.push(itemWithId);
  saveStatus(sessionId, status);
  
  return status;
}

/**
 * Remove item from inventory
 */
export function removeFromInventory(sessionId, itemId) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  status.inventory = status.inventory.filter(item => item.id !== itemId);
  saveStatus(sessionId, status);
  
  return status;
}

/**
 * Use item from inventory
 */
export function useItem(sessionId, itemIdOrName) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  // Find item by ID or name
  const itemIndex = status.inventory.findIndex(item => 
    item.id === itemIdOrName || item.name === itemIdOrName
  );
  
  if (itemIndex === -1) {
    throw new Error('Item not found in inventory');
  }
  
  const item = status.inventory[itemIndex];
  
  // Decrease quantity or remove item
  if (item.quantity && item.quantity > 1) {
    item.quantity -= 1;
  } else {
    status.inventory.splice(itemIndex, 1);
  }
  
  saveStatus(sessionId, status);
  
  return {
    status,
    usedItem: item
  };
}

/**
 * Update location
 */
export function updateLocation(sessionId, location) {
  return updateStatus(sessionId, { location });
}

/**
 * Set a game flag
 */
export function setFlag(sessionId, flagName, value) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  status.flags[flagName] = value;
  saveStatus(sessionId, status);
  
  return status;
}

/**
 * Update relationship with a character
 */
export function updateRelationship(sessionId, characterName, value) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  status.relationships[characterName] = value;
  saveStatus(sessionId, status);
  
  return status;
}

/**
 * Add achievement
 */
export function addAchievement(sessionId, achievement) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    throw new Error('Status not found for session');
  }

  const achievementWithId = {
    id: `achievement_${Date.now()}`,
    name: achievement.name || achievement,
    description: achievement.description || '',
    unlockedAt: new Date().toISOString(),
    ...achievement
  };

  status.achievements.push(achievementWithId);
  saveStatus(sessionId, status);
  
  return status;
}

/**
 * Use LLM to parse game response and identify changes from current state
 * This identifies what changed in the response compared to current attributes
 */
export async function parseGameResponseChanges(responseText, currentStatus = {}) {
  console.log('\n=== 🔍 parseGameResponseChanges CALLED ===');
  console.log('Current status summary:', {
    attributes: Object.keys(currentStatus.attributes || {}).length,
    inventory: (currentStatus.inventory || []).length,
    character: currentStatus.character || {}
  });
  console.log('Response text length:', responseText.length);
  // console.log('Response preview:', responseText.substring(0, 500));

  // Extract just attributes for comparison
  const currentAttributes = currentStatus.attributes || {};
  const currentInventory = currentStatus.inventory || [];
  const currentCharacter = currentStatus.character || {};

  try {
    const prompt = `You are a game state analyzer. Analyze the game response and extract ALL attribute changes, item changes, and character stat changes.

CURRENT STATE:
Attributes: ${JSON.stringify(currentAttributes, null, 2)}
Inventory: ${currentInventory.map(i => i.name || i).join(', ')}
Character: ${JSON.stringify(currentCharacter, null, 2)}

NEW GAME RESPONSE:
${responseText}

EXTRACTION RULES:
1. **Attributes** - Extract ANY numeric attributes mentioned:
   - "力量：50" → {"力量": 50}
   - "力量+2" or "获得经验：力量+2" → DELTA {"力量": +2}
   - "力量:52(+2)" → ABSOLUTE {"力量": 52}
   - Look for patterns: 属性名[：:]\s*数值, 属性名\+数值, 属性名:\s*\d+/\d+

2. **Items** - Extract inventory changes:
   - "获得了X" → ADD {"name": "X", "quantity": 1}
   - "失去了X" → REMOVE {"name": "X"}
   - Look for patterns: 获得, 得到, 拿到, 失去, 使用, 消耗

3. **Character Stats** - Extract health, energy, money, level changes:
   - "生命值：85" or "health: 85" → {"health": 85}
   - "金钱+100" → DELTA {"money": +100}

Return ONLY valid JSON in this EXACT format:
{
  "character": {
    "health": 85,
    "money": 150
  },
  "new_attributes": {
    "新属性": 初始值
  },
  "changed_attributes": {
    "已存在属性": 新绝对值
  },
  "delta_attributes": {
    "属性名": 增量值
  },
  "new_items": [
    {"name": "物品名", "description": "描述", "quantity": 1, "value": 0}
  ],
  "removed_items": [
    {"name": "物品名"}
  ],
  "new_relationships": {
    "character_name": value
  }
}

IMPORTANT:
- Include ALL attributes found in the response, even if they seem similar to existing ones
- For deltas: use positive or negative numbers (+2, -3)
- If no changes detected in a category, omit that field or return empty object/array
- Return ONLY JSON, no explanation, no markdown`;

    console.log('🤖 Calling LLM for change detection...');
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseContent = message.content[0].text.trim();
    // console.log('✅ LLM response:', responseContent);

    // Try to extract JSON from response (handle markdown code blocks)
    let jsonText = responseContent;
    const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseContent.match(/```\s*([\s\S]*?)\s*```/) ||
                      responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0].replace(/```json|```/g, '').trim();
    }

    // Parse the JSON response
    const parsedData = JSON.parse(jsonText);
    console.log('✅ Parsed changes:', JSON.stringify(parsedData, null, 2));

    return parsedData;
  } catch (error) {
    console.error('❌ Error parsing attributes with LLM:', error);
    console.error('Error details:', error.message);
    // Fallback to regex-based parsing
    const fallbackResult = {
      attributes: parseAttributesFromResponseRegex(responseText),
      character: {},
      new_attributes: {},
      changed_attributes: parseAttributesFromResponseRegex(responseText),
      delta_attributes: {},
      new_items: [],
      removed_items: []
    };
    console.log('📋 Using regex fallback:', JSON.stringify(fallbackResult, null, 2));
    return fallbackResult;
  }
}

/**
 * Parse attributes from Claude's response using regex (fallback method)
 * Extracts attributes from the character panel in Claude's response
 */
export function parseAttributesFromResponseRegex(responseText) {
  const attributes = {};
  
  try {
    // Look for 核心属性成长 section
    const attrPattern = /"核心属性成长":\s*{([^}]+)}/gs;
    const match = responseText.match(attrPattern);
    
    if (match && match[0]) {
      // Extract each attribute line
      const lines = match[0].split('\n');
      
      for (const line of lines) {
        // Match patterns like: "家族礼仪": "熟练 (38/100)"
        const attrMatch = line.match(/"([^"]+)":\s*"[^(]*\((\d+)\/\d+\)/);
        if (attrMatch) {
          const attrName = attrMatch[1];
          const attrValue = parseInt(attrMatch[2]);
          if (!isNaN(attrValue)) {
            attributes[attrName] = attrValue;
          }
        }
      }
    }
    
    // Also look for other attribute patterns in the response
    // Pattern: 属性名: 数值/总数 or 属性名 (数值/总数)
    const generalPattern = /([^\s:：]+)[：:]\s*(\d+)\/\d+/g;
    const generalMatches = responseText.matchAll(generalPattern);
    
    for (const match of generalMatches) {
      const attrName = match[1].trim();
      const attrValue = parseInt(match[2]);
      if (!isNaN(attrValue) && !attributes[attrName]) {
        attributes[attrName] = attrValue;
      }
    }
  } catch (error) {
    console.error('Error parsing attributes:', error);
  }
  
  return attributes;
}

/**
 * Parse attributes from response
 * Uses LLM parsing by default (if enabled), with regex fallback
 */
export async function parseAttributesFromResponse(responseText) {
  if (ENABLE_LLM_PARSING) {
    return await parseAttributesWithLLM(responseText);
  } else {
    // Use regex-only parsing when LLM parsing is disabled
    return { attributes: parseAttributesFromResponseRegex(responseText) };
  }
}

/**
 * Debug function to help troubleshoot extraction issues
 */
export function debugExtraction(responseText) {
  console.log('=== EXTRACTION DEBUG ===');
  console.log('Response length:', responseText.length);

  // Test patterns
  const patterns = [
    /姓名：([^|\n]+)/g,
    /年龄：(\d+)岁?/g,
    /身高[：/]\s*(\d+cm)/g,
    /体重[：/]\s*(\d+kg)/g,
    /容貌[：]\s*(\d+)/g,
    /月收入[：]\s*([^\n]+)/g,
    /个人存款[：]\s*([^\n]+)/g,
    /资产[：]\s*([^\n]+)/g
  ];

  patterns.forEach((pattern, i) => {
    const matches = responseText.match(pattern);
    console.log(`Pattern ${i}:`, matches);
  });

  return 'Debug completed - check console';
}

/**
 * Extract action options from game response
 * Supports multiple formats with priority:
 * 1. [ACTION: text] - Primary format (enforced by system prompt)
 * 2. **!! text !!** - PDF markers
 * 3. Numbered lists - Fallback only
 */
export function extractActionOptions(responseText) {
  console.log('\n=== 🎯 EXTRACTING ACTION OPTIONS ===');
  console.log('Response length:', responseText.length);

  const options = [];

  // PRIORITY 1: Extract [ACTION: ...] format (PRIMARY)
  const actionPattern = /\[ACTION:\s*(.+?)\]/g;
  const actionMatches = responseText.matchAll(actionPattern);

  let index = 1;
  for (const match of actionMatches) {
    const text = match[1].trim();
    if (text) {
      options.push({
        id: `action_${index}`,
        index: index,
        text: text,
        value: index.toString(),
        source: 'action_marker'
      });
      console.log(`  ✓ Found [ACTION] option ${index}: ${text.substring(0, 50)}...`);
      index++;
    }
  }

  // If we found [ACTION: ...] format, return immediately (don't mix with other formats)
  if (options.length > 0) {
    console.log(`✅ Extracted ${options.length} action options using [ACTION: ...] format`);
    return options;
  }

  // PRIORITY 2: Extract PDF markers **!! text !!**
  const markerPattern = /\*\*!!\s*(.+?)\s*!!\*\*/g;
  const markerMatches = responseText.matchAll(markerPattern);

  index = 1;
  for (const match of markerMatches) {
    const text = match[1].trim();
    if (text) {
      options.push({
        id: `marker_${index}`,
        index: index,
        text: text,
        value: text,
        source: 'pdf_marker'
      });
      console.log(`  ✓ Found PDF marker option ${index}: ${text.substring(0, 50)}...`);
      index++;
    }
  }

  // If we found PDF markers, return immediately
  if (options.length > 0) {
    console.log(`✅ Extracted ${options.length} action options using PDF markers`);
    return options;
  }

  // PRIORITY 3: Fallback to numbered lists (LAST RESORT)
  console.log('  ℹ️ No [ACTION] or PDF markers found, falling back to numbered lists...');

  const lines = responseText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match lines that start with number followed by period or Chinese punctuation
    const match = line.match(/^(\d+)[.、]\s*(.+)$/);
    if (match) {
      const numIndex = parseInt(match[1]);
      const text = match[2].trim();

      // Filter out table of contents or irrelevant numbered items
      // Only include if text is substantial (more than 5 chars) and looks like an action
      if (text.length > 5 && !text.match(/^(第|Chapter|\d+页|Page|目录|Table|Contents)/i)) {
        options.push({
          id: `option_${numIndex}`,
          index: numIndex,
          text: text,
          value: numIndex.toString(),
          source: 'numbered_list'
        });
        console.log(`  ⚠️ Found numbered option ${numIndex}: ${text.substring(0, 50)}...`);
      }
    }
  }

  // Remove duplicates
  const uniqueOptions = [];
  const seenTexts = new Set();

  for (const option of options) {
    const normalizedText = option.text.toLowerCase().replace(/\s+/g, '');
    if (!seenTexts.has(normalizedText)) {
      seenTexts.add(normalizedText);
      uniqueOptions.push(option);
    }
  }

  console.log(`✅ Extracted ${uniqueOptions.length} unique action options`);
  if (uniqueOptions.length === 0) {
    console.log('⚠️ No action options found in response');
    // console.log('Response preview (first 500 chars):');
    // console.log(responseText.substring(0, 500));
    // console.log('\nResponse preview (last 500 chars):');
    // console.log(responseText.substring(Math.max(0, responseText.length - 500)));
  } else {
    console.log('Options summary:', uniqueOptions.map(o => `[${o.source}] ${o.text.substring(0, 30)}...`));
  }

  return uniqueOptions;
}

/**
 * Parse Claude's response for status updates
 * Claude can include JSON in its response like:
 * {{STATUS_UPDATE: {"character": {"health": 90}, "location": "forest"}}}
 */
export function parseStatusUpdates(responseText) {
  const updates = {};
  
  // Look for status update markers in Claude's response
  const statusUpdateRegex = /\{\{STATUS_UPDATE:\s*({[\s\S]*?})\}\}/g;
  const matches = responseText.matchAll(statusUpdateRegex);
  
  for (const match of matches) {
    try {
      const update = JSON.parse(match[1]);
      Object.assign(updates, update);
    } catch (error) {
      console.error('Error parsing status update:', error);
    }
  }
  
  return updates;
}

/**
 * Apply parsed status updates from Claude response using change detection
 */
export async function applyClaudeUpdates(sessionId, responseText) {
  console.log('\n=== 🎮 applyClaudeUpdates CALLED ===');
  console.log('Session ID:', sessionId);

  try {
    const updates = parseStatusUpdates(responseText);
    console.log('📝 Parsed status updates from markers:', JSON.stringify(updates, null, 2));

    const currentStatus = loadStatus(sessionId);
    console.log('💾 Current status loaded:', {
      hasStatus: !!currentStatus,
      currentAttributes: currentStatus?.attributes || {},
      currentInventory: currentStatus?.inventory?.length || 0
    });

    if (currentStatus) {
      // Use the new change detection approach - pass FULL status, not just attributes
      const changes = await parseGameResponseChanges(responseText, currentStatus);
      console.log('🔄 Changes detected:', JSON.stringify(changes, null, 2));

      // Apply changes to character
      if (changes.character && Object.keys(changes.character).length > 0) {
        updates.character = {
          ...(currentStatus.character || {}),
          ...(updates.character || {}),
          ...changes.character
        };
      }

      // Apply new attributes (these are completely new)
      if (changes.new_attributes && Object.keys(changes.new_attributes).length > 0) {
        updates.attributes = {
          ...(currentStatus.attributes || {}),
          ...(updates.attributes || {}),
          ...changes.new_attributes
        };
      }

      // Apply changed attributes (these replace existing values)
      if (changes.changed_attributes && Object.keys(changes.changed_attributes).length > 0) {
        updates.attributes = {
          ...(currentStatus.attributes || {}),
          ...(updates.attributes || {}),
          ...changes.changed_attributes
        };
      }

      // Apply delta attributes (these modify existing values)
      if (changes.delta_attributes && Object.keys(changes.delta_attributes).length > 0) {
        const currentAttributes = { ...(currentStatus.attributes || {}) };
        Object.entries(changes.delta_attributes).forEach(([key, delta]) => {
          const currentValue = currentAttributes[key] || 0;
          currentAttributes[key] = currentValue + delta;
        });

        updates.attributes = {
          ...(currentStatus.attributes || {}),
          ...(updates.attributes || {}),
          ...currentAttributes
        };
      }

      // Handle new items
      if (changes.new_items && Array.isArray(changes.new_items) && changes.new_items.length > 0) {
        const currentInventory = currentStatus.inventory || [];
        const inventoryMap = new Map();

        // Build map of current inventory
        currentInventory.forEach(item => {
          const key = item.name || item;
          inventoryMap.set(key, item);
        });

        // Add new items
        changes.new_items.forEach(newItem => {
          const itemName = newItem.name || newItem;
          const existing = inventoryMap.get(itemName);

          if (!existing) {
            // Add new item
            inventoryMap.set(itemName, {
              id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: itemName,
              description: newItem.description || `${itemName} - 从游戏中获得`,
              quantity: newItem.quantity || 1,
              value: newItem.value || 0,
              addedAt: new Date().toISOString(),
              ...newItem
            });
          }
        });

        updates.inventory = Array.from(inventoryMap.values());
      }

      // Handle removed items
      if (changes.removed_items && Array.isArray(changes.removed_items) && changes.removed_items.length > 0) {
        const currentInventory = currentStatus.inventory || [];
        const inventoryMap = new Map();

        // Build map of current inventory
        currentInventory.forEach(item => {
          const key = item.name || item;
          inventoryMap.set(key, item);
        });

        // Remove items
        changes.removed_items.forEach(removedItem => {
          const itemName = removedItem.name || removedItem;
          inventoryMap.delete(itemName);
        });

        updates.inventory = Array.from(inventoryMap.values());
      }

      // Handle relationships
      if (changes.new_relationships && Object.keys(changes.new_relationships).length > 0) {
        updates.relationships = {
          ...(currentStatus.relationships || {}),
          ...(updates.relationships || {}),
          ...changes.new_relationships
        };
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log('✅ Applying updates to status:', JSON.stringify(updates, null, 2));
      const updatedStatus = updateStatus(sessionId, updates);
      console.log('✅ Status updated successfully');
      return updatedStatus;
    }

    console.log('⚠️ No updates to apply');
    return loadStatus(sessionId);
  } catch (error) {
    console.error('❌ Error applying Claude updates:', error);
    console.error('Error stack:', error.stack);
    // Return current status on error
    return loadStatus(sessionId);
  }
}


export function getStatusSummary(sessionId) {
  const status = loadStatus(sessionId);
  
  if (!status) {
    return null;
  }

  return {
    character: status.character,
    attributes: status.attributes,
    location: status.location,
    inventoryCount: status.inventory.length,
    achievementCount: status.achievements.length,
    lastUpdated: status.lastUpdated
  };
}


export function exportStatus(sessionId) {
  return loadStatus(sessionId);
}


export function importStatus(sessionId, statusData) {
  saveStatus(sessionId, statusData);
  return statusData;
}

export function deleteStatus(sessionId) {
  const prettyPath = getStatusFilePath(sessionId);
  const legacyPath = path.join(SAVES_DIR, `${sessionId}.json`);
  
  if (fs.existsSync(prettyPath)) {
    fs.unlinkSync(prettyPath);
    return true;
  }
  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
    return true;
  }
  return false;
}

/**
 * List all saved sessions
 */
export function listAllSessions() {
  if (!fs.existsSync(SAVES_DIR)) {
    return [];
  }

  const files = fs.readdirSync(SAVES_DIR);
  const sessions = [];

  for (const file of files) {
    // Skip settings files and metadata files
    if (!file.endsWith('.json')) continue;
    if (file.startsWith('settings_')) continue;
    if (file.endsWith('_meta.json')) continue;

    try {
      const fullPath = path.join(SAVES_DIR, file);
      const data = fs.readFileSync(fullPath, 'utf-8');
      const status = JSON.parse(data);
      const sessionId = status.sessionId || file.replace('.json', '');
      if (status) {
        sessions.push({
          sessionId,
          createdAt: status.createdAt,
          lastUpdated: status.lastUpdated,
          characterName: status.character?.name || 'Player',
          location: status.location
        });
      }
    } catch (e) {
      // ignore unreadable files
    }
  }

  return sessions;
}

/**
 * Deep merge objects
 */
function deepMerge(target, source) {
  const output = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (target[key] && typeof target[key] === 'object') {
        output[key] = deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }
  
  return output;
}

export function getStatusUpdatePrompt(status) {
  const attributesList = Object.entries(status.attributes || {})
    .map(([key, value]) => `- ${key}：${value}`)
    .join('\n');
  
  return `
当前角色状态：
- 姓名：${status.character.name}
- 等级：${status.character.level}
- 生命值：${status.character.health}/${status.character.maxHealth}
- 能量：${status.character.energy}/${status.character.maxEnergy}
- 金钱：${status.character.money}
- 位置：${status.location}
- 物品数量：${status.inventory.length}

${attributesList ? `属性：\n${attributesList}` : '属性：(将从你的回复中自动提取)'}

系统会自动从你的回复中提取"核心属性成长"或类似格式的属性数据。
`.trim();
}

