import Anthropic from '@anthropic-ai/sdk';
import { loadGameData, updateGameData } from './gameInitializationService.js';

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

/**
 * Analyze game response and update all relevant game data categories
 * This function is called after each game turn to keep data files synchronized
 */
export async function analyzeAndUpdateGameData(fileId, sessionId, gameResponse, playerAction) {
  console.log('\n=== 🔄 GAME DATA UPDATE ===');
  console.log('File ID:', fileId);
  console.log('Session ID:', sessionId);
  console.log('Action:', playerAction);

  try {
    // Load current game data
    const gameData = loadGameData(fileId);
    if (!gameData) {
      console.log('⚠️ No game data found for fileId:', fileId);
      return null;
    }

    // Use LLM to analyze what changed in the game response
    const updates = await extractGameUpdates(gameResponse, playerAction, gameData);

    // Apply updates to each category
    const results = {
      backgroundUpdated: false,
      playerUpdated: false,
      itemsUpdated: false,
      worldUpdated: false
    };

    if (updates.backgroundUpdates && Object.keys(updates.backgroundUpdates).length > 0) {
      updateGameData(fileId, 'background', updates.backgroundUpdates);
      results.backgroundUpdated = true;
      console.log('✅ Background data updated');
    }

    if (updates.playerUpdates && Object.keys(updates.playerUpdates).length > 0) {
      updateGameData(fileId, 'player', updates.playerUpdates);
      results.playerUpdated = true;
      console.log('✅ Player data updated');
    }

    if (updates.itemUpdates && Object.keys(updates.itemUpdates).length > 0) {
      updateGameData(fileId, 'items', updates.itemUpdates);
      results.itemsUpdated = true;
      console.log('✅ Item data updated');
    }

    if (updates.worldUpdates && Object.keys(updates.worldUpdates).length > 0) {
      updateGameData(fileId, 'world', updates.worldUpdates);
      results.worldUpdated = true;
      console.log('✅ World data updated');
    }

    console.log('🎉 Game data update complete:', results);
    return results;
  } catch (error) {
    console.error('❌ Error updating game data:', error);
    return null;
  }
}

/**
 * Use LLM to extract game updates from the response
 */
async function extractGameUpdates(gameResponse, playerAction, currentGameData) {
  console.log('🤖 Analyzing game response for updates...');

  const prompt = `Analyze this game response and player action to identify what changed in the game world.

CURRENT GAME STATE:
Background: ${JSON.stringify(currentGameData.backgroundData, null, 2).substring(0, 1000)}...
Player: ${JSON.stringify(currentGameData.playerData, null, 2).substring(0, 1000)}...
Items: ${JSON.stringify(currentGameData.itemData, null, 2).substring(0, 500)}...
World: ${JSON.stringify(currentGameData.worldData, null, 2).substring(0, 1000)}...

PLAYER ACTION:
${playerAction}

GAME RESPONSE:
${gameResponse}

Analyze what changed and return ONLY valid JSON in this format:
{
  "backgroundUpdates": {
    "eraBackground": {
      "currentSituation": "Updated current situation if it changed"
    },
    "protagonistBackground": {
      "relationships": [
        {"name": "Person", "relationship": "Type", "description": "New/updated relationship"}
      ]
    }
  },
  "playerUpdates": {
    "characterAttributes": {
      "基础属性": {
        "健康": 95,
        "体力": 80
      },
      "能力属性": {
        "力量": 12
      },
      "社会属性": {
        "声望": 75
      },
      "技能属性": {
        "专业技能": [
          {"name": "Skill", "level": 2, "description": "Improved skill"}
        ]
      },
      "自定义属性": {
        "新属性": "新值"
      }
    },
    "inventory": {
      "items": [
        {"id": "new_item", "name": "Item", "category": "Type", "quantity": 1, "description": "Desc"}
      ],
      "money": {
        "amount": 1500
      }
    }
  },
  "itemUpdates": {
    "items": [
      {"id": "item_id", "name": "Updated item info"}
    ]
  },
  "worldUpdates": {
    "scenes": [
      {"id": "scene_id", "accessible": true, "description": "Updated description"}
    ],
    "npcs": [
      {
        "id": "npc_id",
        "location": "new_location",
        "relationships": [{"npc": "other_npc", "type": "Type", "value": 50}],
        "attributes": {"attitude": "friendly"}
      }
    ],
    "buildings": [
      {"id": "building_id", "accessible": true}
    ]
  }
}

IMPORTANT RULES:
1. Only include changes that actually occurred in the game response
2. For player attributes: include ONLY attributes that changed
3. For inventory: include items that were added or removed
4. For NPCs: update location if they moved, relationships if they changed, attitude if it changed
5. For scenes/buildings: update accessibility, descriptions if mentioned
6. If a category has no changes, return an empty object {} for that category
7. Do NOT include unchanged data
8. Return ONLY JSON, no explanations

Examples:
- If player gains +5 strength → "能力属性": {"力量": new_value}
- If player picks up an item → add to "inventory.items"
- If NPC relationship improves → update in "worldUpdates.npcs[].relationships"
- If player moves to new location → this is handled by character status, not here
- If game time progresses → update "backgroundUpdates.eraBackground.currentSituation"`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].text.trim();
    const updates = parseJSONFromResponse(responseText);

    console.log('✅ Updates extracted:', {
      hasBackgroundUpdates: !!updates.backgroundUpdates && Object.keys(updates.backgroundUpdates).length > 0,
      hasPlayerUpdates: !!updates.playerUpdates && Object.keys(updates.playerUpdates).length > 0,
      hasItemUpdates: !!updates.itemUpdates && Object.keys(updates.itemUpdates).length > 0,
      hasWorldUpdates: !!updates.worldUpdates && Object.keys(updates.worldUpdates).length > 0
    });

    return updates;
  } catch (error) {
    console.error('❌ Error extracting updates:', error);
    return {
      backgroundUpdates: {},
      playerUpdates: {},
      itemUpdates: {},
      worldUpdates: {}
    };
  }
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSONFromResponse(responseText) {
  let jsonText = responseText;

  // Try to extract JSON from markdown code blocks
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                    responseText.match(/```\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse JSON from game update response');
    console.error('Response text:', responseText.substring(0, 500));
    // Return empty updates if parsing fails
    return {
      backgroundUpdates: {},
      playerUpdates: {},
      itemUpdates: {},
      worldUpdates: {}
    };
  }
}

/**
 * Quick update functions for common operations
 */

/**
 * Update player position/location
 */
export function updatePlayerLocation(fileId, newLocation) {
  const playerData = loadGameData(fileId).playerData;
  // Location is typically stored in character status, but we can track it here too
  return updateGameData(fileId, 'player', {
    currentLocation: newLocation
  });
}

/**
 * Update NPC location
 */
export function updateNPCLocation(fileId, npcId, newLocation) {
  const worldData = loadGameData(fileId).worldData;
  const npc = worldData.npcs.find(n => n.id === npcId);

  if (!npc) {
    console.error(`NPC not found: ${npcId}`);
    return null;
  }

  const updatedNPCs = worldData.npcs.map(n =>
    n.id === npcId ? { ...n, location: newLocation } : n
  );

  return updateGameData(fileId, 'world', {
    npcs: updatedNPCs
  });
}

/**
 * Update NPC relationship
 */
export function updateNPCRelationship(fileId, npcId, targetNpcId, relationshipType, value) {
  const worldData = loadGameData(fileId).worldData;
  const npc = worldData.npcs.find(n => n.id === npcId);

  if (!npc) {
    console.error(`NPC not found: ${npcId}`);
    return null;
  }

  const updatedRelationships = npc.relationships || [];
  const existingIndex = updatedRelationships.findIndex(r => r.npc === targetNpcId);

  if (existingIndex >= 0) {
    updatedRelationships[existingIndex] = {
      npc: targetNpcId,
      type: relationshipType,
      value
    };
  } else {
    updatedRelationships.push({
      npc: targetNpcId,
      type: relationshipType,
      value
    });
  }

  const updatedNPCs = worldData.npcs.map(n =>
    n.id === npcId ? { ...n, relationships: updatedRelationships } : n
  );

  return updateGameData(fileId, 'world', {
    npcs: updatedNPCs
  });
}

/**
 * Mark scene as accessible/inaccessible
 */
export function updateSceneAccessibility(fileId, sceneId, accessible) {
  const worldData = loadGameData(fileId).worldData;

  const updatedScenes = worldData.scenes.map(s =>
    s.id === sceneId ? { ...s, accessible } : s
  );

  return updateGameData(fileId, 'world', {
    scenes: updatedScenes
  });
}

/**
 * Add new quest to NPC
 */
export function addQuestToNPC(fileId, npcId, questId) {
  const worldData = loadGameData(fileId).worldData;
  const npc = worldData.npcs.find(n => n.id === npcId);

  if (!npc) {
    console.error(`NPC not found: ${npcId}`);
    return null;
  }

  const quests = npc.quests || [];
  if (!quests.includes(questId)) {
    quests.push(questId);
  }

  const updatedNPCs = worldData.npcs.map(n =>
    n.id === npcId ? { ...n, quests } : n
  );

  return updateGameData(fileId, 'world', {
    npcs: updatedNPCs
  });
}

/**
 * Update current situation (time progression, world events)
 */
export function updateCurrentSituation(fileId, newSituation) {
  const backgroundData = loadGameData(fileId).backgroundData;

  return updateGameData(fileId, 'background', {
    eraBackground: {
      ...backgroundData.eraBackground,
      currentSituation: newSituation
    }
  });
}
