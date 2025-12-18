import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { deepMerge } from './utils.js';
import { loadGameData } from './gameInitializationService.js';
import { parseNarrativeSteps } from './narrativeParser.js';
import { syncNetworkToScenes } from './networkService.js';
import dotenv from 'dotenv';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});
const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');

function getPlayerFilePath(sessionId) {
  // Save to session directory
  const sessionDir = path.join(GAME_DATA_DIR, sessionId);

  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  return path.join(sessionDir, `player_${sessionId}.json`);
}

export function initializeStatus(sessionId, fileId, initialLocation) {
  console.log('📦 Initializing player data for session:', sessionId);

  let templateData = null;
  try {
    // Try session directory first
    let gameData = loadGameData(sessionId, true);
    if (!gameData) {
      gameData = loadGameData(fileId, false);
    }

    if (gameData && gameData.playerData) {
      templateData = gameData.playerData;
      console.log('✅ Loaded PDF template data');
    }
  } catch (error) {
    console.warn('⚠️ No PDF template found - using minimal fallback structure');
    console.warn('⚠️ Please ensure game data is extracted from PDF before starting session');
  }

  // Create session-based player data by cloning the template and adding session metadata
  const playerData = {
    fileId,
    sessionId,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    data: {
      // Clone ALL template data
      ...templateData,
      // Add session-specific fields
      location: initialLocation,
      unlockedScenes: [initialLocation]// Initialize with only the starting scene unlocked
    }
  };

  saveStatus(sessionId, playerData);
  return playerData.data; // Return just the data portion for compatibility
}

/**
 * Clean up corrupted inventory structure
 * Removes numeric keys and ensures proper { items: [...] } structure
 */
function cleanInventoryStructure(inventory) {
  if (!inventory) {
    return { items: [] };
  }

  // If inventory is already an array (old format), wrap it
  if (Array.isArray(inventory)) {
    return { items: cleanItemsList(inventory) };
  }

  // If inventory is an object, extract only the items array
  // and remove any numeric keys (0, 1, 2, etc.)
  const items = inventory.items || [];

  return { items: cleanItemsList(items) };
}

/**
 * Clean up corrupted items in the inventory list
 * Removes numeric keys from item objects (caused by string spread bug)
 */
function cleanItemsList(items) {
  return items.map(item => {
    if (typeof item !== 'object' || item === null) {
      return item;
    }

    // Remove numeric keys (0, 1, 2, etc.) from item object
    const cleanedItem = {};
    for (const [key, value] of Object.entries(item)) {
      // Skip numeric keys
      if (!/^\d+$/.test(key)) {
        cleanedItem[key] = value;
      }
    }
    return cleanedItem;
  });
}

export function loadStatus(sessionId) {
  const filePath = getPlayerFilePath(sessionId);

  try {
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, 'utf-8');
      const playerData = JSON.parse(fileData);

      // Clean up inventory structure on load
      if (playerData.data && playerData.data.inventory) {
        playerData.data.inventory = cleanInventoryStructure(playerData.data.inventory);
      }

      // Clean up deprecated fields
      if (playerData.data) {
        delete playerData.data.characterAttributes;
        delete playerData.data.attributes;
        delete playerData.data.relationships;
        delete playerData.data.flags;
        // Migrate old 'character' field to 'network' if exists
        if (playerData.data.character && !playerData.data.network) {
          playerData.data.network = playerData.data.character;
        }
        delete playerData.data.character;
      }

      return playerData.data; // Return just the data portion for compatibility
    }
  } catch (error) {
    console.error(`Error loading player data for session ${sessionId}:`, error);
  }
  return null;
}

export function saveStatus(sessionId, playerDataOrFullObject) {
  const filePath = getPlayerFilePath(sessionId);

  // Handle both old format (just data) and new format (full object with metadata)
  let fullObject;
  if (playerDataOrFullObject.data) {
    // New format: has metadata wrapper
    fullObject = {
      ...playerDataOrFullObject,
      lastUpdated: new Date().toISOString()
    };
  } else {
    // Old format: just the data, need to load existing or create new
    const existing = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      : { sessionId, createdAt: new Date().toISOString() };

    fullObject = {
      ...existing,
      lastUpdated: new Date().toISOString(),
      data: playerDataOrFullObject
    };
  }

  // Clean up inventory structure before saving
  if (fullObject.data && fullObject.data.inventory) {
    fullObject.data.inventory = cleanInventoryStructure(fullObject.data.inventory);
  }

  fs.writeFileSync(filePath, JSON.stringify(fullObject, null, 2), 'utf-8');
}


export function updateStatus(sessionId, updates) {
  const status = loadStatus(sessionId);

  if (!status) {
    throw new Error('Player data not found for session');
  }

  // Deep merge updates
  const updatedStatus = deepMerge(status, updates);
  saveStatus(sessionId, updatedStatus);

  return updatedStatus;
}


export function useItem(sessionId, itemIdOrName) {
  const status = loadStatus(sessionId);

  if (!status) {
    throw new Error('Player data not found for session');
  }

  // Find item by ID or name
  const itemIndex = status.inventory.items.findIndex(item =>
    item.id === itemIdOrName || item.name === itemIdOrName
  );

  if (itemIndex === -1) {
    throw new Error('Item not found in inventory');
  }

  const item = status.inventory.items[itemIndex];

  // Decrease quantity or remove item
  if (item.quantity && item.quantity > 1) {
    item.quantity -= 1;
  } else {
    status.inventory.items.splice(itemIndex, 1);
  }

  saveStatus(sessionId, status);

  return {
    status,
    usedItem: item
  };
}

/**
 * Extract explicit status changes from parsed narrative steps
 * Handles [CHANGE:], [UNLOCK_SCENE:], and implicit item/relationship mentions
 */
function extractExplicitChanges(responseText, narrativeSteps) {
  console.log('\n=== 🔍 Extracting explicit changes from narrative ===');

  const changes = {
    network: {},
    stats_updates: {},
    new_items: [],
    removed_items: [],
    unlocked_scenes: []
  };

  // Process each narrative step
  narrativeSteps.forEach(step => {
    if (step.type === 'hint') {
      // Extract [CHANGE: character, attribute, delta] markers
      if (step.changes && step.changes.length > 0) {
        step.changes.forEach(change => {
          if (change.characterId === '玩家' || change.characterId === 'player' || change.characterId === 'hero') {
            // Player stats change
            if (!changes.stats_updates[change.attribute]) {
              changes.stats_updates[change.attribute] = 0;
            }
            changes.stats_updates[change.attribute] += change.delta;
            console.log(`  ✓ Player ${change.attribute}: ${change.delta > 0 ? '+' : ''}${change.delta}`);
          } else {
            // NPC network relationship change
            if (!changes.network[change.characterId]) {
              changes.network[change.characterId] = { relationship: 0 };
            }
            changes.network[change.characterId].relationship += change.delta;
            console.log(`  ✓ Network ${change.characterId} relationship: ${change.delta > 0 ? '+' : ''}${change.delta}`);
          }
        });
      }

      // Extract [CHANGE: RELATIONSHIP, NPC名字, delta] markers
      if (step.relationshipChanges && step.relationshipChanges.length > 0) {
        step.relationshipChanges.forEach(relChange => {
          if (!changes.network[relChange.npcName]) {
            changes.network[relChange.npcName] = { relationship: 0 };
          }
          changes.network[relChange.npcName].relationship += relChange.delta;
          console.log(`  ✓ Network ${relChange.npcName} relationship: ${relChange.delta > 0 ? '+' : ''}${relChange.delta}`);
        });
      }

      // Extract [CHANGE: 道具名称, 获得/丢失, 数量] markers
      if (step.itemChanges && step.itemChanges.length > 0) {
        step.itemChanges.forEach(itemChange => {
          if (itemChange.action === '获得') {
            changes.new_items.push({
              name: itemChange.itemName,
              quantity: itemChange.quantity
            });
            console.log(`  ✓ Item gained: ${itemChange.itemName} x${itemChange.quantity}`);
          } else if (itemChange.action === '丢失') {
            changes.removed_items.push({
              name: itemChange.itemName,
              quantity: itemChange.quantity
            });
            console.log(`  ✓ Item lost: ${itemChange.itemName} x${itemChange.quantity}`);
          }
        });
      }
    }
  });

  // Extract [UNLOCK_SCENE: scene_id] markers from hint text
  const unlockPattern = /\[UNLOCK_SCENE:\s*([^\]]+)\]/g;
  const unlockMatches = responseText.matchAll(unlockPattern);
  for (const match of unlockMatches) {
    const sceneId = match[1].trim();
    if (!changes.unlocked_scenes.includes(sceneId)) {
      changes.unlocked_scenes.push(sceneId);
      console.log(`  ✓ Unlocked scene: ${sceneId}`);
    }
  }

  console.log(`✅ Extracted ${Object.keys(changes.stats_updates).length} explicit stats changes`);
  console.log(`✅ Extracted ${changes.unlocked_scenes.length} scene unlocks`);

  return changes;
}

/**
 * Use LLM to parse implicit changes not covered by explicit markers
 * This handles changes that are mentioned in narration/dialogue but not marked explicitly
 */
async function parseImplicitChanges(responseText, currentStatus, explicitChanges) {
  console.log('\n=== 🔍 Parsing implicit changes with LLM ===');

  // Extract stats for comparison
  const currentStats = currentStatus.stats || {};
  const currentInventory = currentStatus.inventory?.items || [];
  const currentNetwork = currentStatus.network || {};
  const currentCurrency = currentStatus.currency || {};

  try {
    const prompt = `You are a game state analyzer. The game already detected these EXPLICIT changes:
- Stats: ${JSON.stringify(explicitChanges.stats_updates)}
- Items: ${JSON.stringify(explicitChanges.new_items)}
- Unlocked scenes: ${JSON.stringify(explicitChanges.unlocked_scenes)}

Now find any ADDITIONAL implicit changes mentioned in the narrative that were NOT already detected.

CURRENT STATE:
Stats: ${JSON.stringify(currentStats, null, 2)}
Inventory: ${currentInventory.map(i => i.name || i).join(', ')}
Network: ${JSON.stringify(currentNetwork, null, 2)}
Currency: ${JSON.stringify(currentCurrency, null, 2)}

GAME RESPONSE:
${responseText}

LOOK FOR:
1. Items mentioned as obtained/lost (获得, 失去, 拾取, 丢弃, etc.)
2. Stats changes (health, attack, defense, intellect, reputation, etc.)
3. Currency changes (gold)
4. NPC relationship changes in the network
5. DO NOT duplicate changes already in explicit list

Return ONLY valid JSON (empty if no additional changes):
{
  "network": {},
  "stats": {},
  "currency": {},
  "new_items": [],
  "removed_items": []
}`;

    console.log('🤖 Calling LLM for implicit change detection...');
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseContent = message.content[0].text.trim();

    // Try to extract JSON from response
    let jsonText = responseContent;
    const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseContent.match(/```\s*([\s\S]*?)\s*```/) ||
                      responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0].replace(/```json|```/g, '').trim();
    }

    const parsedData = JSON.parse(jsonText);
    console.log('✅ Implicit changes detected:', JSON.stringify(parsedData, null, 2));
    return parsedData;
  } catch (error) {
    console.error('❌ Error parsing implicit changes:', error);
    return {
      network: {},
      stats: {},
      currency: {},
      new_items: [],
      removed_items: []
    };
  }
}

/**
 * Apply parsed status updates from Claude response using two-phase detection:
 * 1. Extract explicit markers ([CHANGE:], [UNLOCK_SCENE:])
 * 2. Use LLM to detect implicit changes in narrative
 */
export async function applyClaudeUpdates(sessionId, responseText) {
  console.log('\n=== 🎮 applyClaudeUpdates CALLED ===');
  console.log('Session ID:', sessionId);

  try {
    const currentStatus = loadStatus(sessionId);
    console.log('💾 Current status loaded:', {
      hasStatus: !!currentStatus,
      currentStats: Object.keys(currentStatus?.stats || {}).length,
      currentInventory: currentStatus?.inventory?.items?.length || 0
    });

    if (!currentStatus) {
      console.warn('⚠️ No current status found for session');
      return null;
    }

    const updates = {};

    // PHASE 1: Parse narrative structure and extract explicit changes
    const narrativeData = parseNarrativeSteps(responseText);
    const explicitChanges = extractExplicitChanges(responseText, narrativeData.steps);

    // PHASE 2: Use LLM to detect implicit changes not covered by explicit markers
    const implicitChanges = await parseImplicitChanges(responseText, currentStatus, explicitChanges);

    // Merge explicit and implicit changes
    const changes = {
      network: { ...explicitChanges.network, ...(implicitChanges.network || {}) },
      stats: { ...explicitChanges.stats_updates, ...(implicitChanges.stats || {}) },
      currency: { ...(implicitChanges.currency || {}) },
      new_items: [...explicitChanges.new_items, ...(implicitChanges.new_items || [])],
      removed_items: [...explicitChanges.removed_items, ...(implicitChanges.removed_items || [])],
      unlocked_scenes: explicitChanges.unlocked_scenes
    };

    console.log('🔄 Total changes detected:', JSON.stringify(changes, null, 2));

    // Apply changes to network (includes relationship data)
    if (changes.network && Object.keys(changes.network).length > 0) {
      const currentNetwork = currentStatus.network || {};
      // Deep merge network data to preserve existing relationship values
      const mergedNetwork = { ...currentNetwork };
      for (const [npcName, npcData] of Object.entries(changes.network)) {
        if (mergedNetwork[npcName]) {
          // Merge with existing - add relationship deltas
          mergedNetwork[npcName] = {
            ...mergedNetwork[npcName],
            relationship: (mergedNetwork[npcName].relationship || 0) + (npcData.relationship || 0)
          };
        } else {
          mergedNetwork[npcName] = npcData;
        }
      }
      updates.network = mergedNetwork;
    }

    // Apply stats updates
    if (changes.stats && Object.keys(changes.stats).length > 0) {
      console.log('🔄 Applying stats updates...');
      updates.stats = {
        ...(currentStatus.stats || {}),
        ...changes.stats
      };
      console.log('✅ Stats updated:', updates.stats);
    }

    // Apply currency updates (hot update support)
    if (changes.currency && Object.keys(changes.currency).length > 0) {
      console.log('🔄 Applying currency updates...');
      updates.currency = {
        ...(currentStatus.currency || {}),
        ...changes.currency
      };
      console.log('✅ Currency updated:', updates.currency);
    }

    // Handle inventory changes (both new and removed items)
    const hasNewItems = changes.new_items && Array.isArray(changes.new_items) && changes.new_items.length > 0;
    const hasRemovedItems = changes.removed_items && Array.isArray(changes.removed_items) && changes.removed_items.length > 0;

    if (hasNewItems || hasRemovedItems) {
      const currentInventory = currentStatus.inventory?.items || [];
      const inventoryMap = new Map();

      // Build map of current inventory
      currentInventory.forEach(item => {
        const key = item.name || item;
        inventoryMap.set(key, item);
      });

      // Add new items
      if (hasNewItems) {
        changes.new_items.forEach(newItem => {
          const itemName = typeof newItem === 'string' ? newItem : (newItem.name || newItem);
          const existing = inventoryMap.get(itemName);

          if (existing) {
            // Item exists - update quantity
            const addQuantity = typeof newItem === 'object' ? (newItem.quantity || 1) : 1;
            existing.quantity = (existing.quantity || 1) + addQuantity;
          } else {
            // Add new item - only spread if newItem is an object, not a string
            const itemData = typeof newItem === 'object' ? newItem : {};
            inventoryMap.set(itemName, {
              id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              name: itemName,
              description: itemData.description || `${itemName} - 从游戏中获得`,
              quantity: itemData.quantity || 1,
              value: itemData.value || 0,
              addedAt: new Date().toISOString()
            });
          }
        });
      }

      // Remove items or decrease quantity
      if (hasRemovedItems) {
        changes.removed_items.forEach(removedItem => {
          const itemName = typeof removedItem === 'string' ? removedItem : (removedItem.name || removedItem);
          const quantityToRemove = typeof removedItem === 'object' ? (removedItem.quantity || 1) : 1;
          const existing = inventoryMap.get(itemName);

          if (existing) {
            const currentQuantity = existing.quantity || 1;
            if (currentQuantity > quantityToRemove) {
              // Decrease quantity
              existing.quantity = currentQuantity - quantityToRemove;
            } else {
              // Remove item completely
              inventoryMap.delete(itemName);
            }
          }
        });
      }

      // Clean structure - only keep the items array, remove numeric keys
      updates.inventory = {
        items: Array.from(inventoryMap.values())
      };
    }

    // Handle unlocked scenes
    if (changes.unlocked_scenes && Array.isArray(changes.unlocked_scenes) && changes.unlocked_scenes.length > 0) {
      const currentUnlockedScenes = currentStatus.unlockedScenes || [];
      const newlyUnlockedScenes = changes.unlocked_scenes.filter(
        sceneId => !currentUnlockedScenes.includes(sceneId)
      );

      if (newlyUnlockedScenes.length > 0) {
        updates.unlockedScenes = [...currentUnlockedScenes, ...newlyUnlockedScenes];
        console.log(`🗺️ Unlocked new scenes: ${newlyUnlockedScenes.join(', ')}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log('✅ Applying updates to player data');
      const updatedStatus = updateStatus(sessionId, updates);

      // Sync network relationships to scene data
      if (updates.network) {
        syncNetworkToScenes(sessionId, updatedStatus.network);
      }

      console.log('✅ Player data updated successfully');
      return updatedStatus;
    }

    console.log('⚠️ No updates to apply');
    return currentStatus;
  } catch (error) {
    console.error('❌ Error applying Claude updates:', error);
    console.error('Error stack:', error.stack);
    // Return current status on error
    return loadStatus(sessionId);
  }
}

