import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
// import { parseJSONFromResponse } from '../utils/utils.js';
import { fileURLToPath } from 'url';
import { loadGameData } from './gameInitializationService.js';
import { getStyleInstructions, getDefaultStyle } from './literaryStyleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

const MODEL_NAME = 'claude-sonnet-4-5-20250929';
const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');

// Store active chat sessions in memory
const chatSessions = new Map();

/**
 * Update NPC memories with plot information when NPCs are mentioned in main story
 */
async function updateNPCMemoriesWithPlot(sessionId, plotResponse) {
  try {
    // Load game data to get NPC information
    const gameData = loadGameData(sessionId, true) || loadGameData(sessionId, false);
    if (!gameData || !gameData.worldData) {
      return;
    }

    // Get all NPCs from all scenes
    const allNPCs = [];
    Object.values(gameData.worldData).forEach(scene => {
      if (scene.npcs && Array.isArray(scene.npcs)) {
        allNPCs.push(...scene.npcs);
      }
    });

    // Find NPCs mentioned in the plot response
    const mentionedNPCs = [];
    allNPCs.forEach(npc => {
      // Check if NPC name is mentioned in the plot response
      if (plotResponse.includes(npc.name)) {
        mentionedNPCs.push(npc);
      }
    });

    if (mentionedNPCs.length === 0) {
      return; // No NPCs mentioned, nothing to do
    }

    // Load scenes data to update memories
    const scenesPath = path.join(GAME_DATA_DIR, sessionId, `scenes_${sessionId}.json`);
    const scenesData = JSON.parse(await fs.readFile(scenesPath, 'utf-8'));

    // Process each mentioned NPC
    for (const npc of mentionedNPCs) {
      // Create a summary prompt for the plot context
      const summaryPrompt = `请总结以下剧情内容中与${npc.name}相关的信息，作为NPC的记忆使用。

剧情内容：
${plotResponse}

请提取与${npc.name}相关的关键信息，包括：
- ${npc.name}的行为和表现
- 涉及${npc.name}的事件或对话
- ${npc.name}与玩家或其他角色的互动
- 任何影响${npc.name}的故事发展

总结应该简洁、有针对性，直接描述相关事件（直接给出总结内容，不要其他说明）：`;

      // Call Claude to summarize the plot context
      const summaryResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 150,
        messages: [{ role: 'user', content: summaryPrompt }]
      });

      const summary = summaryResponse.content[0].text.trim();

      // Find and update the NPC in scenes data
      let npcUpdated = false;
      for (const scene of Object.values(scenesData)) {
        if (scene.npcs) {
          const sceneNpc = scene.npcs.find(n => n.id === npc.id || n.name === npc.name);
          if (sceneNpc) {
            // Initialize memory array if it doesn't exist
            if (!sceneNpc.memory) {
              sceneNpc.memory = [];
            }

            // Add game time to the summary instead of real timestamp
            const gameTime = gameData.backgroundData.gameTime;
            const gameTimeString = `${gameTime.yearName}${gameTime.currentYear}年${gameTime.currentMonth}月${gameTime.currentDay}日`;
            const timestampedSummary = `${gameTimeString} [剧情]: ${summary}`;

            // Add to memory (keep only last 10 memories to avoid overflow)
            sceneNpc.memory.push(timestampedSummary);
            if (sceneNpc.memory.length > 10) {
              sceneNpc.memory = sceneNpc.memory.slice(-10);
            }

            npcUpdated = true;
            console.log(`📖 Updated plot memory for NPC ${npc.name}: ${summary.substring(0, 50)}...`);
            break;
          }
        }
      }

      if (!npcUpdated) {
        console.warn(`Could not update memory for NPC ${npc.name} - not found in scenes data`);
      }
    }

    // Save updated scenes data
    await fs.writeFile(scenesPath, JSON.stringify(scenesData, null, 2), 'utf-8');

  } catch (error) {
    console.error('Error updating NPC plot memories:', error);
    // Don't throw error - memory update is not critical to game flow
  }
}

async function getOrCreateChatSession(sessionId, npcId) {
  const chatKey = `${sessionId}_${npcId}`;

  if (chatSessions.has(chatKey)) {
    return chatSessions.get(chatKey);
  }

  // Create new chat session
  const chatSession = {
    sessionId,
    npcId,
    chatHistory: [],
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  };

  // Try to load existing chat history from file (in session directory)
  try {
    const historyPath = path.join(__dirname, '../public/game_data', sessionId, `npc_chat_${sessionId}_${npcId}.json`);
    const historyData = await fs.readFile(historyPath, 'utf-8');
    const savedHistory = JSON.parse(historyData);
    chatSession.chatHistory = savedHistory.chatHistory || [];
    chatSession.createdAt = savedHistory.createdAt || chatSession.createdAt;
  } catch (error) {
    // No existing history, start fresh
    console.log(`No existing chat history for ${chatKey}, starting new conversation`);
  }

  chatSessions.set(chatKey, chatSession);
  return chatSession;
}


async function saveChatHistory(sessionId, npcId, chatSession) {
  const sessionDir = path.join(__dirname, '../public/game_data', sessionId);
  const historyPath = path.join(sessionDir, `npc_chat_${sessionId}_${npcId}.json`);

  const historyData = {
    sessionId,
    npcId,
    createdAt: chatSession.createdAt,
    lastMessageAt: chatSession.lastMessageAt,
    chatHistory: chatSession.chatHistory,
    messageCount: chatSession.chatHistory.length,
  };

  await fs.writeFile(historyPath, JSON.stringify(historyData, null, 2), 'utf-8');
}

async function loadNPCData(sessionId, npcId) {
  const scenesPath = path.join(__dirname, '../public/game_data', sessionId, `scenes_${sessionId}.json`);
  const scenesData = JSON.parse(await fs.readFile(scenesPath, 'utf-8'));

  // Search for NPC in all scenes
  for (const scene of Object.values(scenesData)) {
    if (scene.npcs) {
      const npc = scene.npcs.find(n => n.id === npcId || n.name === npcId);
      if (npc) {
        return {
          ...npc,
          sceneName: scene.name,
          sceneDescription: scene.description,
        };
      }
    }
  }

  throw new Error(`NPC ${npcId} not found in game data`);
}


async function loadPlayerData(sessionId) {
  const playerPath = path.join(__dirname, '../public/game_data', sessionId, `player_${sessionId}.json`);
  const playerData = JSON.parse(await fs.readFile(playerPath, 'utf-8'));
  return playerData;
}


async function loadLoreData(sessionId) {
  const lorePath = path.join(__dirname, '../public/game_data', sessionId, `lore_${sessionId}.json`);
  const loreData = JSON.parse(await fs.readFile(lorePath, 'utf-8'));
  return loreData;
}


function buildNPCChatSystemPrompt(npcData, playerData, loreData, currentRelationship, sessionId, literaryStyle) {
  // Get literary style instructions
  const styleInstructions = getStyleInstructions(literaryStyle || getDefaultStyle());

  const prompt = `你是一个互动小说游戏中的NPC角色：${npcData.name}。你正在与玩家进行对话。

# 重要规则
1. **你只能以 ${npcData.name} 的身份回复**，不要提供选项或游戏提示
2. **这是角色对话，不会推进主线剧情**，只会影响你与玩家的关系
3. **保持角色一致性**，根据你的性格、职业和背景来回复
4. **自然对话**，像真实的人一样交流，不要生硬或机械
5. **根据对话内容，关系可能会改善或恶化**

# 世界背景
${loreData.worldBackground?.content?.join('\n') || ''}

# 你的角色信息
- 姓名：${npcData.name}
- 年龄：${npcData.age || '未知'}
- 性别：${npcData.gender || '未知'}
- 职业：${npcData.job || '未知'}
- 描述：${npcData.description || ''}
- 类型：${npcData.type || ''}
- 所在地点：${npcData.sceneName || ''}
${npcData.relationships ? `- 相关人物：${Object.entries(npcData.relationships).map(([name, rel]) => `${name}(${rel})`).join('、')}` : ''}

# 玩家信息
- 姓名：${playerData.data?.profile?.name || '旅行者'}
- 年龄：${playerData.data?.profile?.age || '未知'}
- 性别：${playerData.data?.profile?.gender || '未知'}
- 职业：${playerData.data?.profile?.job || '未知'}

# 当前关系
你与玩家 ${playerData.data?.profile?.name} 的当前关系值：${currentRelationship}/100
- 0-20：陌生人或敌对
- 21-40：认识
- 41-60：熟人
- 61-80：朋友
- 81-100：密友或盟友

# 记忆内容
${npcData.memory && npcData.memory.length > 0 ? npcData.memory.map(mem => `- ${mem}`).join('\n') : '暂无相关记忆'}

# 📖 文学风格要求 (LITERARY STYLE REQUIREMENTS)

**你必须严格遵循以下文学风格进行对话：**

${styleInstructions}

**重要提醒：**
- 你的所有回复（对话）都必须符合上述文学风格
- 根据当前关系值和风格要求调整你的语气和表达方式
- 保持风格一致性

# 对话指导
- 根据当前关系值调整你的态度和亲密度
- 关系值低时可以保持距离或警惕
- 关系值高时可以更加友好和信任
- 玩家的言行会影响你对他/她的看法
- 保持自然对话，避免重复相同的话
- 可以提及你的背景、想法、困扰或日常生活

在每次回复的**最后**，用以下格式标注关系变化（如果有的话）：
[RELATIONSHIP_CHANGE: +5] 或 [RELATIONSHIP_CHANGE: -3]

如果对话没有明显影响关系，不需要添加此标记。`;

  return prompt;
}


async function summarizeAndStoreChatMemory(sessionId, npcId, chatHistory) {
  try {
    // Only summarize if there are enough messages (at least 4 messages for meaningful conversation)
    if (!chatHistory || chatHistory.length < 4) {
      return;
    }

    // Get NPC data to access current memory
    const scenesPath = path.join(__dirname, '../public/game_data', sessionId, `scenes_${sessionId}.json`);
    const lorePath = path.join(__dirname, '../public/game_data', sessionId, `lore_${sessionId}.json`);
    const scenesData = JSON.parse(await fs.readFile(scenesPath, 'utf-8'));
    const loreData = JSON.parse(await fs.readFile(lorePath, 'utf-8'));

    // Find the NPC
    let npcData = null;
    for (const scene of Object.values(scenesData)) {
      if (scene.npcs) {
        const npc = scene.npcs.find(n => n.id === npcId || n.name === npcId);
        if (npc) {
          npcData = npc;
          break;
        }
      }
    }

    if (!npcData) {
      console.warn(`NPC ${npcId} not found for memory update`);
      return;
    }

    // Prepare chat history for summarization
    const conversationText = chatHistory.map(msg => {
      const role = msg.role === 'user' ? '玩家' : npcData.name;
      return `${role}: ${msg.content}`;
    }).join('\n');

    // Create summarization prompt
    const summaryPrompt = `请总结以下对话内容，提取关于${npcData.name}和玩家的关键信息、重要事件和关系发展。总结应该简洁、有针对性，作为NPC的记忆使用。

对话内容：
${conversationText}

请用一句话或几句话总结这个对话中值得记住的内容，特别是：
- 玩家和NPC之间的重要互动
- 分享的重要信息
- 达成的协议或约定
- 情感或关系的变化

总结（直接给出总结内容，不要其他说明）：`;

    // Call Claude to summarize
    const summaryResponse = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 200,
      messages: [{ role: 'user', content: summaryPrompt }]
    });

    const summary = summaryResponse.content[0].text.trim();

    // Initialize memory array if it doesn't exist
    if (!npcData.memory) {
      npcData.memory = [];
    }

    // Add game time to the summary instead of real timestamp
    const gameTime = loreData.gameTime;
    const gameTimeString = `${gameTime.yearName}${gameTime.currentYear}年${gameTime.currentMonth}月${gameTime.currentDay}日`;
    const timestampedSummary = `${gameTimeString}: ${summary}`;

    // Add to memory (keep only last 10 memories to avoid overflow)
    npcData.memory.push(timestampedSummary);
    if (npcData.memory.length > 10) {
      npcData.memory = npcData.memory.slice(-10);
    }

    // Save updated scenes data
    await fs.writeFile(scenesPath, JSON.stringify(scenesData, null, 2), 'utf-8');
    console.log(`💾 Updated memory for NPC ${npcId}: ${summary.substring(0, 50)}...`);

  } catch (error) {
    console.error('Error summarizing chat memory:', error);
    // Don't throw error - memory update is not critical
  }
}

async function updateNPCRelationshipInScenes(sessionId, npcId, newRelationship) {
  try {
    const scenesPath = path.join(__dirname, '../public/game_data', sessionId, `scenes_${sessionId}.json`);
    const scenesData = JSON.parse(await fs.readFile(scenesPath, 'utf-8'));

    // Search for NPC in all scenes and update relationship
    let npcFound = false;
    for (const scene of Object.values(scenesData)) {
      if (scene.npcs) {
        const npc = scene.npcs.find(n => n.id === npcId || n.name === npcId);
        if (npc) {
          npc.relationships = newRelationship;
          npcFound = true;
          console.log(`Updated relationship for NPC ${npcId} to ${newRelationship} in scenes file`);
          break;
        }
      }
    }

    if (npcFound) {
      // Save updated scenes data
      await fs.writeFile(scenesPath, JSON.stringify(scenesData, null, 2), 'utf-8');
    } else {
      console.warn(`NPC ${npcId} not found in scenes file for relationship update`);
    }
  } catch (error) {
    console.error(`Error updating NPC relationship in scenes file:`, error);
    // Don't throw error - this is a non-critical update
  }
}

async function sendNPCChatMessage(sessionId, npcId, userMessage, onChunk = null) {
  try {
    // Load necessary data (all from session directory now)
    const playerData = await loadPlayerData(sessionId);

    const [npcData, loreData] = await Promise.all([
      loadNPCData(sessionId, npcId),
      loadLoreData(sessionId),
    ]);

    // Get or create chat session
    const chatSession = await getOrCreateChatSession(sessionId, npcId);

    // Check if this is the first interaction (no chat history)
    if (chatSession.chatHistory.length === 0) {
      // Use a random greeting from the NPC's greetings array
      const greetings = npcData.greetings || ["你好！", "很高兴见到你。", "欢迎来到这里。"];
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

      // Add the greeting as the first message from NPC
      chatSession.chatHistory.push({
        role: 'assistant',
        content: randomGreeting,
      });

      chatSession.lastMessageAt = new Date().toISOString();

      // Save the greeting to chat history
      await saveChatHistory(sessionId, npcId, chatSession);

      // Return the greeting response
      return {
        success: true,
        npcName: npcData.name,
        response: randomGreeting,
        relationshipChange: 0,
        newRelationship: npcData.relationships || 50,
        isFirstInteraction: true
      };
    }

    // Get current relationship value from NPC data (stored in scenes file)
    let currentRelationship = npcData.relationships || 50;

    // Load literary style from manifest
    const manifestPath = path.join(__dirname, '../public/game_data', sessionId, 'manifest.json');
    let literaryStyle = getDefaultStyle();
    try {
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestData);
      if (manifest.session?.literaryStyle) {
        literaryStyle = manifest.session.literaryStyle;
      }
    } catch (error) {
      console.warn('Could not load literary style from manifest, using default');
    }

    // Build system prompt with literary style
    const systemPrompt = buildNPCChatSystemPrompt(npcData, playerData, loreData, currentRelationship, sessionId, literaryStyle);

    // Add user message to history
    chatSession.chatHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Limit chat history to last 30 messages to manage context
    if (chatSession.chatHistory.length > 30) {
      chatSession.chatHistory = chatSession.chatHistory.slice(-30);
    }

    // Call Claude API with streaming
    let fullResponse = '';

    if (onChunk) {
      // Streaming mode
      const stream = await anthropic.messages.create({
        model: MODEL_NAME,
        max_tokens: 1024,
        system: systemPrompt,
        messages: chatSession.chatHistory,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const chunk = event.delta.text;
          fullResponse += chunk;
          if (onChunk) {
            onChunk(chunk);
          }
        }
      }
    } else {
      // Non-streaming mode
      const response = await anthropic.messages.create({
        model: MODEL_NAME,
        max_tokens: 4096,
        system: systemPrompt,
        messages: chatSession.chatHistory,
      });

      fullResponse = response.content[0].text;
    }

    // Add assistant response to history
    chatSession.chatHistory.push({
      role: 'assistant',
      content: fullResponse,
    });

    chatSession.lastMessageAt = new Date().toISOString();

    // Extract relationship change
    const relationshipChangeMatch = fullResponse.match(/\[RELATIONSHIP_CHANGE:\s*([+-]?\d+)\]/);
    let relationshipChange = 0;
    let newRelationship = currentRelationship;

    if (relationshipChangeMatch) {
      relationshipChange = parseInt(relationshipChangeMatch[1]);
      newRelationship = Math.max(0, Math.min(100, currentRelationship + relationshipChange));

      // Update the relationship value in the scenes JSON file (primary storage)
      await updateNPCRelationshipInScenes(sessionId, npcId, newRelationship);

      // Also update player data for backwards compatibility
      if (!playerData.data.relationships) {
        playerData.data.relationships = {};
      }
      playerData.data.relationships[npcData.name] = newRelationship;

      // Save updated player data (in session directory)
      const playerPath = path.join(__dirname, '../public/game_data', sessionId, `player_${sessionId}.json`);
      await fs.writeFile(playerPath, JSON.stringify(playerData, null, 2), 'utf-8');
    }

    // Save chat history
    await saveChatHistory(sessionId, npcId, chatSession);

    // Summarize and store chat memory
    await summarizeAndStoreChatMemory(sessionId, npcId, chatSession.chatHistory);

    return {
      success: true,
      npcName: npcData.name,
      response: fullResponse,
      relationshipChange,
      newRelationship,
      isFirstInteraction: false
    };

  } catch (error) {
    console.error('Error in sendNPCChatMessage:', error);
    throw error;
  }
}

async function getChatHistory(sessionId, npcId) {
  const chatSession = await getOrCreateChatSession(sessionId, npcId);
  return chatSession.chatHistory;
}


async function clearChatHistory(sessionId, npcId) {
  const chatKey = `${sessionId}_${npcId}`;

  if (chatSessions.has(chatKey)) {
    const chatSession = chatSessions.get(chatKey);
    chatSession.chatHistory = [];
    await saveChatHistory(sessionId, npcId, chatSession);
  }

  // Also delete the file (from session directory)
  try {
    const historyPath = path.join(__dirname, '../public/game_data', sessionId, `npc_chat_${sessionId}_${npcId}.json`);
    await fs.unlink(historyPath);
  } catch (error) {
    // File might not exist, that's okay
  }
}

export {
  sendNPCChatMessage,
  getChatHistory,
  clearChatHistory,
  getOrCreateChatSession,
  updateNPCMemoriesWithPlot,
};
