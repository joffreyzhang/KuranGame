import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStyleInstructions, getDefaultStyle } from './literaryStyleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAME_DATA_DIR = path.join(__dirname, '../public/game_data');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

export const generateNovel = async (sessionId, options = {}, onChunk = null) => {
  try {
    const {
      novelId = `novel_${Date.now()}`,
      title = 'Untitled Novel',
      theme = 'adventure',
      chapterCount = 5,
      style = 'literary',
      language = 'Chinese'
    } = options;

    // Load game data
    const historyData = loadHistoryData(sessionId);
    const loreData = loadLoreData(sessionId);
    const playerData = loadPlayerData(sessionId);
    const scenesData = loadScenesData(sessionId);
    console.log('Load Data.....');
    // Build system prompt for novel generation
    const systemPrompt = buildNovelSystemPrompt(loreData, theme, style, language, chapterCount);

    
    const gameContext = buildGameContext(historyData, playerData, scenesData);
    console.log('Prompt Completed!....');
    // Prepare Claude API request
    const messages = [
      {
        role: 'user',
        content: `Based on the following game context, write a ${language} novel with ${chapterCount} chapter(s), around 15000 words.If the game context data is not abundant enough Theme: ${theme}. Title: ${title}\n\n game context: ${gameContext}`
      }
    ];

    // Call Claude API
    let fullResponse = '';
    let tokenUsage = {
      inputTokens: 0,
      outputTokens: 0
    };

    if (onChunk) {
      // Streaming mode
      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 200000,
        system: systemPrompt,
        messages: messages,
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.text) {
          const token = chunk.delta.text;
          fullResponse += token;
          await onChunk(token);
        } else if (chunk.type === 'message_start') {
          tokenUsage.inputTokens = chunk.message.usage?.input_tokens || 0;
        } else if (chunk.type === 'message_delta') {
          tokenUsage.outputTokens = chunk.usage?.output_tokens || 0;
        }
      }
    } else {
      // Non-streaming mode
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 200000,
        system: systemPrompt,
        messages: messages,
        betas: ['context-1m-2025-08-07']
      });

      fullResponse = message.content[0].text;
      tokenUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      };
    }
    console.log('Token Usage: ', tokenUsage);
    // Parse chapters from response
    const chapters = parseChapters(fullResponse, chapterCount);

    // Build novel data structure
    const novelData = {
      sessionId,
      novelId,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      metadata: {
        title,
        theme,
        style,
        language,
        chapterCount: chapters.length,
        totalWordCount: countWords(fullResponse),
        totalTokens: tokenUsage.inputTokens + tokenUsage.outputTokens
      },
      tokenUsage,
      chapters,
      rawContent: fullResponse
    };

    // Save novel to file
    saveNovelData(sessionId, novelId, novelData);
    console.log('Novel Data Saved!');
    return novelData;
  } catch (error) {
    console.error('Error generating novel:', error);
    throw error;
  }
};


/**
 * Build system prompt for novel generation
 */
function buildNovelSystemPrompt(loreData, theme, style, language, chapterCount) {
  // Get literary style instructions from our centralized system
  const literaryStyleInstructions = getStyleInstructions(style || getDefaultStyle());

  const styleDescriptions = {
    literary: 'elegant, sophisticated prose with rich descriptions and deep character development',
    casual: 'conversational, accessible tone with clear storytelling',
    dramatic: 'intense, emotional prose with strong pacing and tension',
    poetic: 'lyrical, metaphorical language with artistic expression',
    thriller: 'fast-paced, suspenseful writing with plot twists',
    // Support for our new centralized styles
    delicate_psychological: 'delicate psychological exploration with rich inner world descriptions',
    straightforward_action: 'straightforward action-oriented narrative with fast pacing',
    poetic_literary: 'poetic and artistic literary expression',
    classical_historical: 'classical historical chronicle style',
    wuxia_martial: 'traditional martial arts fiction style',
    modern_contemporary: 'modern contemporary casual style'
  };

  return `You are a professional novelist writing a ${theme}-themed novel in ${language}.

WRITING STYLE: ${styleDescriptions[style] || style}

# 📖 详细文学风格要求 (Detailed Literary Style Requirements)

${literaryStyleInstructions}

WORLD SETTING:
${JSON.stringify(loreData.worldBackground, null, 2)}

GAME TIME PERIOD:
${JSON.stringify(loreData.gameTime, null, 2)}

KEY EVENTS TO REFERENCE:
${JSON.stringify(loreData.keyEvents, null, 2)}

INSTRUCTIONS:
1. Write ${chapterCount} chapter(s) based on the game context provided
2. Each chapter should be substantial (1500-3000 words)
3. Use vivid descriptions and engaging dialogue that match the literary style above
4. Maintain consistency with the world setting and lore
5. Incorporate elements from the player's journey and interactions
6. Each chapter should have a clear title in the format: "# Chapter X: [Title]"
7. Create compelling character arcs and plot development
8. Write entirely in ${language}
9. **CRITICAL**: Follow the literary style instructions above for all narrative, dialogue, and descriptions

OUTPUT FORMAT:
# Chapter 1: [Chapter Title]

[Chapter content here...]

# Chapter 2: [Chapter Title]

[Chapter content here...]

Begin writing the novel now.`;
}

/**
 * Build game context from history and player data
 */
function buildGameContext(historyData, playerData, scenesData) {
  let context = '';

  // Player information
  if (playerData && playerData.profile) {
    context += `PLAYER CHARACTER:\n`;
    context += `Name: ${playerData.profile.name}\n`;
    context += `Age: ${playerData.profile.age}\n`;
    context += `Gender: ${playerData.profile.gender}\n`;
    context += `Job: ${playerData.profile.job}\n\n`;
  }

  // Game history
  if (historyData && historyData.history) {
    context += `GAME NARRATIVE HISTORY:\n`;
    const recentHistory = historyData.history.slice(-20); // Last 20 interactions
    recentHistory.forEach(entry => {
      context += `[${entry.type}] ${entry.message}\n\n`;
    });
  }

  // Scene information
  if (scenesData) {
    context += `\nWORLD LOCATIONS:\n`;
    Object.values(scenesData).forEach(scene => {
      context += `- ${scene.name}: ${scene.description}\n`;
      if (scene.npcs && scene.npcs.length > 0) {
        context += `  NPCs: ${scene.npcs.map(npc => npc.name).join(', ')}\n`;
      }
    });
  }

  return context;
}

/**
 * Parse chapters from Claude response
 */
function parseChapters(content) {
  const chapters = [];
  const chapterRegex = /# Chapter (\d+):?\s*(.+?)(?=\n# Chapter \d+:|$)/gs;

  let match;
  let chapterNum = 1;

  while ((match = chapterRegex.exec(content)) !== null) {
    const chapterNumber = parseInt(match[1]);
    const chapterTitle = match[2].trim().split('\n')[0];
    const chapterContent = match[0].replace(/# Chapter \d+:?\s*.+?\n/, '').trim();

    chapters.push({
      id: `chapter_${chapterNumber}`,
      number: chapterNumber,
      title: chapterTitle || `Chapter ${chapterNumber}`,
      content: chapterContent,
      wordCount: countWords(chapterContent),
      createdAt: new Date().toISOString()
    });

    chapterNum++;
  }

  // If no chapters were parsed, treat entire content as single chapter
  if (chapters.length === 0) {
    chapters.push({
      id: 'chapter_1',
      number: 1,
      title: 'Chapter 1',
      content: content.trim(),
      wordCount: countWords(content),
      createdAt: new Date().toISOString()
    });
  }

  return chapters;
}

function countWords(text) {
  // Count both English words and Chinese characters
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  return englishWords.length + chineseChars.length;
}

/**
 * Load history data
 */
function loadHistoryData(sessionId) {
  try {
    const historyPath = path.join(GAME_DATA_DIR, `history_${sessionId}.json`);
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }
    return null;
  } catch (error) {
    console.error('Error loading history data:', error);
    return null;
  }
}

/**
 * Load lore data
 */
function loadLoreData(sessionId) {
  try {
    const lorePath = path.join(GAME_DATA_DIR, sessionId, `lore_${sessionId}.json`);
    if (fs.existsSync(lorePath)) {
      return JSON.parse(fs.readFileSync(lorePath, 'utf-8'));
    }
    throw new Error(`Lore file not found for sessionId: ${sessionId}`);
  } catch (error) {
    console.error('Error loading lore data:', error);
    throw error;
  }
}

/**
 * Load player data
 */
function loadPlayerData(sessionId) {
  try {
    const playerPath = path.join(GAME_DATA_DIR, `player_${sessionId}.json`);
    if (fs.existsSync(playerPath)) {
      return JSON.parse(fs.readFileSync(playerPath, 'utf-8'));
    }
    return null;
  } catch (error) {
    console.error('Error loading player data:', error);
    return null;
  }
}

/**
 * Load scenes data
 */
function loadScenesData(sessionId) {
  try {
    const scenesPath = path.join(GAME_DATA_DIR, sessionId, `scenes_${sessionId}.json`);
    if (fs.existsSync(scenesPath)) {
      return JSON.parse(fs.readFileSync(scenesPath, 'utf-8'));
    }
    return null;
  } catch (error) {
    console.error('Error loading scenes data:', error);
    return null;
  }
}

/**
 * Save novel data
 */
function saveNovelData(sessionId, novelId, novelData) {
  try {
    const novelPath = path.join(GAME_DATA_DIR, `novel_${sessionId}_${novelId}.json`);
    fs.writeFileSync(novelPath, JSON.stringify(novelData, null, 2), 'utf-8');
    console.log(`Novel saved: ${novelPath}`);
  } catch (error) {
    console.error('Error saving novel data:', error);
    throw error;
  }
}

/**
 * Load novel data
 */
export const loadNovelData = (sessionId, novelId) => {
  try {
    const novelPath = path.join(GAME_DATA_DIR, `novel_${sessionId}_${novelId}.json`);
    if (fs.existsSync(novelPath)) {
      return JSON.parse(fs.readFileSync(novelPath, 'utf-8'));
    }
    return null;
  } catch (error) {
    console.error('Error loading novel data:', error);
    return null;
  }
};

/**
 * Delete novel
 */
export const deleteNovel = (sessionId, novelId) => {
  try {
    const novelPath = path.join(GAME_DATA_DIR, `novel_${sessionId}_${novelId}.json`);
    if (fs.existsSync(novelPath)) {
      fs.unlinkSync(novelPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting novel:', error);
    throw error;
  }
};
