import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadVisualGameSettings } from './utils.js';
import { completeGameSessionByParams } from '../../login/controller/gamesController.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VISUAL_GAME_DATA_DIR = path.join(__dirname, '..', '..', 'public', 'visual_game');
const VISUAL_TEMP_DIR = path.join(VISUAL_GAME_DATA_DIR, 'temp');
const VISUAL_SESSION_SAVES_DIR = path.join(VISUAL_GAME_DATA_DIR, 'sessions');
const VISUAL_PRESET_DIR = path.join(__dirname, '..', '..', 'visual_saves');

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

// Store visual game sessions in memory
const visualSessions = new Map();

export function createVisualGameSession(sessionId, fileId = null, presetId = null) {
  console.log(`🎮 Creating visual game session: ${sessionId}${fileId ? ` with fileId: ${fileId}` : ''}${presetId ? ` with presetId: ${presetId}` : ''}`);

  try {
    const { worldSetting, npcSetting, sceneSetting } = loadVisualGameSettings(fileId, presetId);

    // Initialize game state
    const initialScene = sceneSetting.scenes[0]; // Start at first scene

    const sessionState = {
      sessionId,
      mode: 'visual',
      fileId: fileId || null,
      presetId: presetId || null,
      worldSetting,
      npcSetting,
      sceneSetting,
      currentScene: initialScene.id,
      visitedScenes: [initialScene.id],
      conversationHistory: [],
      player: {
        ...worldSetting.player,
        currentLocation: initialScene.id
      },
      gameStarted: false,
      createdAt: new Date().toISOString()
    };

    // Save session to memory and disk
    visualSessions.set(sessionId, sessionState);
    saveVisualSession(sessionId, sessionState);

    console.log(`✅ Visual game session created: ${sessionId}`);
    return sessionState;
  } catch (error) {
    console.error('Error creating visual game session:', error);
    throw error;
  }
}

/**
 * Save visual game session to disk (split into multiple files)
 */
async function saveVisualSession(sessionId, sessionState) {
  const sessionDir = path.join(VISUAL_SESSION_SAVES_DIR, sessionId);
  if (!fsSync.existsSync(sessionDir)) {
    fsSync.mkdirSync(sessionDir, { recursive: true });
  }

  // Save only essential session data (not the full settings)
  const sessionData = {
    sessionId: sessionState.sessionId,
    mode: sessionState.mode,
    fileId: sessionState.fileId,
    presetId: sessionState.presetId,
    currentScene: sessionState.currentScene,
    visitedScenes: sessionState.visitedScenes,
    player: sessionState.player,
    gameStarted: sessionState.gameStarted,
    createdAt: sessionState.createdAt,
    updatedAt: sessionState.updatedAt || new Date().toISOString()
  };

  const sessionPath = path.join(sessionDir, 'session.json');
  fsSync.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

  // Save settings separately (only if not already saved)
  const worldPath = path.join(sessionDir, 'worldSetting.json');
  const npcPath = path.join(sessionDir, 'npcSetting.json');
  const scenePath = path.join(sessionDir, 'sceneSetting.json');

  if (!fsSync.existsSync(worldPath)) {
    fsSync.writeFileSync(worldPath, JSON.stringify(sessionState.worldSetting, null, 2));
  }
  if (!fsSync.existsSync(npcPath)) {
    fsSync.writeFileSync(npcPath, JSON.stringify(sessionState.npcSetting, null, 2));
  }
  if (!fsSync.existsSync(scenePath)) {
    fsSync.writeFileSync(scenePath, JSON.stringify(sessionState.sceneSetting, null, 2));
  }

  // Save conversation history separately
  const historyData = {
    sessionId,
    history: sessionState.conversationHistory || [],
    lastUpdated: new Date().toISOString(),
    totalMessages: (sessionState.conversationHistory || []).length
  };
  const historyPath = path.join(sessionDir, 'history.json');
  fsSync.writeFileSync(historyPath, JSON.stringify(historyData, null, 2));

  // minio save
  try {
    const fileId = sessionState.presetId;
    console.log("====================save:presetId:", sessionState.presetId);
    await completeGameSessionByParams(sessionId, 'public/visual_game/sessions', fileId);
    console.log(`✅ Session data uploaded to MinIO: ${sessionId}`);
  } catch (uploadError) {
    console.error('[MinIO Upload] Failed to upload session data:', uploadError.message);
  }


}

/**
 * Load visual game session (from split files)
 */
export function loadVisualSession(sessionId) {
  // Try memory first
  if (visualSessions.has(sessionId)) {
    return visualSessions.get(sessionId);
  }

  // Try disk
  try {
    const sessionDir = path.join(VISUAL_SESSION_SAVES_DIR, sessionId);
    const sessionPath = path.join(sessionDir, 'session.json');

    if (fsSync.existsSync(sessionPath)) {
      // Load main session data
      const sessionData = JSON.parse(fsSync.readFileSync(sessionPath, 'utf-8'));

      // Load settings from separate files
      const worldPath = path.join(sessionDir, 'worldSetting.json');
      const npcPath = path.join(sessionDir, 'npcSetting.json');
      const scenePath = path.join(sessionDir, 'sceneSetting.json');
      const historyPath = path.join(sessionDir, 'history.json');

      const worldSetting = fsSync.existsSync(worldPath)
        ? JSON.parse(fsSync.readFileSync(worldPath, 'utf-8'))
        : null;
      const npcSetting = fsSync.existsSync(npcPath)
        ? JSON.parse(fsSync.readFileSync(npcPath, 'utf-8'))
        : null;
      const sceneSetting = fsSync.existsSync(scenePath)
        ? JSON.parse(fsSync.readFileSync(scenePath, 'utf-8'))
        : null;

      let conversationHistory = [];
      if (fsSync.existsSync(historyPath)) {
        const historyData = JSON.parse(fsSync.readFileSync(historyPath, 'utf-8'));
        conversationHistory = historyData.history || [];
      }

      // Reconstruct full session state
      const sessionState = {
        ...sessionData,
        worldSetting,
        npcSetting,
        sceneSetting,
        conversationHistory
      };

      visualSessions.set(sessionId, sessionState);
      return sessionState;
    }
  } catch (error) {
    console.error('Error loading visual session from disk:', error);
  }

  return null;
}

/**
 * Get current scene details
 */
function getCurrentScene(sessionState) {
  const scene = sessionState.sceneSetting.scenes.find(
    s => s.id === sessionState.currentScene
  );
  return scene;
}

/**
 * Build context for Claude (following gameService.js prompt patterns)
 */
function buildVisualGameContext(sessionState, userAction) {
  const scene = getCurrentScene(sessionState);
  const npcs = sessionState.npcSetting.npcs;
  const world = sessionState.worldSetting;
  const player = sessionState.player;

  // Helper function to format value
  const formatValue = (value) => {
    if (Array.isArray(value)) {
      return value.join('、');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Build world setting section - required fields first, then any optional fields
  const worldRequiredKeys = ['title', 'background', 'preamble', 'initialplot', 'literary', 'player'];
  let worldSection = `## 游戏世界设定
**标题**：${world.title}
**背景**：${world.background}
**初始剧情**：${world.initialplot}`;

  // Add any optional world setting fields
  Object.keys(world).forEach(key => {
    if (!worldRequiredKeys.includes(key) && key !== 'player') {
      worldSection += `\n**${key}**：${formatValue(world[key])}`;
    }
  });

  // Build player section - required fields first, then any optional fields
  const playerRequiredKeys = ['name', 'gender', 'appearance'];
  let playerSection = `\n\n## 玩家信息
- **姓名**：${player.name}
- **性别**：${player.gender}`;

  // Add any optional player fields
  Object.keys(player).forEach(key => {
    if (!playerRequiredKeys.includes(key) && key !== 'currentLocation') {
      playerSection += `\n- **${key}**：${formatValue(player[key])}`;
    }
  });
  playerSection += `\n- **当前位置**：${scene.name}`;

  // Build scene section - required fields first, then any optional fields
  const sceneRequiredKeys = ['id', 'name', 'description'];
  let sceneSection = `\n\n## 当前场景
**场景名称**：${scene.name}
**场景描述**：${scene.description}`;

  // Add any optional scene fields
  Object.keys(scene).forEach(key => {
    if (!sceneRequiredKeys.includes(key)) {
      sceneSection += `\n**${key}**：${formatValue(scene[key])}`;
    }
  });

  // Build NPC section - required fields first, then any optional fields
  const npcRequiredKeys = ['id', 'name', 'gender', 'appearance', 'description', 'tone'];
  let npcSection = `\n\n## NPC 列表`;
  if (npcs.length > 0) {
    npcSection += '\n' + npcs.map(npc => {
      let npcInfo = `### ${npc.name} [ID: ${npc.id}]
- **语气**：${npc.tone}`;

      // Add any optional NPC fields
      Object.keys(npc).forEach(key => {
        if (!npcRequiredKeys.includes(key) && key !== 'images') {
          npcInfo += `\n- **${key}**：${formatValue(npc[key])}`;
        }
      });

      return npcInfo;
    }).join('\n\n');
  } else {
    npcSection += '\n此场景暂无NPC';
  }

  // Build available scenes section
  let scenesSection = `\n\n## 可用场景列表`;
  if (sessionState.sceneSetting.scenes.length > 0) {
    scenesSection += '\n' + sessionState.sceneSetting.scenes.map(s => {
      return `- **${s.name}** [ID: ${s.id}] `;
    }).join('\n');
  }

  const systemPrompt = `你是一个专业的视觉小说游戏主持人（Game Master）。你正在主持一个基于以下设定的视觉小说游戏。

${worldSection}${playerSection}${sceneSection}${npcSection}${scenesSection}

你的职责：
1. 严格遵循游戏世界设定和场景信息
2. 根据玩家的行动推进剧情
3. 保持剧情的连贯性和逻辑性
4. 用生动、细腻的文笔描述场景和事件
5. 采用${sessionState.worldSetting.literary}风格进行叙事

# 叙事结构格式 

你的回复必须按照视觉小说的叙事结构，分为以下几种步骤类型：

1. **旁白叙述 (Narration)** - 场景描述、环境变化、事件发展、心理描写
   格式: [NARRATION: 旁白文本]
   示例: [NARRATION: 月光透过树梢洒在林间小道上，远处传来夜莺的鸣叫。空气中弥漫着潮湿的青草气息。]

2. **NPC对话 (Dialogue)** - NPC或玩家的台词
   格式: [DIALOGUE: NPC_ID, "对话内容"] 或 [DIALOGUE: player, "对话内容"]
   示例: [DIALOGUE: gandalf, "弗罗多，时候到了。你必须离开夏尔，前往瑞文戴尔。"]
   示例: [DIALOGUE: player, "我愿意承担这个使命，虽然我不知道自己能否胜任。"]
   注意: 必须使用NPC的ID（如gandalf, harry_truman等），而不是NPC的名字
   注意: 当表达玩家的对话时，使用player作为ID

3. **场景切换 (Scene Change)** - 当剧情发展需要切换到新场景时
   格式: [SCENE_CHANGE: scene_id]
   示例: [SCENE_CHANGE: bree]
   注意: 必须使用场景的实际ID，切换场景后立即用NARRATION描述新场景

4. **场景过渡 (Transition)** - 场景切换时的描述（可选，用于更生动的过渡）
   格式: [TRANSITION: 过渡文本]
   示例: [TRANSITION: 经过三个小时的跋涉，你终于抵达了布理镇的边缘。炊烟在暮色中升起，酒馆的灯光温暖而诱人。]

5. **选择分支 (Choice)** - 玩家的行动选项
   格式: [CHOICE: 选择标题]
          选择的描述文本
          [OPTION: 选项1文本]
          [OPTION: 选项2文本]
          [OPTION: 选项3文本]
          [END_CHOICE]
   示例: [CHOICE: 如何回应？]
          甘道夫正等待着你的答复，他的目光中充满期待。
          [OPTION: "我愿意承担这个使命，虽然我不知道自己能否胜任。"]
          [OPTION: "让我考虑一下，这太突然了。"]
          [OPTION: "为什么是我？我只是个普通的霍比特人。"]
          [END_CHOICE]

#  文本颜色标记 

在叙述和对话中，可以使用颜色标记来强调重要的词语或句子，前端会渲染为不同颜色：

- <red>文本</red> - 红色：危险、警告、重要的负面信息
- <yellow>文本</yellow> - 黄色：提示、警告、需要注意的信息
- <green>文本</green> - 绿色：成功、积极、正面的信息
- <blue>文本</blue> - 蓝色：冷静、神秘、特殊的信息
- <purple>文本</purple> - 紫色：魔法、神秘、罕见的事物

示例:
[NARRATION: 阴影中传来<red>诡异的低吼声</red>，让人不寒而栗。]
[DIALOGUE: gandalf, "<red>快跑！</red>炎魔来了！"]

在对话中，可以使用动画标记来表现角色的情绪和动作，前端会为立绘添加相应的动画效果：

- <jump>文本</jump> - 立绘跳跃：表现喜悦、兴奋、开心的情绪
- <vibration>文本</vibration> - 立绘震动：表现惊吓、生气、震惊、愤怒的情绪
- <injury>文本</injury> - 表现角色受伤，遭到攻击时的状态，此状态也可在旁白 NARRATION 中出现
只有<injury>可以在旁白 NARRATION 中出现，其他只能在对话DIALOGUE中出现

示例:
[DIALOGUE: player, "<jump>太好了，我们成功了！</jump>"]
[DIALOGUE: NPC_ID, "<vibration>敌人来了！准备战斗！</vibration>"]
[DIALOGUE: player, "<injury>我不行了，一直在流血</injury>"]


**游戏初始化规则: **
当玩家刚开始游戏时：
- 直接开始故事叙述（使用[NARRATION]）
- 在故事中自然地提及关键背景信息
- 不要输出游戏标题、分隔线、设定说明
- 不要逐行列出角色状态

**场景过渡规则：**
当玩家移动到新场景时：
- 使用[TRANSITION]描述移动过程
- 提供新场景的行动选项

**示例（场景切换）：**
[TRANSITION: 告别了袋底洞的温暖，你踏上了前往布理的道路。夏尔的绿色田野渐渐被起伏的丘陵取代，道路变得更加崎岖。]
[SCENE_CHANGE: bree]

**注意事项：**
- 每个步骤独占一行或多行（对于CHOICE）
- 对话内容必须用双引号包裹
- **NPC对话必须使用NPC的ID**
- **玩家对话使用player作为ID**
- 选择选项通常2-4个，要具体可操作
- 所有文本必须是中文
- 禁止输出markdown格式的表格、代码块、标题（#、##、**等）
- 描述要生动、有画面感、符合文学风格

请根据玩家的行动:**${userAction}**，用上述格式继续推进游戏剧情。`;

  return systemPrompt;
}

function detectNPCVariantFromDialogue(content, npcImages) {
  if (!npcImages) return null;

  // Remove color markup tags for cleaner detection
  const cleanContent = content.replace(/<\/?(?:red|yellow|green|blue|purple)>/g, '').toLowerCase();

  // Priority order: expression > clothing > pose
  const variantPriority = ['expression', 'clothing', 'pose'];

  for (const variantType of variantPriority) {
    // Find all variants of this type
    const variantsOfType = Object.entries(npcImages)
      .filter(([key]) => key.startsWith(`${variantType}_`))
      .map(([key, url]) => {
        const variantValue = key.replace(`${variantType}_`, '');
        return { key, url, variantValue };
      });

    // Check each variant of this type
    for (const { url, variantValue } of variantsOfType) {
      const lowerVariantValue = variantValue.toLowerCase();
      // 1. Check for exact match of variant value in content
      if (cleanContent.includes(lowerVariantValue)) {
        return url;
      }
      // 2. Check for partial match using word boundaries (for multi-word variants)
      // Split variant by common separators and check if any part appears in content
      const variantParts = lowerVariantValue.split(/[-_\s]+/);
      for (const part of variantParts) {
        if (part.length > 1 && cleanContent.includes(part)) {
          return url;
        }
      }
      // 3. Check for fuzzy character match (for single-word variants with 2+ chars)
      // This helps with typos or similar character variations
      if (variantValue.length >= 2 && !lowerVariantValue.includes(' ')) {
        const variantChars = lowerVariantValue.split('');
        const matchCount = variantChars.filter(char => cleanContent.includes(char)).length;
        // Require at least 70% character match for better accuracy
        if (matchCount >= Math.ceil(variantValue.length * 0.7)) {
          return url;
        }
      }
    }
  }

  // Default to base image
  return npcImages['base'] || null;
}

function parseVisualNarrativeSteps(response, sessionState = null) {
  const steps = [];
  const lines = response.split('\n');

  let currentStep = null;
  let currentChoice = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Narration
    if (trimmedLine.startsWith('[NARRATION:')) {
      if (currentStep) steps.push(currentStep);
      currentStep = {
        type: 'narration',
        content: trimmedLine.replace(/^\[NARRATION:\s*/, '').replace(/\]$/, '').trim()
      };
    }
    // Scene Change
    else if (trimmedLine.startsWith('[SCENE_CHANGE:')) {
      if (currentStep) steps.push(currentStep);
      const sceneId = trimmedLine.replace(/^\[SCENE_CHANGE:\s*/, '').replace(/\]$/, '').trim();

      currentStep = {
        type: 'scene_change',
        sceneId: sceneId
      };

      // Enrich with scene data if sessionState is provided
      if (sessionState) {
        const scene = sessionState.sceneSetting.scenes.find(s => s.id === sceneId);
        if (scene) {
          currentStep.sceneName = scene.name;
          currentStep.sceneDescription = scene.description;
          currentStep.sceneImage = scene.image || scene.images;
          currentStep.sceneAtmosphere = scene.atmosphere;
          currentStep.dangerLevel = scene.dangerLevel;
          currentStep.soundtrack = scene.soundtrack;
        }
      }
    }
    // Dialogue (handles both NPC and player dialogue)
    else if (trimmedLine.startsWith('[DIALOGUE:')) {
      if (currentStep) steps.push(currentStep);
      const match = trimmedLine.match(/^\[DIALOGUE:\s*([^,]+),\s*"([^"]+)"\s*\]/);
      if (match) {
        const speakerId = match[1].trim();
        const dialogueContent = match[2].trim();

        currentStep = {
          type: 'dialogue',
          speakerId: speakerId,
          content: dialogueContent
        };

        // Check if it's player dialogue
        if (speakerId === 'player') {
          currentStep.isPlayer = true;
          if (sessionState) {
            currentStep.speakerName = sessionState.player.name;
          }
        } else {
          // NPC dialogue - enrich with NPC data if sessionState is provided
          currentStep.isPlayer = false;
          if (sessionState) {
            const npc = sessionState.npcSetting.npcs.find(n => n.id === speakerId);
            if (npc) {
              currentStep.speakerName = npc.name;
              currentStep.npcImages = npc.images || {};

              // Detect and set appropriate variant image based on dialogue content
              const variantImage = detectNPCVariantFromDialogue(dialogueContent, npc.images);
              if (variantImage) {
                currentStep.activeImage = variantImage;
              }
            }
          }
        }

        // Keep legacy npcId field for backward compatibility
        currentStep.npcId = speakerId;
      }
    }
    // Transition
    else if (trimmedLine.startsWith('[TRANSITION:')) {
      if (currentStep) steps.push(currentStep);
      currentStep = {
        type: 'transition',
        content: trimmedLine.replace(/^\[TRANSITION:\s*/, '').replace(/\]$/, '').trim()
      };
    }
    // Choice start
    else if (trimmedLine.startsWith('[CHOICE:')) {
      if (currentStep) steps.push(currentStep);
      currentChoice = {
        type: 'choice',
        title: trimmedLine.replace(/^\[CHOICE:\s*/, '').replace(/\]$/, '').trim(),
        description: '',
        options: []
      };
      currentStep = currentChoice;
    }
    // Option
    else if (trimmedLine.startsWith('[OPTION:') && currentChoice) {
      currentChoice.options.push(
        trimmedLine.replace(/^\[OPTION:\s*/, '').replace(/\]$/, '').trim()
      );
    }
    // End choice
    else if (trimmedLine === '[END_CHOICE]' && currentChoice) {
      steps.push(currentChoice);
      currentStep = null;
      currentChoice = null;
    }
    // Description text for choice
    else if (currentChoice && trimmedLine && !trimmedLine.startsWith('[')) {
      currentChoice.description += (currentChoice.description ? ' ' : '') + trimmedLine;
    }
    // Continuation of current step
    else if (currentStep && !currentChoice && trimmedLine && !trimmedLine.startsWith('[')) {
      currentStep.content += ' ' + trimmedLine;
    }
  }

  // Push last step if exists
  if (currentStep && !currentChoice) {
    steps.push(currentStep);
  }

  return {
    steps,
    totalSteps: steps.length
  };
}

/**
 * Process player action in visual game (with SSE streaming support)
 */
export async function processVisualGameAction(sessionId, userAction, onChunk = null) {
  console.log(`🎮 Processing visual game action for session: ${sessionId}`);
  console.log(`Action: ${userAction}`);

  const sessionState = loadVisualSession(sessionId);
  if (!sessionState) {
    throw new Error('Session not found');
  }

  try {
    // Handle game start
    if (!sessionState.gameStarted && userAction === '开始游戏') {
      sessionState.gameStarted = true;
      userAction = '游戏开始，我想知道现在的情况';
    }

    // Build context and get Claude response
    const systemPrompt = buildVisualGameContext(sessionState, userAction);

    // Add user message to conversation history
    sessionState.conversationHistory.push({
      role: 'user',
      content: userAction
    });

    // Keep conversation history manageable (last 20 messages)
    const trimmedHistory = sessionState.conversationHistory.slice(-10);

    // Determine if we should use streaming
    const useStreaming = !!onChunk;

    if (useStreaming) {
      // Streaming mode
      console.log('🚀 Calling Claude API (Streaming mode)...');
      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 10000,
        system: systemPrompt,
        messages: trimmedHistory,
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

          if (onChunk) {
            const narrativeData = parseVisualNarrativeSteps(buffer, sessionState);
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
        const narrativeData = parseVisualNarrativeSteps(fullResponse, sessionState);

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

      // Add assistant response to history
      sessionState.conversationHistory.push({
        role: 'assistant',
        content: fullResponse
      });

      // Parse narrative steps for action options
      const narrativeData = parseVisualNarrativeSteps(fullResponse, sessionState);
      const choiceSteps = narrativeData.steps.filter(step => step.type === 'choice');
      const actionOptions = choiceSteps.length > 0 ? choiceSteps[0].options : ['继续探索', '与NPC交谈', '查看周围', '前往其他地点'];

      // Check for scene changes in the narrative
      const sceneChangeSteps = narrativeData.steps.filter(step => step.type === 'scene_change');
      if (sceneChangeSteps.length > 0) {
        const lastSceneChange = sceneChangeSteps[sceneChangeSteps.length - 1];
        const newSceneId = lastSceneChange.sceneId;
        const newScene = sessionState.sceneSetting.scenes.find(s => s.id === newSceneId);

        if (newScene) {
          console.log(`🎬 Scene changed from ${sessionState.currentScene} to ${newSceneId} (${newScene.name})`);
          sessionState.currentScene = newSceneId;
          sessionState.player.currentLocation = newSceneId;

          // Add to visited scenes if not already visited
          if (!sessionState.visitedScenes.includes(newSceneId)) {
            sessionState.visitedScenes.push(newSceneId);
          }
        }
      }
      // Update session
      sessionState.lastAction = userAction;
      sessionState.lastResponse = fullResponse;
      sessionState.updatedAt = new Date().toISOString();
      // Save session
      visualSessions.set(sessionId, sessionState);
      saveVisualSession(sessionId, sessionState);

      console.log('📊 Token Usage (Streaming):');
      console.log(`  Input tokens: ${usage.input_tokens || 'N/A'}`);
      console.log(`  Output tokens: ${usage.output_tokens || 'N/A'}`);
      
      return {
        success: true,
        response: fullResponse,
        narrativeSteps: narrativeData.steps,
        actionOptions,
        currentScene: {
          id: sessionState.currentScene,
          name: getCurrentScene(sessionState).name,
          soundtrack: getCurrentScene(sessionState).soundtrack
        },
        npcs: sessionState.npcSetting.npcs.map(npc => ({
          id: npc.id,
          name: npc.name,
        })),
        metadata: {
          model: 'claude-sonnet-4-5-20250929',
          streaming: true,
          usage: usage
        }
      };
    }

    // Non-streaming mode is not supported
    throw new Error('Non-streaming mode is not supported. Please use streaming mode.');

  } catch (error) {
    console.error('Error processing visual game action:', error);
    throw error;
  }
}

/**
 * Get visual game session state
 */
export function getVisualSessionState(sessionId) {
  const sessionState = loadVisualSession(sessionId);
  if (!sessionState) {
    return null;
  }

  const scene = getCurrentScene(sessionState);
  const npcs = sessionState.npcSetting.npcs;

  return {
    sessionId: sessionState.sessionId,
    mode: sessionState.mode,
    player: sessionState.player,
    currentScene: {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      dangerLevel: scene.dangerLevel,
      soundtrack: scene.soundtrack
    },
    npcs: npcs.map(npc => ({
      id: npc.id,
      name: npc.name,
      race: npc.race,
      images: npc.images
    })),
    visitedScenes: sessionState.visitedScenes,
    gameStarted: sessionState.gameStarted,
    worldInfo: {
      title: sessionState.worldSetting.title,
      summary: sessionState.worldSetting.summary,
      theme: sessionState.worldSetting.Theme
    }
  };
}


export async function regenerateVisualGameResponse(sessionId, historyIndex = null, onChunk = null) {
  console.log(`🔄 Regenerating response for session: ${sessionId}${historyIndex !== null ? ` from index ${historyIndex}` : ' (latest)'}`);

  const sessionState = loadVisualSession(sessionId);
  if (!sessionState) {
    throw new Error('Session not found');
  }

  const history = sessionState.conversationHistory;

  if (!history || history.length === 0) {
    throw new Error('No conversation history to regenerate from');
  }

  // Determine the index to regenerate from
  let targetIndex;
  if (historyIndex === null) {
    // Regenerate the last response (find the last user message)
    targetIndex = history.length - 2; // Assuming last is assistant, second-to-last is user
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        targetIndex = i;
        break;
      }
    }
  } else {
    targetIndex = historyIndex;
  }

  // Validate index
  if (targetIndex < 0 || targetIndex >= history.length) {
    throw new Error(`Invalid history index: ${targetIndex}`);
  }

  if (history[targetIndex].role !== 'user') {
    throw new Error(`History index ${targetIndex} is not a user message. Can only regenerate from user messages.`);
  }

  // Get the user action to regenerate
  const userAction = history[targetIndex].content;

  // Truncate history up to (but not including) the target index
  // This removes the user message at targetIndex and everything after it
  const truncatedHistory = history.slice(0, targetIndex);
  sessionState.conversationHistory = truncatedHistory;

  console.log(`📜 Truncated history from ${history.length} to ${truncatedHistory.length} messages`);
  console.log(`🎬 Regenerating action: "${userAction}"`);

  // Save the truncated state before regenerating
  saveVisualSession(sessionId, sessionState);

  // Now regenerate using the existing processVisualGameAction function
  // It will add the user message and new assistant response to history
  const result = await processVisualGameAction(sessionId, userAction, onChunk);

  return {
    ...result,
    regenerated: true,
    regeneratedFrom: targetIndex,
    truncatedMessages: history.length - truncatedHistory.length
  };
}

export function editVisualGameHistory(sessionId, historyIndex, newContent) {
  console.log(`✏️ Editing history for session: ${sessionId} at index ${historyIndex}`);

  const sessionState = loadVisualSession(sessionId);
  if (!sessionState) {
    throw new Error('Session not found');
  }

  const history = sessionState.conversationHistory;
  if (historyIndex < 0 || historyIndex >= history.length) {
    throw new Error(`Invalid history index: ${historyIndex}. History length: ${history.length}`);
  }

  if (!newContent || typeof newContent !== 'string') {
    throw new Error('New content must be a non-empty string');
  }

  const oldMessage = history[historyIndex];
  const oldContent = oldMessage.content;
  history[historyIndex].content = newContent;

  // Truncate all messages after the edited index
  const truncatedHistory = history.slice(0, historyIndex + 1);
  const deletedMessages = history.length - truncatedHistory.length;
  sessionState.conversationHistory = truncatedHistory;

  // Save the updated session
  saveVisualSession(sessionId, sessionState);

  console.log(`✅ History edited successfully at index ${historyIndex}`);
  console.log(`   Old length: ${oldContent.length} chars`);
  console.log(`   New length: ${newContent.length} chars`);

  return {
    success: true,
    message: 'History edited successfully',
    editedIndex: historyIndex,
    editedMessage: {
      role: oldMessage.role,
      content: newContent,
      previousContent: oldContent,
      previousLength: oldContent.length,
      newLength: newContent.length
    },
    totalMessages: truncatedHistory.length,
    deletedMessages: deletedMessages
  };
}

