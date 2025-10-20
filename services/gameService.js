import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { prepareGameSettingsForLLM } from './gameSettingsService.js';
import {
  initializeStatus,
  loadStatus,
  saveStatus,
  applyClaudeUpdates,
  getStatusUpdatePrompt,
  updateStatus,
  extractActionOptions
} from './statusService.js';
import { analyzeAndUpdateGameData } from './gameDataUpdateService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Claude client
console.log('🔍 GameService Environment Variables:');
console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'SET' : 'NOT SET');
console.log('CLAUDE_BASE_URL:', process.env.CLAUDE_BASE_URL || 'NOT SET');

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

// Store game sessions in memory (in production, use Redis or database)
const gameSessions = new Map();
const fileGameSettings = new Map(); // Store processed game settings by fileId

export const createGameSession = async (sessionId, fileId, playerName = 'Player') => {
  console.log('\n=== 🎮 CREATE GAME SESSION ===');
  console.log('Session ID:', sessionId);
  console.log('File ID:', fileId);
  console.log('Player Name:', playerName);

  let gameSettings = fileGameSettings.get(fileId);

  // Try to load from disk if not in memory
  if (!gameSettings) {
    gameSettings = loadGameSettings(fileId);
    if (gameSettings) {
      fileGameSettings.set(fileId, gameSettings);
    } else {
      throw new Error('Game settings not found. Please process a PDF file first.');
    }
  }

  // Initialize character status with PDF attributes
  const initialAttributes = gameSettings.initialAttributes || {};
  const initialItems = gameSettings.initialItems || [];

  console.log('📊 Initial attributes from PDF:', initialAttributes);
  console.log('🎒 Initial items from PDF:', initialItems);

  // Initialize character status with PDF data
  const characterStatus = initializeStatus(sessionId, initialAttributes);

  // Update character name
  characterStatus.character.name = playerName;

  // Add initial items to inventory
  initialItems.forEach(item => {
    const itemWithId = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: item.name,
      description: item.description,
      quantity: item.quantity || 1,
      value: item.value || 0,
      addedAt: new Date().toISOString(),
      ...item
    };
    characterStatus.inventory.push(itemWithId);
  });

  saveStatus(sessionId, characterStatus);
  console.log('✅ Character status initialized and saved');

  const session = {
    sessionId,
    fileId,
    playerName,
    gameSettings,
    characterStatus, // Add status to session
    gameState: {
      currentLocation: 'start',
      inventory: [],
      progress: {},
      flags: {},
      health: 100,
      createdAt: new Date().toISOString(),
      isInitialized: false
    },
    history: [],
    conversationHistory: [] // Store Claude conversation history
  };

  gameSessions.set(sessionId, session);

  // Persist session to allow recovery
  saveSessionMetadata(sessionId, {
    fileId,
    playerName,
    createdAt: new Date().toISOString(),
    isInitialized: false,
    conversationHistory: []
  });

  return session;
};

export const processPlayerAction = async (sessionId, action) => {
  let session = gameSessions.get(sessionId);
  
  // Try to recover session if not found in memory
  if (!session) {
    session = recoverSession(sessionId);
    if (!session) {
      throw new Error('Session not found. Please start a new game.');
    }
  }

  // Check if this is a game initialization command
  const initCommands = ['start game', '开始游戏', 'start', '开始'];
  const isInitCommand = initCommands.some(cmd => 
    action.toLowerCase().trim() === cmd.toLowerCase()
  );

  if (isInitCommand && !session.gameState.isInitialized) {
    // Initialize the game with Claude
    const response = await initializeGameWithClaude(session);
    
    session.gameState.isInitialized = true;
    session.history.push({
      type: 'player',
      message: action,
      timestamp: new Date().toISOString()
    });
    session.history.push({
      type: 'game',
      message: response.message,
      timestamp: new Date().toISOString()
    });

    // Parse and apply status updates from initial response
    const updatedStatus = await applyClaudeUpdates(sessionId, response.message);
    session.characterStatus = updatedStatus;

    // Extract action options for initial response
    const actionOptions = extractActionOptions(response.message);

    // Update structured game data files (NEW - Initial game state)
    await analyzeAndUpdateGameData(session.fileId, sessionId, response.message, action);

    // Persist the initialized state and conversation history
    saveSessionMetadata(sessionId, {
      fileId: session.fileId,
      playerName: session.playerName,
      createdAt: session.gameState.createdAt,
      isInitialized: true,
      conversationHistory: session.conversationHistory
    });

    return {
      response: response.message,
      gameState: session.gameState,
      characterStatus: updatedStatus,
      actionOptions,
      isInitialized: true
    };
  }

  if (!session.gameState.isInitialized) {
    return {
      response: 'Please start the game first by typing "start game" or "开始游戏"',
      gameState: session.gameState,
      isInitialized: false
    };
  }

  // Add player action to history
  session.history.push({
    type: 'player',
    message: action,
    timestamp: new Date().toISOString()
  });

  // Generate response using Claude
  const response = await generateGameResponse(session, action);

  // Add response to history
  session.history.push({
    type: 'game',
    message: response.message,
    timestamp: new Date().toISOString()
  });

  // Update game state based on action
  updateGameState(session, action, response);

  // Parse and apply status updates from Claude's response (now async)
  const updatedStatus = await applyClaudeUpdates(sessionId, response.message);
  session.characterStatus = updatedStatus;

  // Extract action options for the frontend to render as buttons
  const actionOptions = extractActionOptions(response.message);

  // Update structured game data files (NEW - Update background/player/items/world JSON files)
  await analyzeAndUpdateGameData(session.fileId, sessionId, response.message, action);

  // Persist the conversation history after each action
  saveSessionMetadata(sessionId, {
    fileId: session.fileId,
    playerName: session.playerName,
    createdAt: session.gameState.createdAt,
    isInitialized: true,
    conversationHistory: session.conversationHistory
  });

  return {
    response: response.message,
    gameState: session.gameState,
    characterStatus: updatedStatus,
    actionOptions
  };
};

export const getSession = (sessionId) => {
  return gameSessions.get(sessionId);
};

export const storeGameSettings = (fileId, gameSettings) => {
  fileGameSettings.set(fileId, gameSettings);
};

/**
 * Persist game settings to disk
 */
export const persistGameSettings = (fileId, gameSettings) => {
  const settingsPath = path.join(__dirname, '..', 'game_saves', `settings_${fileId}.json`);
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(gameSettings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error persisting game settings:', error);
  }
};

/**
 * Load game settings from disk
 */
export const loadGameSettings = (fileId) => {
  const settingsPath = path.join(__dirname, '..', 'game_saves', `settings_${fileId}.json`);
  if (fs.existsSync(settingsPath)) {
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading game settings:', error);
      return null;
    }
  }
  return null;
};

/**
 * Initialize game with Claude API
 */
async function initializeGameWithClaude(session) {
  try {
    const gamePrompt = prepareGameSettingsForLLM(session.gameSettings);
    const status = loadStatus(session.sessionId);
    const statusPrompt = getStatusUpdatePrompt(status);
    
    const systemPrompt = `你是一个专业的互动小说游戏主持人（Game Master）。你将基于以下PDF文档中的设定来主持一个互动小说游戏。

游戏设定内容：
${gamePrompt}

${statusPrompt}

你的职责：
1. 严格遵循PDF中提供的所有设定、规则和框架
2. 根据PDF要求生成相应的可视化板块和模块（如人物面板、时间、地点、热搜等）
3. 用生动、细腻的文笔描述剧情，营造沉浸式体验
4. 根据玩家的选择和行动推进剧情发展
5. 支持中英文双语交互
6. 保持剧情连贯性和逻辑性
7. 当游戏事件影响角色状态时，在回复中包含状态更新标记

**重要：行动选项格式规范**
在每次回复的结尾，你必须提供玩家可以选择的行动选项。
使用以下特殊格式来标记行动选项（每个选项独占一行）：

[ACTION: 选项描述文本]

示例：
[ACTION: 探索神秘的森林深处]
[ACTION: 与村长交谈了解更多信息]
[ACTION: 在旅馆休息恢复体力]

注意：
- 每个行动选项必须使用 [ACTION: ...] 格式
- 每个选项独占一行
- 通常提供3-5个选项
- 选项要具体、可操作
- 不要在其他地方使用这个格式

现在，请根据PDF设定，开始这个互动小说游戏。请：
1. 展示初始设定（时间、地点、相关信息板块等）
2. 介绍游戏背景和当前情境
3. 给玩家提供可选的行动选项（使用[ACTION: ...]格式）

请用中文回复，语言要生动有趣。`;

    const message = await anthropic.messages.create({
      model: 'deepseek-chat',
      max_tokens: 10000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: '开始游戏！请展示初始设定并开始剧情。'
        }
      ]
    });

    const responseText = message.content[0].text;
    
    // Store conversation in session
    session.conversationHistory = [
      {
        role: 'user',
        content: '开始游戏！请展示初始设定并开始剧情。'
      },
      {
        role: 'assistant',
        content: responseText
      }
    ];
    
    return {
      message: responseText,
      metadata: {
        model: message.model,
        usage: message.usage
      }
    };
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Failed to initialize game with Claude: ${error.message}`);
  }
}

/**
 * Generate game response using Claude API
 */
async function generateGameResponse(session, action) {
  try {
    const gamePrompt = prepareGameSettingsForLLM(session.gameSettings);
    const status = loadStatus(session.sessionId);
    const statusPrompt = getStatusUpdatePrompt(status);
    
    const systemPrompt = `你是一个专业的互动小说游戏主持人（Game Master）。你正在主持一个基于以下设定的互动小说游戏。

游戏设定内容：
${gamePrompt}

${statusPrompt}

你的职责：
1. 严格遵循PDF中提供的所有设定、规则和框架
2. 根据PDF要求生成相应的可视化板块和模块
3. 根据玩家的行动推进剧情
4. 保持剧情的连贯性和逻辑性
5. 用生动、细腻的文笔描述场景和事件
6. 支持中英文双语交互
7. 当游戏事件影响角色状态时（如战斗受伤、获得物品、花费金钱、移动位置等），在回复中包含状态更新标记

**重要：行动选项格式规范**
在每次回复的结尾，你必须提供玩家可以选择的行动选项。
使用以下特殊格式来标记行动选项（每个选项独占一行）：

[ACTION: 选项描述文本]

示例：
[ACTION: 探索神秘的森林深处]
[ACTION: 与村长交谈了解更多信息]
[ACTION: 在旅馆休息恢复体力]

注意：
- 每个行动选项必须使用 [ACTION: ...] 格式
- 每个选项独占一行
- 通常提供3-5个选项
- 选项要具体、可操作
- 不要在其他地方使用这个格式
- 即使使用编号列表描述情况，行动选项也必须使用 [ACTION: ...] 格式

请根据玩家的行动，继续推进游戏剧情。`;

    // Build conversation history for Claude
    const messages = [...session.conversationHistory];
    
    // Add current action
    messages.push({
      role: 'user',
      content: action
    });

    const message = await anthropic.messages.create({
      model: 'deepseek-chat',
      max_tokens: 10000,
      system: systemPrompt,
      messages: messages
    });

    const responseText = message.content[0].text;

    // Update conversation history
    session.conversationHistory = messages;
    session.conversationHistory.push({
      role: 'assistant',
      content: responseText
    });

    // Keep conversation history manageable (last 20 messages)
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }

    return {
      message: responseText,
      metadata: {
        model: message.model,
        usage: message.usage
      }
    };
  } catch (error) {
    console.error('Claude API error:', error);
    
    // Provide helpful error message
    if (error.message.includes('api_key')) {
      throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY in .env file');
    }
    
    throw new Error(`Failed to generate response: ${error.message}`);
  }
}

/**
 * Update game state based on action and response
 */
function updateGameState(session, action, response) {
  // Update game state logic
  // This would be driven by the LLM response or game rules
  
  const lowerAction = action.toLowerCase();
  
  // Example: Simple item pickup detection
  if (lowerAction.includes('pick up') || lowerAction.includes('take')) {
    const itemMatch = lowerAction.match(/(?:pick up|take)\s+(.+)/);
    if (itemMatch) {
      const item = itemMatch[1].trim();
      if (!session.gameState.inventory.includes(item)) {
        session.gameState.inventory.push(item);
      }
    }
  }
  
  // Example: Location changes
  if (lowerAction.includes('go to') || lowerAction.includes('move to')) {
    const locationMatch = lowerAction.match(/(?:go to|move to)\s+(.+)/);
    if (locationMatch) {
      session.gameState.currentLocation = locationMatch[1].trim();
    }
  }
  
  // Update last action timestamp
  session.gameState.lastAction = new Date().toISOString();
}

// Export updateGameState function
export { updateGameState };

/**
 * Save session metadata for recovery
 */
function saveSessionMetadata(sessionId, metadata) {
  const metaPath = path.join(__dirname, '..', 'game_saves', `${sessionId}_meta.json`);
  try {
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving session metadata:', error);
  }
}

/**
 * Load session metadata
 */
function loadSessionMetadata(sessionId) {
  const metaPath = path.join(__dirname, '..', 'game_saves', `${sessionId}_meta.json`);
  if (fs.existsSync(metaPath)) {
    try {
      const data = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading session metadata:', error);
      return null;
    }
  }
  return null;
}

/**
 * Recover session from status file if session lost from memory
 */
function recoverSession(sessionId) {
  const metadata = loadSessionMetadata(sessionId);
  const characterStatus = loadStatus(sessionId);
  
  if (!metadata || !characterStatus) {
    return null;
  }
  
  let gameSettings = fileGameSettings.get(metadata.fileId);
  // Try to load from disk if not in memory
  if (!gameSettings) {
    gameSettings = loadGameSettings(metadata.fileId);
    if (gameSettings) {
      fileGameSettings.set(metadata.fileId, gameSettings);
    } else {
      return null;
    }
  }
  
  const session = {
    sessionId,
    fileId: metadata.fileId,
    playerName: metadata.playerName || 'Player',
    gameSettings,
    characterStatus,
    gameState: {
      currentLocation: characterStatus.location || 'start',
      inventory: characterStatus.inventory || [],
      progress: {},
      flags: characterStatus.flags || {},
      health: characterStatus.character?.health || 100,
      createdAt: metadata.createdAt,
      isInitialized: metadata.isInitialized || false // Load from metadata
    },
    history: [],
    conversationHistory: metadata.conversationHistory || [] // Load from metadata
  };
  
  gameSessions.set(sessionId, session);
  return session;
}

/**
 * Get character status for a session
 */
export const getCharacterStatus = (sessionId) => {
  return loadStatus(sessionId);
};

/**
 * Update character status manually
 */
export const updateCharacterStatus = (sessionId, updates) => {
  return updateStatus(sessionId, updates);
};

/**
 * Initialize game with Claude using streaming mode
 */
export async function initializeGameWithClaudeStreaming(session) {
  try {
    const gamePrompt = prepareGameSettingsForLLM(session.gameSettings);
    const status = loadStatus(session.sessionId);
    const statusPrompt = getStatusUpdatePrompt(status);
    
    const systemPrompt = `你是一个专业的互动小说游戏主持人（Game Master）。你将基于以下PDF文档中的设定来主持一个互动小说游戏。

游戏设定内容：
${gamePrompt}

${statusPrompt}

你的职责：
1. 严格遵循PDF中提供的所有设定、规则和框架
2. 根据PDF要求生成相应的可视化板块和模块（如人物面板、时间、地点、热搜等）
3. 用生动、细腻的文笔描述剧情，营造沉浸式体验
4. 根据玩家的选择和行动推进剧情发展
5. 支持中英文双语交互
6. 保持剧情连贯性和逻辑性
7. 当游戏事件影响角色状态时，在回复中包含状态更新标记

**重要：行动选项格式规范**
在每次回复的结尾，你必须提供玩家可以选择的行动选项。
使用以下特殊格式来标记行动选项（每个选项独占一行）：

[ACTION: 选项描述文本]

示例：
[ACTION: 探索神秘的森林深处]
[ACTION: 与NPC对话获取信息]
[ACTION: 在旅馆休息恢复体力]

注意：
- 每个行动选项必须使用 [ACTION: ...] 格式
- 每个选项独占一行
- 通常提供3-5个选项
- 选项要具体、可操作
- 不要在其他地方使用这个格式

现在，请根据PDF设定，开始这个互动小说游戏。请：
1. 展示初始设定（时间、地点、相关信息板块等）
2. 介绍游戏背景和当前情境
3. 给玩家提供可选的行动选项（使用[ACTION: ...]格式）

请用中文回复，语言要生动有趣。`;

    // 使用流式模式
    const stream = await anthropic.messages.create({
      model: 'deepseek-chat',
      max_tokens: 10000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: '开始游戏！请展示初始设定并开始剧情。'
        }
      ],
      stream: true  // 启用流式模式
    });

    let fullResponse = '';
    
    // 处理流式响应
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        fullResponse += chunk.delta.text;
      }
    }

    // 解析响应
    const response = {
      message: fullResponse
    };
    
    // Store conversation in session
    session.conversationHistory = [
      {
        role: 'user',
        content: '开始游戏！请展示初始设定并开始剧情。'
      },
      {
        role: 'assistant',
        content: fullResponse
      }
    ];
    
    // Update game state based on action
    updateGameState(session, '开始游戏', response);
    
    // Parse and apply status updates from Claude's response
    const updatedStatus = await applyClaudeUpdates(session.sessionId, response.message);
    session.characterStatus = updatedStatus;

    // Extract action options for the frontend to render as buttons
    const actionOptions = extractActionOptions(response.message);
    
    return {
      response: response.message,
      gameState: session.gameState,
      characterStatus: updatedStatus,
      actionOptions
    };
    
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Failed to initialize game with Claude: ${error.message}`);
  }
}

/**
 * Process player action with Claude using streaming mode
 */
export async function processPlayerActionStreaming(sessionId, action) {
  try {
    const session = getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const status = loadStatus(sessionId);
    const statusPrompt = getStatusUpdatePrompt(status);
    
    const systemPrompt = `你是一个专业的互动小说游戏主持人（Game Master）。你将基于以下PDF文档中的设定来主持一个互动小说游戏。

游戏设定内容：
${prepareGameSettingsForLLM(session.gameSettings)}

${statusPrompt}

你的职责：
1. 严格遵循PDF中提供的所有设定、规则和框架
2. 根据PDF要求生成相应的可视化板块和模块（如人物面板、时间、地点、热搜等）
3. 用生动、细腻的文笔描述剧情，营造沉浸式体验
4. 根据玩家的选择和行动推进剧情发展
5. 支持中英文双语交互
6. 保持剧情连贯性和逻辑性
7. 当游戏事件影响角色状态时，在回复中包含状态更新标记

**重要：行动选项格式规范**
在每次回复的结尾，你必须提供玩家可以选择的行动选项。
使用以下特殊格式来标记行动选项（每个选项独占一行）：

[ACTION: 选项描述文本]

示例：
[ACTION: 探索神秘的森林深处]
[ACTION: 与NPC对话获取信息]
[ACTION: 在旅馆休息恢复体力]

注意：
- 每个行动选项必须使用 [ACTION: ...] 格式
- 每个选项独占一行
- 通常提供3-5个选项
- 选项要具体、可操作
- 不要在其他地方使用这个格式

请用中文回复，语言要生动有趣。`;

    // Build conversation history for Claude (same as original implementation)
    const messages = [...session.conversationHistory];
    
    // Add current action
    messages.push({
      role: 'user',
      content: action
    });

    // 使用流式模式
    const stream = await anthropic.messages.create({
      model: 'deepseek-chat',
      max_tokens: 10000,
      system: systemPrompt,
      messages: messages,
      stream: true  // 启用流式模式
    });

    let fullResponse = '';
    
    // 处理流式响应
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        fullResponse += chunk.delta.text;
      }
    }

    // 解析响应
    const response = {
      message: fullResponse
    };
    
    // Update conversation history (same as original implementation)
    session.conversationHistory.push({
      role: 'user',
      content: action
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: response.message
    });

    // Keep conversation history manageable (last 20 messages)
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
    
    // Update game state based on action
    updateGameState(session, action, response);
    
    // Parse and apply status updates from Claude's response
    const updatedStatus = await applyClaudeUpdates(sessionId, response.message);
    session.characterStatus = updatedStatus;

    // Extract action options for the frontend to render as buttons
    const actionOptions = extractActionOptions(response.message);
    
    return {
      response: response.message,
      gameState: session.gameState,
      characterStatus: updatedStatus,
      actionOptions
    };
    
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Failed to process action with Claude: ${error.message}`);
  }
}

