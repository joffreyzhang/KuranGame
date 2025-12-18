import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStyleInstructions, getDefaultStyle } from './literaryStyleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

const MODEL_NAME = 'claude-sonnet-4-5-20250929';

async function loadBuildingData(sessionId, sceneId, buildingId) {
  const scenesPath = path.join(__dirname, '../public/game_data', sessionId, `scenes_${sessionId}.json`);
  const scenesData = JSON.parse(await fs.readFile(scenesPath, 'utf-8'));

  const scene = scenesData[sceneId];
  if (!scene) {
    throw new Error(`Scene ${sceneId} not found`);
  }

  const building = scene.buildings?.find(b => b.id === buildingId);
  if (!building) {
    throw new Error(`Building ${buildingId} not found in scene ${sceneId}`);
  }

  return {
    ...building,
    sceneName: scene.name,
    sceneDescription: scene.description
  };
}

async function loadPlayerData(sessionId) {
  const playerPath = path.join(__dirname, '../public/game_data', sessionId, `player_${sessionId}.json`);
  return JSON.parse(await fs.readFile(playerPath, 'utf-8'));
}


async function loadLoreData(sessionId) {
  const lorePath = path.join(__dirname, '../public/game_data', sessionId, `lore_${sessionId}.json`);
  return JSON.parse(await fs.readFile(lorePath, 'utf-8'));
}


function buildBuildingInteractionPrompt(buildingData, playerData, loreData, feature, isInitialInteraction, literaryStyle) {
  // Get literary style instructions
  const styleInstructions = getStyleInstructions(literaryStyle || getDefaultStyle());

  const prompt = `# 建筑互动系统

你是一个互动小说游戏中的建筑互动系统。玩家点击了建筑的某个功能，现在需要进行一次互动对话。

## 建筑信息
- 建筑名称：${buildingData.name}
- 建筑描述：${buildingData.description}
- 所在场景：${buildingData.sceneName}
- 选择的功能：${feature}

## 玩家信息
- 姓名：${playerData.data?.profile?.name || '旅行者'}
- 年龄：${playerData.data?.profile?.age || '未知'}
- 性别：${playerData.data?.profile?.gender || '未知'}
- 当前属性：${Object.entries(playerData.data?.attributes || {}).map(([key, value]) => `${key}: ${value}`).join(', ')}

## 世界背景
${loreData.worldBackground?.content?.join('\n') || ''}

# 📖 文学风格要求 (LITERARY STYLE REQUIREMENTS)

**你必须严格遵循以下文学风格进行叙述：**

${styleInstructions}

**重要提醒：**
- 所有描述、对话都必须符合上述文学风格
- 保持风格的一致性

## 互动规则
${isInitialInteraction ?
  `这是玩家第一次与建筑功能的互动。你需要：
1. 描述玩家选择这个功能后的场景和反应
2. 提供3-5个具体的行动选项，让玩家选择下一步
3. 每个选项应该简洁明了，符合建筑的功能和玩家的当前状态
4. 如果这个互动会改变玩家的属性、物品或关系，请在回复末尾用特殊标记表示：[ATTRIBUTE_CHANGE: 属性名 +数值] 或 [ITEM_CHANGE: 物品名] 或 [RELATIONSHIP_CHANGE: 角色名 +数值]`

  :
  `这是玩家对之前选项的选择。你需要：
1. 执行玩家选择的行动
2. 描述行动的结果和后果
3. 这次互动到此结束，不再提供新选项
4. 如果行动导致玩家状态变化，请在回复末尾用特殊标记表示：[ATTRIBUTE_CHANGE: 属性名 +数值] 或 [ITEM_CHANGE: 物品名] 或 [RELATIONSHIP_CHANGE: 角色名 +数值]`
}

## 回复格式
${isInitialInteraction ?
  `回复应该包含：
- 场景描述和建筑的反应
- 可用选项列表

示例格式：
在${buildingData.name}，你选择了${feature}...

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
- 不要在其他地方使用这个格式`
  :

  `回复应该只包含行动的执行结果和描述，不要包含新的选项。

示例格式：
你选择了那个选项...

[描述行动的结果，可能的收获、变化等]`
}

保持回复生动有趣，符合游戏的叙事风格。`;

  return prompt;
}

function extractActionOptions(responseText) {
  console.log('\n=== 🎯 EXTRACTING ACTION OPTIONS in Building Service ===');
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

  // If we found [ACTION: ...] format, return immediately
  if (options.length > 0) {
    console.log(`✅ Extracted ${options.length} action options using [ACTION: ...] format`);
    return options;
  }

  // FALLBACK: Extract numbered options (1. ..., 2. ..., etc.)
  const lines = responseText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match lines that start with number followed by period or Chinese punctuation
    const match = line.match(/^(\d+)[.、]\s*(.+)$/);
    if (match) {
      const numIndex = parseInt(match[1]);
      const text = match[2].trim();

      // Filter out table of contents or irrelevant numbered items
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
  return uniqueOptions;
}

export async function processBuildingFeatureInteraction(sessionId, sceneId, buildingId, feature, selectedOption = null, onChunk = null) {
  try {
    // Load all necessary data
    const buildingData = await loadBuildingData(sessionId, sceneId, buildingId);
    const playerData = await loadPlayerData(sessionId);
    const loreData = await loadLoreData(sessionId);

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

    // Determine interaction type
    const isInitialInteraction = selectedOption === null;

    // Build system prompt with literary style
    const systemPrompt = buildBuildingInteractionPrompt(buildingData, playerData, loreData, feature, isInitialInteraction, literaryStyle);

    // Prepare user message
    let userMessage;
    if (isInitialInteraction) {
      userMessage = `我点击了${buildingData.name}的"${feature}"功能，请开始互动。`;
    } else {
      userMessage = `我选择选项：${selectedOption}`;
    }

    // Call Claude API with streaming
    let fullResponse = '';

    if (onChunk) {
      // Streaming mode
      const stream = await anthropic.messages.create({
        model: MODEL_NAME,
        max_tokens: isInitialInteraction ? 1024 : 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
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
        max_tokens: isInitialInteraction ? 1024 : 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      fullResponse = response.content[0].text;
    }

    // Apply LLM response changes to player data
    const { applyClaudeUpdates } = await import('./statusService.js');
    await applyClaudeUpdates(sessionId, fullResponse);

    // Parse response based on interaction type
    if (isInitialInteraction) {
      // Extract action options using the new extraction method
      const options = extractActionOptions(fullResponse);

      return {
        success: true,
        type: 'initial',
        buildingId,
        feature,
        response: fullResponse,
        options: options.length > 0 ? options : null,
        canContinue: options.length > 0
      };
    } else {
      // Final response, no more options - single turn interaction
      return {
        success: true,
        type: 'final',
        buildingId,
        feature,
        selectedOption,
        response: fullResponse,
        options: null,
        canContinue: false
      };
    }

  } catch (error) {
    console.error('Error in building feature interaction:', error);
    throw error;
  }
}


export async function getBuildingFeatures(sessionId, sceneId, buildingId) {
  try {
    const buildingData = await loadBuildingData(sessionId, sceneId, buildingId);
    return buildingData.features || [];
  } catch (error) {
    console.error('Error getting building features:', error);
    return [];
  }
}


export async function getSceneBuildings(sessionId, sceneId) {
  try {
    const scenesPath = path.join(__dirname, '../public/game_data', sessionId, `scenes_${sessionId}.json`);
    const scenesData = JSON.parse(await fs.readFile(scenesPath, 'utf-8'));

    const scene = scenesData[sceneId];
    if (!scene || !scene.buildings) {
      return [];
    }

    return scene.buildings.map(building => ({
      id: building.id,
      name: building.name,
      description: building.description,
      icon: building.icon,
      type: building.type,
      features: building.features || []
    }));
  } catch (error) {
    console.error('Error getting scene buildings:', error);
    return [];
  }
}
