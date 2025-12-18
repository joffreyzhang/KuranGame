import Anthropic from "@anthropic-ai/sdk";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import dotenv from 'dotenv';
import { parseJSONFromResponse, validateWorldSetting, validateNPCSetting, validateSceneSetting } from '../visual/utils.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directories
const WORLD_INTERACTION_TEMP_DIR = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'temp');

// Ensure temp directory exists
if (!fs.existsSync(WORLD_INTERACTION_TEMP_DIR)) {
  fs.mkdirSync(WORLD_INTERACTION_TEMP_DIR, { recursive: true });
}

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

/**
 * Extract text from PDF file
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Extract text from DOCX file
 */
async function extractTextFromDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    throw new Error('Failed to extract text from DOCX');
  }
}

/**
 * Process document and extract world interaction game data using Claude
 */
export async function processWorldInteractionDocument(fileId, filePath, fileType) {
  console.log(`📄 Processing world interaction game document: ${fileId}`);

  try {
    // Extract text based on file type
    let documentText;
    if (fileType === 'pdf') {
      documentText = await extractTextFromPDF(filePath);
    } else if (fileType === 'docx') {
      documentText = await extractTextFromDOCX(filePath);
    } else {
      throw new Error('Unsupported file type. Only PDF and DOCX are supported.');
    }

    console.log(`📝 Extracted ${documentText.length} characters from document`);

    // Truncate if too long (Claude has token limits)
    const maxChars = 50000;
    const truncatedText = documentText.length > maxChars
      ? documentText.substring(0, maxChars)
      : documentText;

    console.log('🤖 Step 1/3: Generating worldSetting...');

    const worldSettingPrompt = `你是一个专业的交互式小说游戏内容分析AI。请分析文档并生成世界设定JSON。

## worldSetting.json (世界设定)
**必需字段**:
- title (string): 游戏标题
- summary (string): 简短摘要
- background (string): 世界背景故事（详细）
- preamble (string): 游戏开场白
- initialPlot (string): 初始剧情描述
- literary (string): 文学风格（例如：写实主义、浪漫主义、魔幻现实主义等）
- player (object):
  - name (string): 玩家角色名称
  - age (number): 年龄
  - gender (string): 玩家性别
  - personality (string): 性格
  - appearance (string): 玩家外貌描述
  - tone (string): 语气
- keyEvents (array): 关键事件数组（至少8个），每个事件包含：
  - title (string): 事件标题
  - description (string): 事件描述

## 分析要求
1. 仔细阅读文档，识别故事背景、主角、关键事件等信息
2. 如果文档中没有明确提到某些必需字段，请根据上下文合理推断或生成
3. 确保所有必需字段都有值
4. 为worldSetting生成至少8个keyEvents来丰富故事发展

## 返回格式
必须返回一个**完整的、格式正确的JSON对象**。
重要提示：
- 只返回纯JSON，不要使用markdown代码块（不要用\`\`\`json）
- 不要添加任何说明文字或注释
- 确保所有字符串值都正确转义（特殊字符如引号、换行符等）
- 确保JSON结构完整，所有括号、引号都正确闭合
- 字符串值中避免使用markdown格式符号（如**、##等）

{
  "title": "...",
  "summary": "...",
  "background": "...",
  "preamble": "...",
  "initialPlot": "...",
  "literary": "...",
  "player": {
    "name": "...",
    "age": 18,
    "gender": "...",
    "personality": "...",
    "appearance": "...",
    "tone": "...",
    "imagePath": "null"
  },
  "keyEvents": [
    {
      "title": "...",
      "description": "..."
    }
  ]
}`;

    const worldSettingUserPrompt = `请分析以下文档内容，生成世界设定配置文件：

${truncatedText}

${documentText.length > maxChars ? '\n（注：文档过长，已截取前50000字符）' : ''}`;

    const worldSettingResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      temperature: 0.7,
      system: worldSettingPrompt,
      messages: [{
        role: 'user',
        content: worldSettingUserPrompt
      }]
    });

    const worldSettingText = worldSettingResponse.content[0].text;
    const worldSetting = parseJSONFromResponse(worldSettingText);
    validateWorldSetting(worldSetting);
    console.log('✅ worldSetting generated and validated');
    console.log('🤖 Step 2/3: Generating npcSetting...');

    const npcSettingPrompt = `你是一个专业的交互式小说游戏内容分析AI。请根据文档和已生成的世界设定，生成NPC设定JSON。

## npcSetting.json (NPC设定)
结构: { "npcs": [ ... ] }

每个NPC必需字段:
- id (string): NPC唯一标识符（小写英文，用下划线连接，如：old_wizard）
- name (string): NPC名称
- gender (string): 性别
- appearance (string): 外貌描述
- tone (string): 说话语气/风格

每个NPC可选字段:
- age (number): 年龄
- description (string): 详细描述

## 分析要求
1. 仔细阅读文档，识别故事中的角色
2. 为NPC生成合适的英文ID（小写，下划线分隔，有意义）
3. 确保所有必需字段都有值
4. 尽可能填充可选字段以丰富游戏内容
5. 生成至少8个NPC来丰富游戏世界

## 返回格式
必须返回一个**完整的、格式正确的JSON对象**。
重要提示：
- 只返回纯JSON，不要使用markdown代码块（不要用\`\`\`json）
- 不要添加任何说明文字或注释
- 确保所有字符串值都正确转义（特殊字符如引号、换行符等）
- 确保JSON结构完整，所有括号、引号都正确闭合
- 字符串值中避免使用markdown格式符号（如**、##等）

{
  "npcs": [
    {
      "id": "...",
      "name": "...",
      "gender": "...",
      "description": "...",
      "appearance": "...",
      "tone": "...",
      "age": 30,
      "personality": "..."
    }
  ]
}`;

    const npcSettingUserPrompt = `请根据以下文档内容和已生成的世界设定，生成NPC设定配置文件：

## 文档内容：
${truncatedText.substring(0, 30000)}

${documentText.length > maxChars ? '\n（注：文档过长，已截取）' : ''}

## 已生成的世界设定：
标题: ${worldSetting.title}
背景: ${worldSetting.background.substring(0, 500)}...
主角: ${worldSetting.player.name}`;

    const npcSettingResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      temperature: 0.7,
      system: npcSettingPrompt,
      messages: [{
        role: 'user',
        content: npcSettingUserPrompt
      }]
    });

    const npcSettingText = npcSettingResponse.content[0].text;
    const npcSetting = parseJSONFromResponse(npcSettingText);
    validateNPCSetting(npcSetting);
    console.log('✅ npcSetting generated and validated');
    console.log('🤖 Step 3/3: Generating sceneSetting...');

    const sceneSettingPrompt = `你是一个专业的交互式小说游戏内容分析AI。请根据文档、世界设定和NPC设定，生成场景设定JSON。

## sceneSetting.json (场景设定)
结构: { "scenes": [ ... ] }

每个场景必需字段:
- id (string): 场景唯一标识符（小写英文，用下划线连接，如：dark_forest）
- name (string): 场景名称
- description (string): 详细描述
- position (array): 场景在地图上的位置 [x, y]，坐标范围0-1
- subscenes (array): 子场景数组，每个子场景包含：
  - id (string): 子场景唯一标识符
  - name (string): 子场景名称
  - description (string): 详细描述
  - image (string): 子场景图片路径（设为空字符串""）
  - position (array): 子场景在地图上的位置 [x, y]，坐标范围0-1

## 分析要求
1. 仔细阅读文档，识别故事中的场景和地点
2. 为场景和子场景生成合适的英文ID（小写，下划线分隔，有意义）
3. 为每个场景生成1-3个子场景
4. 将已生成的NPC合理分配到各个子场景的npcs数组中
5. 生成至少5-8个主场景来丰富游戏世界

## 返回格式
必须返回一个**完整的、格式正确的JSON对象**。
重要提示：
- 只返回纯JSON，不要使用markdown代码块（不要用\`\`\`json）
- 不要添加任何说明文字或注释
- 确保所有字符串值都正确转义（特殊字符如引号、换行符等）
- 确保JSON结构完整，所有括号、引号都正确闭合
- 字符串值中避免使用markdown格式符号（如**、##等）

{
  "scenes": [
    {
      "id": "...",
      "name": "...",
      "description": "...",
      "position": [0.5, 0.5],
      "subscenes": [
        {
          "id": "...",
          "name": "...",
          "description": "...",
          "image": "",
          "position": [0.2, 0.6]
        }
      ]
    }
  ]
}`;

    const npcIds = npcSetting.npcs.map(npc => npc.id).join(', ');
    const sceneSettingUserPrompt = `请根据以下信息，生成场景设定配置文件：

## 文档内容：
${truncatedText.substring(0, 30000)}

${documentText.length > maxChars ? '\n（注：文档过长，已截取）' : ''}

## 已生成的世界设定：
标题: ${worldSetting.title}

## 已生成的NPC列表：
${npcIds}

请将这些NPC合理分配到各个子场景中。`;

    const sceneSettingResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
      temperature: 0.7,
      system: sceneSettingPrompt,
      messages: [{
        role: 'user',
        content: sceneSettingUserPrompt
      }]
    });

    const sceneSettingText = sceneSettingResponse.content[0].text;
    const sceneSetting = parseJSONFromResponse(sceneSettingText);
    validateSceneSetting(sceneSetting);
    console.log('✅ sceneSetting generated and validated');

    // Combine all settings
    const parsedData = {
      worldSetting,
      npcSetting,
      sceneSetting
    };
    console.log('✅ All three settings generated and validated');

    // Create file directory
    const fileDir = path.join(WORLD_INTERACTION_TEMP_DIR, fileId);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    // Save JSON files
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');

    fs.writeFileSync(worldSettingPath, JSON.stringify(parsedData.worldSetting, null, 2));
    fs.writeFileSync(npcSettingPath, JSON.stringify(parsedData.npcSetting, null, 2));
    fs.writeFileSync(sceneSettingPath, JSON.stringify(parsedData.sceneSetting, null, 2));

    console.log(`✅ World interaction game data saved to: ${fileDir}`);

    // Save metadata
    const metadata = {
      fileId,
      originalFileName: path.basename(filePath),
      fileType,
      createdAt: new Date().toISOString(),
      worldSetting: {
        title: parsedData.worldSetting.title,
        playerName: parsedData.worldSetting.player.name
      },
      npcCount: parsedData.npcSetting.npcs?.length || 0,
      sceneCount: parsedData.sceneSetting.scenes?.length || 0
    };

    const metadataPath = path.join(fileDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    return {
      fileId,
      worldSetting: parsedData.worldSetting,
      npcSetting: parsedData.npcSetting,
      sceneSetting: parsedData.sceneSetting,
      metadata
    };

  } catch (error) {
    console.error('Error processing world interaction game document:', error);
    throw error;
  }
}

/**
 * Get world interaction game files by fileId
 */
export function getWorldInteractionGameFiles(fileId) {
  try {
    const fileDir = path.join(WORLD_INTERACTION_TEMP_DIR, fileId);

    if (!fs.existsSync(fileDir)) {
      throw new Error('File not found');
    }

    const worldSettingPath = path.join(fileDir, 'worldSetting.json');
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');
    const metadataPath = path.join(fileDir, 'metadata.json');

    const worldSetting = JSON.parse(fs.readFileSync(worldSettingPath, 'utf-8'));
    const npcSetting = JSON.parse(fs.readFileSync(npcSettingPath, 'utf-8'));
    const sceneSetting = JSON.parse(fs.readFileSync(sceneSettingPath, 'utf-8'));

    let metadata = null;
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    return {
      worldSetting,
      npcSetting,
      sceneSetting,
      metadata
    };
  } catch (error) {
    console.error('Error getting world interaction game files:', error);
    throw error;
  }
}

/**
 * List all available world interaction game files
 */
export function listWorldInteractionGameFiles() {
  try {
    if (!fs.existsSync(WORLD_INTERACTION_TEMP_DIR)) {
      return [];
    }

    const files = fs.readdirSync(WORLD_INTERACTION_TEMP_DIR);

    const fileList = files.map(fileId => {
      try {
        const metadataPath = path.join(WORLD_INTERACTION_TEMP_DIR, fileId, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        }
        return null;
      } catch (error) {
        return null;
      }
    }).filter(item => item !== null);

    return fileList;
  } catch (error) {
    console.error('Error listing world interaction game files:', error);
    return [];
  }
}

/**
 * Delete world interaction game files
 */
export function deleteWorldInteractionGameFiles(fileId) {
  try {
    const fileDir = path.join(WORLD_INTERACTION_TEMP_DIR, fileId);

    if (fs.existsSync(fileDir)) {
      fs.rmSync(fileDir, { recursive: true, force: true });
      console.log(`🗑️ Deleted world interaction game files: ${fileId}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error deleting world interaction game files:', error);
    throw error;
  }
}
