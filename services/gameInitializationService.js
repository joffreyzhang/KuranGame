import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

// Directory for storing game data files
const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');

// Ensure game data directory exists
if (!fs.existsSync(GAME_DATA_DIR)) {
  fs.mkdirSync(GAME_DATA_DIR, { recursive: true });
}

/**
 * Extract comprehensive game data from PDF using LLM
 * Returns structured data split into 4 main categories:
 * 1. Background Data (背景数据)
 * 2. Player Data (玩家数据)
 * 3. Item Data (物品数据)
 * 4. World Data (世界数据)
 */
export async function extractGameInitializationData(pdfText, fileId) {
  console.log('\n=== 🎮 GAME INITIALIZATION EXTRACTION ===');
  console.log('File ID:', fileId);
  console.log('PDF text length:', pdfText.length);

  try {
    // Extract all 4 categories of data using LLM
    const backgroundData = await extractBackgroundData(pdfText);
    const playerData = await extractPlayerData(pdfText);
    const itemData = await extractItemData(pdfText);
    const worldData = await extractWorldData(pdfText);

    // Create session-specific data structure
    const gameData = {
      fileId,
      extractedAt: new Date().toISOString(),
      backgroundData,
      playerData,
      itemData,
      worldData
    };

    // Save each category to separate JSON files
    await saveGameData(fileId, gameData);

    console.log('✅ Game initialization data extracted and saved');
    return gameData;
  } catch (error) {
    console.error('❌ Error extracting game initialization data:', error);
    throw error;
  }
}

/**
 * 1. Extract Background Data (背景数据)
 * - 时代背景 (Era Background)
 * - 主角背景 (Protagonist Background)
 */
async function extractBackgroundData(pdfText) {
  console.log('📜 Extracting background data...');

  const prompt = `Extract background information from this game content.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "eraBackground": {
    "timePeriod": "Time period (e.g., modern, medieval, futuristic)",
    "setting": "World setting description",
    "socialContext": "Social and cultural context",
    "majorEvents": ["Important historical events"],
    "currentSituation": "Current world state"
  },
  "protagonistBackground": {
    "name": "Protagonist name",
    "age": 0,
    "gender": "Gender",
    "occupation": "Occupation/role",
    "backstory": "Personal history",
    "motivation": "Main motivation",
    "relationships": [
      {"name": "Related person", "relationship": "Relationship type", "description": "Description"}
    ],
    "startingLocation": "Where the story begins"
  }
}

IMPORTANT:
- Extract ALL relevant information about the time period, world setting, and social context
- Include the protagonist's complete background, motivations, and key relationships
- If information is not available, use empty strings or empty arrays
- Return ONLY JSON, no explanations`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);
  console.log('✅ Background data extracted');
  return data;
}

/**
 * 2. Extract Player Data (玩家数据)
 * - 人物属性 (Character Attributes)
 * - 背包信息 (Inventory Information)
 */
async function extractPlayerData(pdfText) {
  console.log('👤 Extracting player data...');

  const prompt = `Extract player character data from this game content.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "characterAttributes": {
    "基础属性": {
      "姓名": "Name",
      "性别": "Gender",
      "年龄": 0,
      "身高": "Height",
      "体重": "Weight",
      "容貌": 0,
      "健康": 100,
      "体力": 100,
      "精神": 100
    },
    "能力属性": {
      "力量": 0,
      "敏捷": 0,
      "智力": 0,
      "魅力": 0,
      "幸运": 0,
      "感知": 0
    },
    "社会属性": {
      "声望": 0,
      "地位": "Social status",
      "财富": 0,
      "人脉": 0
    },
    "技能属性": {
      "专业技能": [
        {"name": "Skill name", "level": 0, "description": "Description"}
      ],
      "生活技能": [
        {"name": "Skill name", "level": 0, "description": "Description"}
      ]
    },
    "自定义属性": {
      "key": "value"
    }
  },
  "inventory": {
    "capacity": 20,
    "items": [
      {
        "id": "item_id",
        "name": "Item name",
        "category": "Category (装备/消耗品/任务道具/其他)",
        "quantity": 1,
        "description": "Item description",
        "value": 0,
        "weight": 0,
        "equipped": false
      }
    ],
    "money": {
      "currency": "货币单位",
      "amount": 0
    }
  }
}

IMPORTANT:
- Extract ALL numeric attributes mentioned in the PDF
- Identify custom attributes that don't fit standard categories
- Include all starting items/equipment in inventory
- If an attribute isn't mentioned, use reasonable default values
- Return ONLY JSON, no explanations`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);
  console.log('✅ Player data extracted');
  return data;
}

/**
 * 3. Extract Item Data (物品数据)
 * - 物品信息 (Item Information)
 * - 物品作用 (Item Effects)
 */
async function extractItemData(pdfText) {
  console.log('🎒 Extracting item data...');

  const prompt = `Extract all items and their effects from this game content.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "items": [
    {
      "id": "unique_item_id",
      "name": "Item name",
      "category": "Category (武器/防具/消耗品/任务道具/材料/其他)",
      "rarity": "Common/Uncommon/Rare/Epic/Legendary",
      "description": "Detailed description",
      "value": 0,
      "weight": 0,
      "stackable": true,
      "maxStack": 99,
      "effects": [
        {
          "type": "Effect type (heal/buff/debuff/damage/quest)",
          "target": "Target (self/enemy/ally)",
          "value": 0,
          "duration": 0,
          "description": "Effect description"
        }
      ],
      "requirements": {
        "level": 0,
        "attributes": {"attribute_name": minimum_value},
        "skills": ["required_skill"]
      },
      "usable": true,
      "consumable": true,
      "tradeable": true,
      "dropRate": 0.0
    }
  ],
  "itemCategories": [
    {
      "name": "Category name",
      "description": "Category description",
      "icon": "Icon identifier"
    }
  ]
}

IMPORTANT:
- Extract EVERY item mentioned in the PDF
- Include complete effect information (healing, buffs, damage, etc.)
- Specify requirements for using each item
- Categorize items properly
- If specific values aren't mentioned, use reasonable defaults
- Return ONLY JSON, no explanations`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);
  console.log('✅ Item data extracted');
  return data;
}

/**
 * 4. Extract World Data (世界数据)
 * - 场景 (Scenes)
 * - 建筑 (Buildings)
 * - NPC (Non-Player Characters)
 * - 地图 (Map)
 */
async function extractWorldData(pdfText) {
  console.log('🌍 Extracting world data...');

  const prompt = `Extract world data including scenes, buildings, NPCs, and map from this game content.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "scenes": [
    {
      "id": "scene_id",
      "name": "Scene name",
      "type": "indoor/outdoor/dungeon/city/wilderness",
      "description": "Detailed description",
      "atmosphere": "Mood and atmosphere",
      "connections": ["connected_scene_id"],
      "npcs": ["npc_id"],
      "items": ["item_id"],
      "events": [
        {"id": "event_id", "name": "Event name", "description": "Description", "trigger": "Trigger condition"}
      ],
      "accessible": true
    }
  ],
  "buildings": [
    {
      "id": "building_id",
      "name": "Building name",
      "type": "shop/house/inn/temple/guild/castle/other",
      "location": "scene_id",
      "description": "Description",
      "owner": "Owner name or NPC ID",
      "services": ["Service type"],
      "interiorScenes": ["scene_id"],
      "openHours": "Operating hours",
      "accessible": true
    }
  ],
  "npcs": [
    {
      "id": "npc_id",
      "name": "NPC name",
      "title": "Title or role",
      "age": 0,
      "gender": "Gender",
      "occupation": "Occupation",
      "personality": "Personality traits",
      "appearance": "Physical description",
      "backstory": "Background story",
      "location": "Current location (scene_id)",
      "schedule": [
        {"time": "Time period", "location": "scene_id", "activity": "Activity"}
      ],
      "relationships": [
        {"npc": "npc_id", "type": "Relationship type", "value": 0}
      ],
      "dialogue": {
        "greeting": "Greeting text",
        "farewell": "Farewell text",
        "topics": [
          {"id": "topic_id", "topic": "Topic name", "response": "NPC response"}
        ]
      },
      "quests": ["quest_id"],
      "trades": {
        "buys": ["item_category"],
        "sells": ["item_id"],
        "priceModifier": 1.0
      },
      "attributes": {
        "health": 100,
        "level": 1,
        "faction": "Faction name",
        "attitude": "friendly/neutral/hostile"
      },
      "isEssential": false,
      "respawns": true
    }
  ],
  "map": {
    "name": "World/region name",
    "description": "Map description",
    "regions": [
      {
        "id": "region_id",
        "name": "Region name",
        "type": "Type (城市/乡村/荒野/地下城)",
        "description": "Description",
        "scenes": ["scene_id"],
        "subRegions": ["region_id"]
      }
    ],
    "connections": [
      {
        "from": "scene_id",
        "to": "scene_id",
        "type": "road/path/portal/stairs",
        "distance": 0,
        "travelTime": 0,
        "requirements": ["requirement"],
        "bidirectional": true
      }
    ],
    "landmarks": [
      {
        "id": "landmark_id",
        "name": "Landmark name",
        "location": "scene_id",
        "description": "Description",
        "significance": "Historical or cultural significance"
      }
    ]
  }
}

IMPORTANT:
- Extract ALL locations, buildings, and NPCs mentioned
- Include NPC schedules, dialogues, and relationships
- Map out scene connections and regions
- Specify NPC attributes, quests, and trade information
- Include accessibility and requirements
- If information is not available, use reasonable defaults
- Return ONLY JSON, no explanations`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);
  console.log('✅ World data extracted');
  return data;
}

/**
 * Save game data to separate JSON files
 * Each category is stored in its own file for easy management
 */
async function saveGameData(fileId, gameData) {
  console.log('💾 Saving game data files...');

  const files = {
    background: path.join(GAME_DATA_DIR, `background_${fileId}.json`),
    player: path.join(GAME_DATA_DIR, `player_${fileId}.json`),
    items: path.join(GAME_DATA_DIR, `items_${fileId}.json`),
    world: path.join(GAME_DATA_DIR, `world_${fileId}.json`),
    manifest: path.join(GAME_DATA_DIR, `manifest.json`)
  };

  try {
    // Save individual category files
    fs.writeFileSync(files.background, JSON.stringify({
      fileId,
      lastUpdated: new Date().toISOString(),
      data: gameData.backgroundData
    }, null, 2));

    fs.writeFileSync(files.player, JSON.stringify({
      fileId,
      lastUpdated: new Date().toISOString(),
      data: gameData.playerData
    }, null, 2));

    fs.writeFileSync(files.items, JSON.stringify({
      fileId,
      lastUpdated: new Date().toISOString(),
      data: gameData.itemData
    }, null, 2));

    fs.writeFileSync(files.world, JSON.stringify({
      fileId,
      lastUpdated: new Date().toISOString(),
      data: gameData.worldData
    }, null, 2));

    // Update manifest file
    let manifest = {};
    if (fs.existsSync(files.manifest)) {
      manifest = JSON.parse(fs.readFileSync(files.manifest, 'utf-8'));
    }

    manifest[fileId] = {
      createdAt: gameData.extractedAt,
      lastUpdated: new Date().toISOString(),
      files: {
        background: `background_${fileId}.json`,
        player: `player_${fileId}.json`,
        items: `items_${fileId}.json`,
        world: `world_${fileId}.json`
      }
    };

    fs.writeFileSync(files.manifest, JSON.stringify(manifest, null, 2));

    console.log('✅ All game data files saved successfully');
  } catch (error) {
    console.error('❌ Error saving game data files:', error);
    throw error;
  }
}

/**
 * Load game data for a session
 */
export function loadGameData(fileId) {
  console.log(`📂 Loading game data for file: ${fileId}`);

  try {
    const backgroundFile = path.join(GAME_DATA_DIR, `background_${fileId}.json`);
    const playerFile = path.join(GAME_DATA_DIR, `player_${fileId}.json`);
    const itemsFile = path.join(GAME_DATA_DIR, `items_${fileId}.json`);
    const worldFile = path.join(GAME_DATA_DIR, `world_${fileId}.json`);

    if (!fs.existsSync(backgroundFile) || !fs.existsSync(playerFile) ||
        !fs.existsSync(itemsFile) || !fs.existsSync(worldFile)) {
      console.log('⚠️ Game data files not found');
      return null;
    }

    const gameData = {
      fileId,
      backgroundData: JSON.parse(fs.readFileSync(backgroundFile, 'utf-8')).data,
      playerData: JSON.parse(fs.readFileSync(playerFile, 'utf-8')).data,
      itemData: JSON.parse(fs.readFileSync(itemsFile, 'utf-8')).data,
      worldData: JSON.parse(fs.readFileSync(worldFile, 'utf-8')).data
    };

    console.log('✅ Game data loaded successfully');
    return gameData;
  } catch (error) {
    console.error('❌ Error loading game data:', error);
    return null;
  }
}

/**
 * Update specific game data category
 */
export function updateGameData(fileId, category, updates) {
  console.log(`🔄 Updating ${category} data for file: ${fileId}`);

  const categoryFiles = {
    background: `background_${fileId}.json`,
    player: `player_${fileId}.json`,
    items: `items_${fileId}.json`,
    world: `world_${fileId}.json`
  };

  if (!categoryFiles[category]) {
    throw new Error(`Invalid category: ${category}`);
  }

  const filePath = path.join(GAME_DATA_DIR, categoryFiles[category]);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${categoryFiles[category]}`);
  }

  try {
    const currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Deep merge updates
    const updatedData = {
      ...currentData,
      lastUpdated: new Date().toISOString(),
      data: deepMerge(currentData.data, updates)
    };

    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
    console.log(`✅ ${category} data updated successfully`);

    return updatedData.data;
  } catch (error) {
    console.error(`❌ Error updating ${category} data:`, error);
    throw error;
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
    console.error('Failed to parse JSON:', error);
    console.error('Response text:', responseText.substring(0, 500));
    throw new Error('Failed to parse LLM response as JSON');
  }
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

/**
 * Helper function to update NPC data
 */
export function updateNPCData(fileId, npcId, updates) {
  const worldData = loadGameData(fileId).worldData;
  const npcIndex = worldData.npcs.findIndex(npc => npc.id === npcId);

  if (npcIndex === -1) {
    throw new Error(`NPC not found: ${npcId}`);
  }

  worldData.npcs[npcIndex] = { ...worldData.npcs[npcIndex], ...updates };
  return updateGameData(fileId, 'world', worldData);
}

/**
 * Helper function to add/remove items
 */
export function updatePlayerInventory(fileId, itemOperation) {
  const playerData = loadGameData(fileId).playerData;

  if (itemOperation.type === 'add') {
    playerData.inventory.items.push(itemOperation.item);
  } else if (itemOperation.type === 'remove') {
    const index = playerData.inventory.items.findIndex(
      item => item.id === itemOperation.itemId
    );
    if (index !== -1) {
      playerData.inventory.items.splice(index, 1);
    }
  }

  return updateGameData(fileId, 'player', playerData);
}

/**
 * Helper function to update player attributes
 */
export function updatePlayerAttributes(fileId, attributeUpdates) {
  const playerData = loadGameData(fileId).playerData;

  Object.keys(attributeUpdates).forEach(category => {
    if (playerData.characterAttributes[category]) {
      playerData.characterAttributes[category] = {
        ...playerData.characterAttributes[category],
        ...attributeUpdates[category]
      };
    }
  });

  return updateGameData(fileId, 'player', playerData);
}
