import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import {loadGameData, copyGameToSession, copyUploadedGameToSession } from './gameInitializationService.js';
import {loadStatus, applyClaudeUpdates, initializeStatus, saveStatus} from './statusService.js';
import { prepareGameDataForLLM } from './utils.js';
import {
  loadMissions,
  incrementTurnCount,
  buildGameContext,
  checkStorylineBlocked,
  generateStoryMission
} from './missionService.js';
import { parseNarrativeSteps } from './narrativeParser.js';
import { completeGameSessionByParams } from '../login/controller/gamesController.js';
import { updateNPCMemoriesWithPlot } from './npcChatService.js';
import { getStyleInstructions, getDefaultStyle, isValidStyle } from './literaryStyleService.js';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory for storing game data files
const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');
const GAME_SAVES_DIR = path.join(__dirname, '..', 'game_saves');

// Initialize Claude client
console.log('🔍 GameService Environment Variables:');
console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'SET' : 'NOT SET');
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

// Store game sessions in memory (in production, use Redis or database)
const gameSessions = new Map();

export function recoverSession(sessionId) {
  console.log(`🔄 Attempting to recover session: ${sessionId}`);

  try {
    // Check if session directory exists
    const sessionDir = path.join(GAME_DATA_DIR, sessionId);
    if (!fsSync.existsSync(sessionDir)) {
      console.log(`❌ Session directory not found: ${sessionDir}`);
      return null;
    }

    // Load manifest to determine if this is a pre-processed game
    const manifestPath = path.join(sessionDir, 'manifest.json');
    let isPreProcessed = false;
    let sourceFileId = null;

    if (fsSync.existsSync(manifestPath)) {
      const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf-8'));
      if (manifest.session?.sourceFileId) {
        isPreProcessed = true;
        sourceFileId = manifest.session.sourceFileId;
        console.log(`📦 Detected pre-processed game session. Source: ${sourceFileId}`);
      }
    }

    // Load player status
    const characterStatus = loadStatus(sessionId);
    if (!characterStatus) {
      console.log(`❌ Player status not found for session: ${sessionId}`);
      return null;
    }
    const history = loadSessionHistory(sessionId);

    // Rebuild conversation history from saved history for Claude context
    const conversationHistory = [];
    for (const entry of history) {
      if (entry.type === 'player') {
        conversationHistory.push({
          role: 'user',
          content: entry.message
        });
      } else if (entry.type === 'game') {
        conversationHistory.push({
          role: 'assistant',
          content: entry.message
        });
      }
    }

    // Keep only the last 20 messages to avoid token overflow
    const trimmedConversationHistory = conversationHistory.length > 20
      ? conversationHistory.slice(-20)
      : conversationHistory;

    console.log(`📜 Rebuilt conversation history: ${trimmedConversationHistory.length} messages`);

    // Load literary style from manifest
    let literaryStyle = getDefaultStyle();
    if (fsSync.existsSync(manifestPath)) {
      const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf-8'));
      if (manifest.session?.literaryStyle && isValidStyle(manifest.session.literaryStyle)) {
        literaryStyle = manifest.session.literaryStyle;
      }
    }

    // Reconstruct session object
    const session = {
      sessionId,
      fileId: sourceFileId || sessionId, // Use sourceFileId if available, otherwise sessionId
      sourceFileId: sourceFileId || sessionId,
      isPreProcessed,
      playerName: characterStatus.data?.profile?.name || 'Player',
      literaryStyle,  // Add literary style
      characterStatus,
      gameState: {
        currentLocation: characterStatus.data?.location || 'start',
        inventory: characterStatus.data?.inventory || [],
        progress: {},
        flags: characterStatus.data?.flags || {},
        health: characterStatus.data?.stats?.health || 100,
        createdAt: characterStatus.createdAt || new Date().toISOString(),
        isInitialized: history.length > 0
      },
      history,
      conversationHistory: trimmedConversationHistory,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        apiCalls: 0
      }
    };

    // Store in memory
    gameSessions.set(sessionId, session);
    console.log(`✅ Session recovered successfully`);

    return session;
  } catch (error) {
    console.error(`❌ Error recovering session:`, error);
    return null;
  }
}

export function saveSessionHistory(sessionId, history) {
  // Save to session directory
  const sessionDir = path.join(GAME_DATA_DIR, sessionId);
  const historyPath = path.join(sessionDir, `history_${sessionId}.json`);

  try {
    // Ensure session directory exists
    if (!fsSync.existsSync(sessionDir)) {
      fsSync.mkdirSync(sessionDir, { recursive: true });
    }

    const historyData = {
      sessionId,
      history: history || [],
      lastUpdated: new Date().toISOString(),
      totalMessages: (history || []).length
    };
    fsSync.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf-8');
    console.log(`💾 History saved: ${history?.length || 0} messages`);
  } catch (error) {
    console.error('Error saving session history:', error);
  }
}

function loadSessionHistory(sessionId) {
  // Load from session directory
  const sessionDir = path.join(GAME_DATA_DIR, sessionId);
  const historyPath = path.join(sessionDir, `history_${sessionId}.json`);

  if (fsSync.existsSync(historyPath)) {
    try {
      const data = fsSync.readFileSync(historyPath, 'utf-8');
      const historyData = JSON.parse(data);
      return historyData.history || [];
    } catch (error) {
      console.error('Error loading session history:', error);
      return [];
    }
  }
  return [];
}

export const createGameSession = async (sessionId, fileId, playerName = 'Player', literaryStyle = null) => {
  console.log('\n=== 🎮 CREATE GAME SESSION ===');
  console.log('Session ID:', sessionId);
  console.log('File ID:', fileId);

  // Validate and set literary style
  const style = (literaryStyle && isValidStyle(literaryStyle)) ? literaryStyle : getDefaultStyle();
  console.log('Literary Style:', style);

  // Check if fileId exists in game_saves directory
  const gameSavePath = path.join(GAME_SAVES_DIR, fileId);
  const isPreProcessed = fsSync.existsSync(gameSavePath);
  
  if (isPreProcessed) {
    console.log(`📦 Found pre-processed game in game_saves/${fileId}`);
    console.log('🔄 Copying game files to session directory...');

    // Copy files from game_saves to session directory
    copyGameToSession(fileId, sessionId);
  } else {
    console.log('🔄 Copying uploaded game files to session directory...');
    copyUploadedGameToSession(fileId, sessionId);
  }

  // Load game data - now supporting both session directory and legacy fileId
  const gameData = loadGameData(isPreProcessed ? sessionId : fileId, isPreProcessed);
  if (!gameData) {
    throw new Error('Game data not found. Please process a document file first.');
  }
  playerName = gameData.playerData.profile.name;
  // Get initial location from first scene in scenes data
  playerName = gameData.playerData.profile.name;
  let initialLocation = 'start';
  if (gameData && gameData.worldData) {
    const sceneIds = Object.keys(gameData.worldData);
    if (sceneIds.length > 0) {
      initialLocation = sceneIds[0];
      console.log(`🏠 Initial location determined: ${initialLocation} (${gameData.worldData[initialLocation].name})`);
    }
  }

  // Initialize character status
  const characterStatus = initializeStatus(sessionId, fileId, initialLocation);
  saveStatus(sessionId, characterStatus);
  console.log('✅ Character status initialized and saved');

  // Save literary style to manifest
  const sessionDir = path.join(GAME_DATA_DIR, sessionId);
  const manifestPath = path.join(sessionDir, 'manifest.json');
  let manifest = {};
  if (fsSync.existsSync(manifestPath)) {
    manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf-8'));
  }
  manifest.session = manifest.session || {};
  manifest.session.literaryStyle = style;
  manifest.session.lastUpdated = new Date().toISOString();
  fsSync.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`✅ Literary style saved to manifest: ${style}`);

  const session = {
    sessionId,
    fileId,
    sourceFileId: gameData.sourceFileId || fileId,
    isPreProcessed,
    playerName, // Add status to session
    literaryStyle: style,  // Add literary style
    gameState: {
      currentLocation: initialLocation,
      inventory: [],
      health: 100,
      createdAt: new Date().toISOString(),
      isInitialized: false
    },
    history: [],
    conversationHistory: [], // Store Claude conversation history
    tokenUsage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      apiCalls: 0
    }
  };
  gameSessions.set(sessionId, session);

  // Persist session to allow recovery
  return session;
};

export const processPlayerAction = async (sessionId, action, onChunk = null) => {
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

  // Determine if we should use streaming
  const useStreaming = !!onChunk;

  if (isInitCommand && !session.gameState.isInitialized) {
    console.log('Start the First Round...');
    const response = await callClaudeAPI(session, '开始游戏！请展示初始设定并开始剧情。', useStreaming, onChunk);

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

    // Parse narrative steps from response
    const narrativeData = parseNarrativeSteps(response.message);

    // Extract choices from steps
    const choiceSteps = narrativeData.steps.filter(step => step.type === 'choice');
    const actionOptions = choiceSteps.length > 0 ? choiceSteps[0].options : null;

    // Persist session history to file
    saveSessionHistory(sessionId, session.history);

    try {
      const fileId = session.sourceFileId || session.fileId;
      await completeGameSessionByParams(sessionId, 'public/game_data', fileId);
      console.log(`✅ Session data uploaded to MinIO: ${sessionId}`);
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload session data:', uploadError.message);
    }
    return {
      response: response.message,
      gameState: session.gameState,
      characterStatus: updatedStatus,
      narrativeSteps: narrativeData.steps,
      actionOptions,
      isInitialized: true
    };
  }

  // Check if storyline is blocked by an active story mission
  const storylineStatus = checkStorylineBlocked(sessionId);
  if (storylineStatus.blocked) {
    console.log(`[Story Mission] Storyline is BLOCKED by mission: ${storylineStatus.mission.title}`);

    return {
      response: `当前主线剧情已暂停。\n\n【任务：${storylineStatus.mission.title}】\n${storylineStatus.mission.description}\n\n请完成任务目标后点击"提交任务"按钮继续剧情。`,
      gameState: session.gameState,
      characterStatus: session.characterStatus,
      storylineBlocked: true,
      blockingMission: storylineStatus.mission,
      isInitialized: true
    };
  }

  // PRE-CHECK: Determine if we should force [MISSION: true] marker in Claude's response
  let shouldForceMissionMarker = false;
  try {
    const missionData = loadMissions(sessionId);
      // Calculate turns since last story mission
    const lastStoryMission = [...missionData.missions]
      .reverse()
      .find(m => m.isStoryMission);

    const turnsSinceLastMission = lastStoryMission ? missionData.turnCount - (lastStoryMission.createdTurn || 0) : missionData.turnCount; // Use actual turn count, not 999
    console.log(`[Story Mission] : ${turnsSinceLastMission} turns`)
    shouldForceMissionMarker = turnsSinceLastMission >= 10;
    if (shouldForceMissionMarker) {
      console.log(`[Story Mission] PRE-CHECK: Will force [MISSION: true] marker (${turnsSinceLastMission} turns since last mission)`);
    }
  } catch (error) {
    console.error('[Mission Pre-Check] Error checking for force-generation:', error);
  }

  // Add player action to history
  session.history.push({
    type: 'player',
    message: action,
    timestamp: new Date().toISOString()
  });

  // Generate response using Claude (with optional streaming)
  const response = await callClaudeAPI(session, action, useStreaming, onChunk, shouldForceMissionMarker);

  // Add response to history
  session.history.push({
    type: 'game',
    message: response.message,
    timestamp: new Date().toISOString()
  });

  const updatedStatus = await applyClaudeUpdates(sessionId, response.message);
  session.characterStatus = updatedStatus;
  const narrativeData = parseNarrativeSteps(response.message);
  const choiceSteps = narrativeData.steps.filter(step => step.type === 'choice');
  const actionOptions = choiceSteps.length > 0 ? choiceSteps[0].options : null;

  await updateNPCMemoriesWithPlot(sessionId, response.message);

  // UPDATE MISSION SYSTEM - Check for completed missions and generate new ones
  let newStoryMission = null;

  try {
    // Increment turn count for mission tracking
    incrementTurnCount(sessionId);
    const gameData = loadGameData(session.isPreProcessed ? sessionId : session.fileId, session.isPreProcessed);
    const gameContext = buildGameContext(sessionId, session, gameData, updatedStatus);

    // Check if narrative indicates a story mission should be triggered
    const shouldTriggerStoryMission = narrativeData.shouldGenerateMission || false;

    if (shouldTriggerStoryMission) {
      console.log('[Story Mission] [MISSION: true] tag detected in narrative response');

      const missionData = loadMissions(sessionId);
        // Calculate turns since last story mission for cooldown check
      const lastStoryMission = [...missionData.missions]
        .reverse()
        .find(m => m.isStoryMission);

      const turnsSinceLastMission = lastStoryMission? missionData.turnCount - (lastStoryMission.createdTurn || 0) : 999;
      // Minimum cooldown: at least 3 turns since last story mission
      if (turnsSinceLastMission >= 3) {
        newStoryMission = await generateStoryMission(
          sessionId,
          updatedStatus,
          gameContext,
          response.message
        );

        if (newStoryMission) {
          console.log(`[Story Mission] Generated: ${newStoryMission.title}`);
        }
      } else {
        console.log(`[Story Mission] Cooldown active: only ${turnsSinceLastMission} turns since last mission (need 3)`);
      }
    }
  } catch (error) {
    console.error('[Mission System] Error updating missions:', error);
  }

  // Persist session history to file
  saveSessionHistory(sessionId, session.history);

  // Upload session data to MinIO (after all updates are complete)
  try {
    const fileId = session.sourceFileId || session.fileId;
    await completeGameSessionByParams(sessionId, 'public/game_data', fileId);
    console.log(`✅ Session data uploaded to MinIO: ${sessionId}`);
  } catch (uploadError) {
    console.error('[MinIO Upload] Failed to upload session data:', uploadError.message);
    // Don't throw - upload errors shouldn't break the game
  }

  return {
    response: response.message,
    gameState: session.gameState,
    characterStatus: updatedStatus,
    narrativeSteps: narrativeData.steps,
    actionOptions,
    newMission: newStoryMission // Include the generated story mission if any
  };
};

export const getSession = (sessionId) => {
  return gameSessions.get(sessionId);
};

async function callClaudeAPI(session, action, useStreaming = false, onChunk = null, shouldForceMissionMarker = false) {
  // Use sessionId for prepareGameDataForLLM if session is from pre-processed game
  const identifier = session.isPreProcessed ? session.sessionId : session.fileId;
  const isSessionId = session.isPreProcessed;

  const status = loadStatus(session.sessionId);
  const unlockedScenes = status?.unlockedScenes || null;
  const gamePrompt = prepareGameDataForLLM(identifier, isSessionId, unlockedScenes);

  const missionData = loadMissions(session.sessionId);
  const recentlyCompletedMissions = missionData.missions.filter(m =>
    m.status === 'completed' &&
    m.completedTurn !== undefined &&
    missionData.turnCount - m.completedTurn <= 1 // Completed in last turn or current turn
  );

  let missionCompletionPrompt = '';
  if (recentlyCompletedMissions.length > 0) {
    missionCompletionPrompt = `
##  最近完成的任务 (Recently Completed Missions)

玩家刚刚完成了以下任务，请在你的回复中：
1. 庆祝玩家的成就
2. 继续主线剧情
3. 根据任务完成的方式自然地推进故事

`;
    recentlyCompletedMissions.forEach(mission => {
      missionCompletionPrompt += `### 任务：${mission.title}\n`;
      missionCompletionPrompt += `描述：${mission.description}\n`;
      if (mission.completedViaPath) {
        const path = mission.completionPaths?.find(p => p.pathId === mission.completedViaPath);
        if (path) {
          missionCompletionPrompt += `完成方式：${path.name} - ${path.description}\n`;
        }
      }
      missionCompletionPrompt += `完成时间：${mission.completedAt}\n\n`;
    });
  }

  // Add forced mission generation instruction if needed
  let forcedMissionInstruction = '';
  if (shouldForceMissionMarker) {
    forcedMissionInstruction = `
## ⚠️ CRITICAL INSTRUCTION - 强制任务生成

系统检测到玩家已经很久没有收到主线任务了。你**必须**在本次回复中：
1. **在回复的最开头添加 [MISSION: true] 标记**（这是强制要求）
2. 创造一个重要的剧情转折或危机，为即将生成的任务做铺垫
3. **不要**包含 [CHOICE]、[OPTION]、[END_CHOICE] 标记
4. 用富有戏剧性的叙事引入这个关键时刻

示例格式：
[MISSION: true]
[NARRATION: 你的叙事文本...]
[DIALOGUE: NPC名字, "对话..."]
[HINT: 提示文本...]

**记住：必须以 [MISSION: true] 开头，不要添加任何选项。**
`;
    console.log('[Force Mission] Injecting forced mission instruction into system prompt');
  }

  // Get literary style instructions
  const literaryStyle = session.literaryStyle || getDefaultStyle();
  const styleInstructions = getStyleInstructions(literaryStyle);
  console.log(`[Literary Style] Using style: ${literaryStyle}`);

  const systemPrompt = `你是一个专业的互动小说游戏主持人（Game Master）。你正在主持一个基于以下设定的互动小说游戏。

游戏设定内容：
${gamePrompt}

${missionCompletionPrompt}

你的职责：
1. 严格遵循游戏设定内容
2. 根据玩家的行动推进剧情
3. 保持剧情的连贯性和逻辑性
4. 用生动、细腻的文笔描述场景和事件

# 📖 文学风格要求 (LITERARY STYLE REQUIREMENTS)

**你必须严格遵循以下文学风格进行叙述：**

${styleInstructions}

**重要提醒：**
- 所有叙述、对话、描写都必须符合上述文学风格
- 即使使用结构化标记（[NARRATION]、[DIALOGUE]等），标记内的文本也必须遵循该风格
- 保持风格的一致性，不要在同一回合中混用不同风格

**重要：叙事结构格式 (Narrative Structure Format)**
你的回复必须按照传统RPG游戏的叙事结构，分为以下几种步骤类型：

1. **旁白叙述 (Narration)** - 场景描述、环境变化、事件发展
   格式: [NARRATION: 旁白文本]
   示例: [NARRATION: 残月沉入黑森林的尽头，杜恩要塞的号角在夜色中拉响。]

2. **NPC对话 (Dialogue)** - NPC的台词
   格式: [DIALOGUE: 角色名字, "对话内容"]
   示例: [DIALOGUE: 艾德里安, "星图已经明示：在第一缕阳光照进王冠遗址前，我们必须抵达。"]

3. **提示和状态变化 (Hint)** - 重要提示和角色属性、道具变化、npc关系变化
   格式: [HINT: 提示文本]
          [CHANGE: 玩家姓名, 属性名, +/-数值]
          [CHANGE: RELATIONSHIP, NPC名字, +/-数值]
          [CHANGE: 道具名称, 获得/丢失, 获得数量]
   示例: [HINT: 艾德里安双手接过光焰剑，勇气升腾。]
          [CHANGE: 玩家姓名, 勇气, +1]
          [CHANGE: 光焰剑, 获得, 1]
          [CHANGE: RELATIONSHIP, 艾德里安, +10]

4. **选择分支 (Choice)** - 玩家的行动选项
   格式: [CHOICE: 选择标题]
          选择的描述文本
          [OPTION: 选项1文本]
          [OPTION: 选项2文本]
          [END_CHOICE]
   示例: [CHOICE: 前路抉择]
          古道分出两条路线：阳光山道通向王冠祭坛，暗影林地直指失落王城。
          [OPTION: 踏上阳光山道，沿着古老的雕纹前进。]
          [OPTION: 潜入暗影林地，借迷雾遮蔽行踪。]
          [END_CHOICE]

**叙事顺序规则：**
1. 开场使用旁白设置场景氛围
2. 穿插NPC对话推进剧情
3. 在关键事件后用旁白描述环境变化
4. 重要物品获得或属性变化使用HINT
5. 最后提供CHOICE让玩家决策

**游戏初始化规则（CRITICAL - Game Initialization Rules）：**
当玩家刚开始游戏时，**不要**输出以下内容：
-不要输出游戏标题、分隔线、设定说明
-不要逐行列出角色状态（姓名、年龄、性别、职业、等级、生命值、能量、金币等）
-不要逐条列出初始物品清单
-不要输出任何markdown格式的表格、列表、标题

玩家状态由系统自动管理，你只需要：
直接开始故事叙述（使用[NARRATION]）
在故事中自然地提及关键背景信息
正常使用[DIALOGUE]、[HINT]、[CHOICE]推进剧情

正确的游戏开场示例：
[NARRATION: 显庆五年，六月初四。襄州城笼罩在盛夏的热浪之中，汉水波光粼粼，码头上南来北往的船只络绎不绝。蝉鸣声从城外的梧桐林中传来，与市集的喧嚣交织成一曲盛世之音。]
[NARRATION: 杜氏宅邸书房内，檀香袅袅。你伏案研读《春秋左传》，窗外阳光透过竹帘洒在书页上，形成斑驳的光影。忽然，一阵急促的脚步声打破了宁静。]
[DIALOGUE: 小厮春儿, "三公子！三公子！货栈的赵执事来了，说有要紧事禀报！"]
[NARRATION: 你抬起头，墨迹未干的毛笔悬在半空。透过窗棂，可以看见赵三在院中来回踱步，神色焦虑。]
[CHOICE: 如何应对？]
你该如何行动？
[OPTION: 立即放下书卷，前去会见赵执事]
[OPTION: 先派春儿稳住赵执事，自己整理好书案后再从容前往]
[OPTION: 让赵执事稍候，赶往州学上课]
[END_CHOICE]

**场景解锁机制 (Scene Unlock System)**
- 在HINT中说明解锁新场景时，添加：[UNLOCK_SCENE: scene_id]
- 示例: [HINT: 守卫点了点头，为你打开了通往北方森林的大门。]
         [UNLOCK_SCENE: northern_forest]

**任务生成标记 (Mission Generation Tag)**
- 当剧情出现重大转折、危机或需要玩家完成明确目标时，在回复最开头添加：[MISSION: true]
- 当剧情正常推进、无需生成任务时，不需要添加任何标记
- 不要频繁使用 [MISSION: true]，只在真正关键的故事节点使用（大约每3-5轮对话一次）
- 如果[MISSION: true]出现，不要使用[CHOICE][OPTION][END_CHOICE]

${forcedMissionInstruction}

**完整示例：**
[NARRATION: 残月沉入黑森林的尽头，杜恩要塞的号角在夜色中拉响。灰烬王冠的传说再次在火光中醒来。]
[DIALOGUE: 艾德里安, "又是这样的梦……赛琳娜，我们真的要在黎明前就出发吗？"]
[HINT: 艾德里安双手接过光焰剑，勇气升腾。]
[CHANGE: 艾德里安, 勇气, +1]
[CHOICE: 前路抉择]
古道分出两条路线：阳光山道通向王冠祭坛，暗影林地直指失落王城。你们将如何前行？
[OPTION: 踏上阳光山道，沿着古老的雕纹前进。]
[OPTION: 潜入暗影林地，借迷雾遮蔽行踪。]
[END_CHOICE]

如果  [MISSION: true]
则示例为：
[MISSION: true]
[NARRATION: 残月沉入黑森林的尽头，杜恩要塞的号角在夜色中拉响。灰烬王冠的传说再次在火光中醒来。]
[DIALOGUE: 艾德里安, "又是这样的梦……赛琳娜，我们真的要在黎明前就出发吗？"]
[HINT: 艾德里安双手接过光焰剑，勇气升腾。]
[CHANGE: 艾德里安, 勇气, +1]

**注意事项：**
- 每个步骤独占一行或多行（对于CHOICE）
- character_id必须是游戏中实际存在的NPC ID或玩家自己扮演的角色
- 对话内容必须用双引号包裹
- 选择选项通常3-5个，要具体可操作
- 所有文本必须是中文
- 禁止输出游戏标题、章节标题、分隔线（---、===等）
- 禁止输出任何markdown格式的表格、列表、标题（#、##、**等）

请根据玩家的行动，用上述格式继续推进游戏剧情。`;

  // Build conversation history for Claude
  const messages = [...session.conversationHistory];
  const trimmedConversationHistory = session.conversationHistory.slice(-20);

  // Add current action
  messages.push({
    role: 'user',
    content: action
  });

  if (useStreaming) {
      // Streaming mode
    console.log('🚀 Calling Claude API (Streaming mode)...');
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 12000,
      system: systemPrompt,
      messages: trimmedConversationHistory,
      stream: true
    });

    let fullResponse = '';
    let chunkIndex = 0;
    let usage = null;
    let buffer = ''; // Buffer for incremental step parsing
    let sentSteps = []; // Track sent steps to avoid duplicates

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        const token = chunk.delta.text;
        fullResponse += token;
        buffer += token;

        // Send raw text chunk immediately for instant feedback
        if (onChunk) {
          await onChunk(JSON.stringify({
            type: 'raw_text',
            text: token,
            chunkIndex: chunkIndex
          }) + '\n', chunkIndex);
        }

        // Try to parse and send complete steps from buffer
        if (onChunk) {
          const narrativeData = parseNarrativeSteps(buffer);
          for (let i = sentSteps.length; i < narrativeData.steps.length; i++) {
            const step = narrativeData.steps[i];
            // Check if it's the last step and buffer doesn't end with expected markers
            const isLastStep = i === narrativeData.steps.length - 1;
            const bufferEndsCleanly = buffer.trimEnd().endsWith(']') ||
                                    buffer.trimEnd().endsWith('[END_CHOICE]');

            if (!isLastStep || bufferEndsCleanly) {
              await onChunk(JSON.stringify({
                type: 'step',
                stepIndex: i,
                step: step,
                isIncremental: true
              }) + '\n', chunkIndex);

              sentSteps.push(step);
            }
          }
        }
        chunkIndex++;
      } else if (chunk.type === 'message_delta' && chunk.usage) {
        // Capture token usage from stream
        usage = chunk.usage;
      }
    }

    // After streaming completes, send final parsed structure
    if (onChunk && fullResponse) {
      console.log('📖 Finalizing narrative steps...');
      const narrativeData = parseNarrativeSteps(fullResponse);

      // Send any remaining steps that weren't sent during streaming
      for (let i = sentSteps.length; i < narrativeData.steps.length; i++) {
        const step = narrativeData.steps[i];
        await onChunk(JSON.stringify({
          type: 'step',
          stepIndex: i,
          step: step,
          isIncremental: false
        }) + '\n', i);
      }

      // Send completion signal with full metadata
      await onChunk(JSON.stringify({
        type: 'complete',
        totalSteps: narrativeData.totalSteps,
        allSteps: narrativeData.steps
      }) + '\n', chunkIndex);
    }

    // Update conversation history
    session.conversationHistory = messages;
    session.conversationHistory.push({
      role: 'assistant',
      content: fullResponse
    });
    // Update token usage tracking
    session.tokenUsage.totalOutputTokens += usage.output_tokens || 0;
    session.tokenUsage.totalTokens += (usage.output_tokens || 0);
    session.tokenUsage.apiCalls += 1;

    console.log('📊 Token Usage (Streaming):');
    console.log(`   Output Tokens: ${usage.output_tokens || 0}`);
    console.log(`   Session Total Tokens: ${session.tokenUsage.totalTokens}`);
    console.log(`   API Calls: ${session.tokenUsage.apiCalls}`);
  
    return {
      message: fullResponse,
      metadata: {
        model: 'claude-sonnet-4-5-20250929',
        streaming: true,
        usage: usage,
        sessionTokenUsage: session.tokenUsage
      }
    };
  }

  // Non-streaming mode is not supported
  throw new Error('Non-streaming mode is not supported. Please use streaming mode.');
}
