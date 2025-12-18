import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parseJSONFromResponse } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

// Directory for storing game data files
const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');
const GAME_SAVES_DIR = path.join(__dirname, '..', 'game_saves');

/**
 * Extract comprehensive game data from PDF using LLM
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

    console.log('✅ Game initialization data extracted and saved successfully');
    return gameData;
  } catch (error) {
    console.error('❌ Error extracting game initialization data:', error);
    throw error;
  }
}
/**
 * 1. Extract Background Data (背景数据)
 */
async function extractBackgroundData(pdfText) {
  console.log('📜 Extracting background data...');

  const prompt = `Extract background and lore information from this game content.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "worldBackground": {
    "title": "World/Setting name",
    "content": [
      "Extract world description from content"
    ]
  },
  "playerStory": {
    "title": "Player/Protagonist story title",
    "content": [
      "Extract player backstory from content"
    ]
  },
  "keyEvents": [
    {
      "title": "Event name",
      "year": "Year or time period",
      "description": "Event description"
    }
  ],
  "gameTime": {
    "yearName": "Name of the current era",
    "currentYear": 0,
    "currentMonth": 1,
    "currentDay": 1,
    "monthNames": ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
    "season": "Extract current season"
  }
}

IMPORTANT:
- Extract world background and setting information
- Include player/protagonist backstory and origin
- List key historical events that shape the world
- Determine current game time and calendar system
- If information is not available, use reasonable defaults but keep the structure
- Return ONLY JSON, no explanations
- All text content in the JSON must be in Chinese`;

  const message = await anthropic.messages.create({
    model: 'gpt-4.1-2025-04-14',
    max_tokens: 10000,
    messages: [{ role: 'user', content: prompt }]
  });

  // Handle both string and object responses (for custom API endpoints)
  let parsedMessage = message;
  if (typeof message === 'string') {
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error('❌ Failed to parse API response string:', e);
      throw new Error('Invalid JSON response from API');
    }
  }

  // Check if response has the expected structure
  if (!parsedMessage?.content?.[0]?.text) {
    console.error('❌ Invalid API response structure:', JSON.stringify(parsedMessage, null, 2));
    throw new Error('Invalid response from Claude API - no content received');
  }

  const responseText = parsedMessage.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);

  // Return the generated data directly
  console.log('✅ Background data extracted');
  return data;
}

/**
 * 2. Extract Player Data (玩家数据)
 */
async function extractPlayerData(pdfText) {
  console.log('👤 Extracting player data...');

  const prompt = `Extract player character data from this game content.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "profile": {
    "avatar": "data/avatars/player.png",
    "name": "Player name",
    "age": 18,
    "gender": "Gender",
    "job": "Player occupation/class"
  },
  "stats": {
    "stats_id1": 100,
    "stats_id2": 100,
    "stats_id3": 10,
    "stats_id4": 5,
    "stats_id5": 8
  },
  "currency": {
    "gold": 100
  },
  "inventory": {
    "items": [
      {
        "id": "item_id",
        "name": "Item name",
        "description": "Item description",
        "icon": "data/icons/item.png",
        "type": "consumable",
        "usable": true,
        "stackable": true,
        "effects": {
          "health": 50
        },
        "quantity": 1
      }
    ]
  }
}

IMPORTANT:
- Extract player name, age, gender, and occupation
- Set appropriate starting stats (health, attack, defense, etc.)
- Include starting gold/currency or other currency name
- Include starting inventory items (no equipment section)
- If information is not available, use reasonable defaults but keep the structure
- Return ONLY JSON, no explanations
- All text content in the JSON must be in Chinese`;

  const message = await anthropic.messages.create({
    model: 'gpt-4.1-2025-04-14',
    max_tokens: 10000,
    messages: [{ role: 'user', content: prompt }]
  });

  // Handle both string and object responses (for custom API endpoints)
  let parsedMessage = message;
  if (typeof message === 'string') {
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error('❌ Failed to parse API response string:', e);
      throw new Error('Invalid JSON response from API');
    }
  }

  // Check if response has the expected structure
  if (!parsedMessage?.content?.[0]?.text) {
    console.error('❌ Invalid API response structure:', JSON.stringify(parsedMessage, null, 2));
    throw new Error('Invalid response from Claude API - no content received');
  }

  const responseText = parsedMessage.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);

  // Return the generated data directly
  console.log('✅ Player data extracted');
  return data;
}

/**
 * 3. Extract Item Data (物品数据)
 */
async function extractItemData(pdfText) {
  console.log('🎒 Extracting item data...');

  const prompt = `Extract all items from this game content and return them as a simple key-value object.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "item_id_1": {
    "id": "item_id_1",
    "name": "Item name",
    "description": "Item description",
    "icon": "data/icons/item.png",
    "type": "consumable/armor/weapon/material/currency/etc",
    "usable": true,
    "stackable": true,
    "effects": {
      "health": 50
    }
  },
  "item_id_2": {
    "id": "item_id_2",
    "name": "Another item name",
    "description": "Another item description",
    "icon": "data/icons/item2.png",
    "type": "weapon",
    "equippable": true,
    "slots": ["rightHand"],
    "stats": {
      "attack": 8
    }
  }
}

IMPORTANT:
- Extract EVERY item mentioned in the PDF
- Use simple item IDs as keys (e.g., health_potion, iron_sword)
- Include basic properties: name, description, icon, type
- Add appropriate effects, stats, or equipment slots as needed
- For consumables, include effects like health, attack, etc.
- For equipment, include equippable, slots, and stats
- If information is not available, use reasonable defaults but keep the structure
- Return ONLY JSON object with item IDs as keys, no explanations
- All text content in the JSON must be in Chinese`;

  const message = await anthropic.messages.create({
    model: 'gpt-4.1-2025-04-14',
    max_tokens: 10000,
    messages: [{ role: 'user', content: prompt }]
  });

  // Handle both string and object responses (for custom API endpoints)
  let parsedMessage = message;
  if (typeof message === 'string') {
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error('❌ Failed to parse API response string:', e);
      throw new Error('Invalid JSON response from API');
    }
  }

  // Check if response has the expected structure
  if (!parsedMessage?.content?.[0]?.text) {
    console.error('❌ Invalid API response structure:', JSON.stringify(parsedMessage, null, 2));
    throw new Error('Invalid response from Claude API - no content received');
  }

  const responseText = parsedMessage.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);

  // Return the generated data directly
  console.log('✅ Item data extracted');
  return data;
}

/**
 * 4. Extract World Data (世界数据)
 */
async function extractWorldData(pdfText) {
  console.log('🌍 Extracting world data...');

  const prompt = `Extract world scenes and locations from this game content and return them as a simple key-value object.

CONTENT:
${pdfText}

Extract and return ONLY valid JSON in this format:
{
  "scene_id_1": {
    "id": "scene_id_1",
    "name": "Scene name",
    "description": "Scene description",
    "background": "data/scenes/scene.png",
    "buildings": [
      {
        "id": "building_id",
        "name": "Building name",
        "description": "Building description",
        "icon": "data/icons/building.png",
        "type": "shop/inn/temple/guild/etc",
        "eventId": "building_event",
        "features": ["Feature 1", "Feature 2"]
      }
    ],
    "npcs": [
      {
        "id": "npc_id",
        "name": "NPC name",
        "age": 30,
        "gender": "Gender",
        "job": "NPC occupation",
        "description": "NPC description",
        "icon": "data/avatars/npc.png",
        "type": "merchant/quest_giver/guard/etc",
        "eventId": "npc_event",
        "relationships": 10,
        "memory": [],
        "greetings": ["Hello there!", "Greetings, traveler.", "Nice to meet you."]
      }
    ],
    "events": ["event_id_1", "event_id_2"],
    "exits": {
      "north": "connected_scene_id",
      "south": "another_scene_id"
    }
  },
  "scene_id_2": {
    "id": "scene_id_2",
    "name": "Another scene name",
    "description": "Another scene description",
    "background": "data/scenes/scene2.png",
    "buildings": [],
    "npcs": [],
    "events": [],
    "exits": {}
  }
}

IMPORTANT:
- Extract ALL scenes and locations mentioned in the PDF
- The features in each building describe the activity that user could participate in this buildings. e.g. Buying stuff in the store.
- Each Scene should be connected to at least one other scene
- Use simple scene IDs as keys (e.g., village_square, forest_path)
- Include buildings, NPCs, events, and exits for each scene.
- Keep the structure simple and flat
- If information is not available, use empty arrays/objects but keep the structure
- Return ONLY JSON object with scene IDs as keys, no explanations
- All text content in the JSON must be in Chinese`;

  const message = await anthropic.messages.create({
    model: 'gpt-4.1-2025-04-14',
    max_tokens: 10000,
    messages: [{ role: 'user', content: prompt }]
  });

  // Handle both string and object responses (for custom API endpoints)
  let parsedMessage = message;
  if (typeof message === 'string') {
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error('❌ Failed to parse API response string:', e);
      throw new Error('Invalid JSON response from API');
    }
  }

  // Check if response has the expected structure
  if (!parsedMessage?.content?.[0]?.text) {
    console.error('❌ Invalid API response structure:', JSON.stringify(parsedMessage, null, 2));
    throw new Error('Invalid response from Claude API - no content received');
  }

  const responseText = parsedMessage.content[0].text.trim();
  const data = parseJSONFromResponse(responseText);

  // Post-process NPCs to ensure they all have memory field and generate greetings
  await generateNPCGreetings(data);

  // Return the generated data directly
  console.log('✅ World data extracted');
  return data;
}

/**
 * Generate personalized Chinese greetings for all NPCs using LLM
 */
async function generateNPCGreetings(worldData) {
  console.log('🗣️ Generating personalized Chinese greetings for NPCs...');

  const npcList = [];

  // Collect all NPCs from all scenes
  Object.values(worldData).forEach(scene => {
    if (scene.npcs && Array.isArray(scene.npcs)) {
      scene.npcs.forEach(npc => {
        npcList.push({
          npc,
          sceneName: scene.name,
          sceneId: Object.keys(worldData).find(key => worldData[key] === scene)
        });
      });
    }
  });

  if (npcList.length === 0) {
    console.log('⚠️ No NPCs found to generate greetings for');
    return;
  }

  console.log(`🤖 Generating greetings for ${npcList.length} NPCs...`);

  // Generate greetings for each NPC
  for (const { npc, sceneName } of npcList) {
    try {
      const greetings = await generateSingleNPCGreeting(npc, sceneName);
      npc.greetings = greetings;
      console.log(`✅ Generated greetings for ${npc.name}`);
    } catch (error) {
      console.error(`❌ Failed to generate greetings for ${npc.name}:`, error);
      // Fallback to basic Chinese greetings
      npc.greetings = [
        `你好！我是${npc.name}。`,
        `很高兴见到你。我是${npc.name}。`,
        `欢迎来到这里。我叫${npc.name}。`
      ];
    }
  }

  console.log('✅ All NPC greetings generated');
}

/**
 * Generate Chinese greetings for a single NPC using LLM
 */
export async function generateSingleNPCGreeting(npc, sceneName) {
  const prompt = `请为这个游戏中的NPC角色生成3句个性化的中文问候语。

NPC信息：
- 姓名：${npc.name}
- 年龄：${npc.age || '未知'}
- 性别：${npc.gender || '未知'}
- 职业：${npc.job || '未知'}
- 描述：${npc.description || '暂无描述'}
- 类型：${npc.type || '未知'}
- 所在场景：${sceneName}

要求：
1. 问候语必须是中文
2. 问候语要符合NPC的性格、职业和背景
3. 每句问候语都要包含NPC的姓名
4. 问候语要简短、自然、有个性
5. 避免重复的表达方式
6. 直接输出问候语，不要输出第三人称叙述。

正确示例：我是让·勒·迈格尔，只要给够钱，我的剑就是你的！那些念经的神棍可管不了我。
错误示例：老赫克托眯起仅剩的那只眼，低声道：\"又是你啊，朋友...在这城里，能活着见面可不容易。\"

请直接返回3句问候语，用换行符分隔，不要其他说明。`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  });

  const response = message.content[0].text.trim();
  const greetings = response.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Ensure we have exactly 3 greetings
  while (greetings.length < 3) {
    greetings.push(`你好！我是${npc.name}。`);
  }

  return greetings.slice(0, 3);
}

/**
 * Save game data to separate JSON files
 */
async function saveGameData(fileId, gameData) {
  console.log('💾 Saving game data files...');

  const files = {
    lore: path.join(GAME_DATA_DIR, `lore_${fileId}.json`),
    player: path.join(GAME_DATA_DIR, `player_${fileId}.json`),
    items: path.join(GAME_DATA_DIR, `items_${fileId}.json`),
    scenes: path.join(GAME_DATA_DIR, `scenes_${fileId}.json`),
    manifest: path.join(GAME_DATA_DIR, `manifest.json`)
  };
  
  try {
    fs.writeFileSync(files.lore, JSON.stringify(gameData.backgroundData, null, 2));
    fs.writeFileSync(files.player, JSON.stringify(gameData.playerData, null, 2));
    fs.writeFileSync(files.items, JSON.stringify(gameData.itemData, null, 2));
    fs.writeFileSync(files.scenes, JSON.stringify(gameData.worldData, null, 2));

    console.log('📝 Updating manifest file...');
    let manifest = {};
    if (fs.existsSync(files.manifest)) {
      manifest = JSON.parse(fs.readFileSync(files.manifest, 'utf-8'));
    }

    manifest[fileId] = {
      createdAt: gameData.extractedAt,
      lastUpdated: new Date().toISOString(),
      files: {
        lore: `lore_${fileId}.json`,
        player: `player_${fileId}.json`,
        items: `items_${fileId}.json`,
        scenes: `scenes_${fileId}.json`
        
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
 * Load game data for a session or fileId
 */
export function loadGameData(identifier, isSessionId = false) {
  console.log(`📂 Loading game data for ${isSessionId ? 'session' : 'file'}: ${identifier}`);

  try {
    let gameDir = GAME_DATA_DIR;
    let fileId = identifier;
    // If it's a sessionId, files are in a subdirectory
    if (isSessionId) {
      gameDir = path.join(GAME_DATA_DIR, identifier);
      // Check if session directory exists
      const sessionExists = fs.existsSync(path.join(gameDir, `lore_${identifier}.json`));

      if (!sessionExists) {
        // If session directory doesn't exist, but identifier exists in game_saves,
        // treat it as a file ID instead (fallback for incorrect usage)
        const savesDir = path.join(GAME_SAVES_DIR, identifier);
        if (fs.existsSync(savesDir)) {
          console.log(`⚠️ Session ${identifier} not found, but found in game_saves - treating as file ID`);
          return loadGameData(identifier, false);
        }
      }

      // Try to get fileId from manifest in session directory
      const manifestPath = path.join(gameDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (manifest.session?.sourceFileId) {
          fileId = manifest.session.sourceFileId;
        }
      }
    }

    const loreFile = path.join(gameDir, `lore_${identifier}.json`);
    const playerFile = path.join(gameDir, `player_${identifier}.json`);
    const itemsFile = path.join(gameDir, `items_${identifier}.json`);
    const scenesFile = path.join(gameDir, `scenes_${identifier}.json`);

    // Check if files exist in the session/fileId directory
    if (!fs.existsSync(loreFile) || !fs.existsSync(playerFile) ||
        !fs.existsSync(itemsFile) || !fs.existsSync(scenesFile)) {

      // If not found and not a session, try game_saves directory
      if (!isSessionId) {
        const savesDir = path.join(GAME_SAVES_DIR, identifier);
        if (fs.existsSync(savesDir)) {
          console.log(`📦 Found pre-processed game in game_saves/${identifier}`);
          return loadGameDataFromSaves(identifier);
        }
      }

      console.log('⚠️ Game data files not found');
      return null;
    }

    const gameData = {
      fileId: identifier,
      sourceFileId: fileId,
      isSession: isSessionId,
      backgroundData: JSON.parse(fs.readFileSync(loreFile, 'utf-8')),
      playerData: JSON.parse(fs.readFileSync(playerFile, 'utf-8')),
      itemData: JSON.parse(fs.readFileSync(itemsFile, 'utf-8')),
      worldData: JSON.parse(fs.readFileSync(scenesFile, 'utf-8'))
    };

    return gameData;
  } catch (error) {
    console.error('❌ Error loading game data:', error);
    return null;
  }
}
/**
 * Load game data from game_saves directory
 */
function loadGameDataFromSaves(fileId) {
  console.log(`📦 Loading from game_saves: ${fileId}`);

  try {
    const saveDir = path.join(GAME_SAVES_DIR, fileId);

    const loreFile = path.join(saveDir, `lore_${fileId}.json`);
    const playerFile = path.join(saveDir, `player_${fileId}.json`);
    const itemsFile = path.join(saveDir, `items_${fileId}.json`);
    const scenesFile = path.join(saveDir, `scenes_${fileId}.json`);

    if (!fs.existsSync(loreFile) || !fs.existsSync(playerFile) ||
        !fs.existsSync(itemsFile) || !fs.existsSync(scenesFile)) {
      console.log('⚠️ Game save files not found');
      return null;
    }

    const gameData = {
      fileId,
      sourceFileId: fileId,
      isPreProcessed: true,
      backgroundData: JSON.parse(fs.readFileSync(loreFile, 'utf-8')),
      playerData: JSON.parse(fs.readFileSync(playerFile, 'utf-8')),
      itemData: JSON.parse(fs.readFileSync(itemsFile, 'utf-8')),
      worldData: JSON.parse(fs.readFileSync(scenesFile, 'utf-8'))
    };

    console.log('✅ Game data loaded from saves');
    return gameData;
  } catch (error) {
    console.error('❌ Error loading game data from saves:', error);
    return null;
  }
}
/**
 * Copy uploaded PDF game files from root game_data to session directory
 */
export function copyUploadedGameToSession(fileId, sessionId) {
  console.log(`📦 Copying uploaded game ${fileId} to session ${sessionId}...`);

  try {
    const sourceDir = GAME_DATA_DIR;
    const targetDir = path.join(GAME_DATA_DIR, sessionId);

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy JSON files from root game_data to session directory
    const jsonFiles = [
      `player_${fileId}.json`,
      `lore_${fileId}.json`,
      `items_${fileId}.json`,
      `scenes_${fileId}.json`
    ];

    jsonFiles.forEach(fileName => {
      const sourcePath = path.join(sourceDir, fileName);
      if (fs.existsSync(sourcePath)) {
        const fileType = fileName.split('_')[0];
        const targetFileName = `${fileType}_${sessionId}.json`;
        const targetPath = path.join(targetDir, targetFileName);
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`  ✓ Copied ${fileName} -> ${targetFileName}`);
      } else {
        console.warn(`  ⚠️ Source file not found: ${fileName}`);
      }
    });

    // Create manifest with session info
    const manifestTarget = path.join(targetDir, 'manifest.json');
    const manifest = {
      session: {
        sessionId,
        sourceFileId: fileId,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };

    fs.writeFileSync(manifestTarget, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ Created manifest with session info`);

    // Copy images directory if it exists in the root (from image generation)
    // Images are stored in game_data/images/{fileId}/
    const sourceImagesDir = path.join(sourceDir, 'images', fileId);
    const targetImagesDir = path.join(targetDir, 'images');

    if (fs.existsSync(sourceImagesDir)) {
      copyDirectoryRecursive(sourceImagesDir, targetImagesDir);
      console.log(`  ✓ Copied images directory`);
    }

    console.log(`✅ Successfully copied uploaded game to session ${sessionId}`);
    return {
      sessionId,
      sourceFileId: fileId,
      targetDir
    };
  } catch (error) {
    console.error(`❌ Error copying uploaded game to session:`, error);
    throw error;
  }
}

/**
 * Copy game files from game_saves to session directory
 */
export function copyGameToSession(fileId, sessionId) {
  console.log(`📦 Copying game ${fileId} to session ${sessionId}...`);

  try {
    const sourceDir = path.join(GAME_SAVES_DIR, fileId);
    const targetDir = path.join(GAME_DATA_DIR, sessionId);

    // Check if source exists
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Pre-processed game not found: ${fileId}`);
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy JSON files
    const jsonFiles = [
      `player_${fileId}.json`,
      `lore_${fileId}.json`,
      `items_${fileId}.json`,
      `scenes_${fileId}.json`
    ];

    jsonFiles.forEach(fileName => {
      const sourcePath = path.join(sourceDir, fileName);
      if (fs.existsSync(sourcePath)) {
        const fileType = fileName.split('_')[0];
        const targetFileName = `${fileType}_${sessionId}.json`;
        const targetPath = path.join(targetDir, targetFileName);
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`  ✓ Copied ${fileName} -> ${targetFileName}`);
      }
    });

    // Copy manifest
    const manifestSource = path.join(sourceDir, 'manifest.json');
    if (fs.existsSync(manifestSource)) {
      const manifestTarget = path.join(targetDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestSource, 'utf-8'));

      // Add session info to manifest
      manifest.session = {
        sessionId,
        sourceFileId: fileId,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(manifestTarget, JSON.stringify(manifest, null, 2));
      console.log(`  ✓ Created manifest with session info`);
    }

    // Copy images directory recursively
    const sourceImagesDir = path.join(sourceDir, 'images');
    const targetImagesDir = path.join(targetDir, 'images');

    if (fs.existsSync(sourceImagesDir)) {
      copyDirectoryRecursive(sourceImagesDir, targetImagesDir);
      console.log(`  ✓ Copied images directory`);
    }

    // Also check for top-level image directories (scenes, avatars, icons)
    ['scenes', 'avatars', 'icons'].forEach(dirName => {
      const sourceDirPath = path.join(sourceDir, dirName);
      if (fs.existsSync(sourceDirPath)) {
        const targetDirPath = path.join(targetDir, 'images', dirName);
        if (!fs.existsSync(path.dirname(targetDirPath))) {
          fs.mkdirSync(path.dirname(targetDirPath), { recursive: true });
        }
        copyDirectoryRecursive(sourceDirPath, targetDirPath);
        console.log(`  ✓ Copied ${dirName} directory`);
      }
    });

    console.log(`✅ Successfully copied game to session ${sessionId}`);
    return {
      sessionId,
      sourceFileId: fileId,
      targetDir
    };
  } catch (error) {
    console.error(`❌ Error copying game to session:`, error);
    throw error;
  }
}
/**
 * Helper function to recursively copy directories
 */
function copyDirectoryRecursive(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source, { withFileTypes: true });

  files.forEach(file => {
    const sourcePath = path.join(source, file.name);
    const targetPath = path.join(target, file.name);

    if (file.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}

