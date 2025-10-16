import Anthropic from '@anthropic-ai/sdk';

// Initialize Claude client for extraction
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL,
});

/**
 * Extract game settings from PDF text content using Claude AI
 * This function uses LLM to accurately parse attributes and items from PDF
 */
export const extractGameSettings = async (pdfData, progressCallback) => {
  try {
    const text = pdfData.text;

    if (progressCallback) progressCallback(20);

    console.log('\n=== 📄 EXTRACTING GAME SETTINGS FROM PDF ===');
    console.log('PDF text length:', text.length);
    console.log('PDF preview:', text.substring(0, 500));

    // Use Claude AI for accurate initial extraction
    const llmExtraction = await extractWithClaude(text, progressCallback);

    if (progressCallback) progressCallback(100);

    console.log('✅ Extraction complete:', {
      title: llmExtraction.title,
      attributeCount: Object.keys(llmExtraction.initialAttributes || {}).length,
      itemCount: (llmExtraction.initialItems || []).length,
      characterCount: (llmExtraction.characters || []).length,
      locationCount: (llmExtraction.locations || []).length
    });

    return llmExtraction;
  } catch (error) {
    console.error('❌ Game settings extraction error:', error);
    throw new Error(`Failed to extract game settings: ${error.message}`);
  }
};

/**
 * Use Claude AI to extract game settings from PDF text
 */
async function extractWithClaude(text, progressCallback) {
  console.log('🤖 Using Claude AI for PDF extraction...');

  if (progressCallback) progressCallback(40);

  const prompt = `You are a game content analyzer. Extract ALL game settings from this PDF text.

PDF CONTENT:
${text}

Extract and return ONLY valid JSON in this EXACT format:
{
  "title": "Game title extracted from PDF",
  "description": "Brief description of the game",
  "characters": [
    {"name": "Character Name", "description": "Description"}
  ],
  "locations": [
    {"name": "Location Name", "description": "Description"}
  ],
  "items": [
    {"name": "Item Name", "description": "Description"}
  ],
  "rules": [
    "Rule 1",
    "Rule 2"
  ],
  "actionOptions": [
    {"text": "Action option text", "raw": "**!! Action option text !!**"}
  ],
  "initialAttributes": {
    "attribute_name": numeric_value,
    "another_attribute": numeric_value
  },
  "initialItems": [
    {"name": "Initial Item", "description": "Description", "quantity": 1, "value": 0}
  ],
  "narrative": {
    "fullText": "Full narrative text",
    "paragraphs": ["paragraph 1", "paragraph 2"],
    "wordCount": 1000
  }
}

IMPORTANT EXTRACTION RULES:
1. **initialAttributes**: Extract ALL attributes like 力量, 智力, 魅力, 年龄, 身高, 体重, 容貌, 月收入, 存款, etc.
   - Format: "属性名：数值" or "属性名: 数值/最大值" → extract numeric value
   - Example: "力量：10", "智力: 15/100" → {"力量": 10, "智力": 15}

2. **initialItems**: Extract ALL initial inventory items or starting assets
   - Look for sections like "物品", "道具", "资产", "家产"
   - Include quantity and value if mentioned

3. **actionOptions**: Extract action options marked with **!! text !!**

4. **characters**, **locations**, **items**: Extract from their respective sections

5. Return ONLY JSON, no explanation, no markdown code blocks`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    if (progressCallback) progressCallback(80);

    const responseText = message.content[0].text.trim();
    console.log('📝 Claude extraction response length:', responseText.length);

    // Try to extract JSON from response (handle markdown code blocks)
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const extractedData = JSON.parse(jsonText);
    console.log('✅ Claude extracted:', {
      title: extractedData.title,
      attributes: Object.keys(extractedData.initialAttributes || {}).length,
      items: (extractedData.initialItems || []).length
    });

    // Add metadata
    extractedData.metadata = {
      pages: 0,
      extractedAt: new Date().toISOString(),
      extractionMethod: 'claude-ai'
    };

    // Ensure all required fields exist
    extractedData.rawText = text;

    return extractedData;
  } catch (error) {
    console.error('❌ Claude extraction failed:', error);
    console.log('📋 Falling back to regex extraction...');

    // Fallback to regex-based extraction
    return extractWithRegex(text, progressCallback);
  }
}

/**
 * Fallback regex-based extraction (original method)
 */
function extractWithRegex(text, progressCallback) {
  console.log('📋 Using regex-based extraction (fallback)...');

  if (progressCallback) progressCallback(60);

  const gameSettings = {
    title: extractTitle(text),
    description: extractDescription(text),
    characters: extractCharacters(text),
    locations: extractLocations(text),
    items: extractItems(text),
    rules: extractRules(text),
    actionOptions: extractActionOptions(text),
    initialAttributes: extractInitialAttributes(text),
    initialItems: extractInitialItems(text),
    narrative: extractNarrative(text),
    rawText: text,
    metadata: {
      pages: 0,
      extractedAt: new Date().toISOString(),
      extractionMethod: 'regex'
    }
  };

  if (progressCallback) progressCallback(100);

  return gameSettings;
}

/**
 * Extract title from PDF text
 */
function extractTitle(text) {
  // Look for title patterns at the beginning of the document
  const lines = text.split('\n').filter(line => line.trim());
  
  // First non-empty line is often the title
  if (lines.length > 0) {
    return lines[0].trim();
  }
  
  return 'Untitled Game';
}

/**
 * Extract description/overview
 */
function extractDescription(text) {
  const lines = text.split('\n').filter(line => line.trim());
  
  // Look for description keywords
  const descPatterns = [
    /description[:\s]+(.+)/i,
    /overview[:\s]+(.+)/i,
    /summary[:\s]+(.+)/i,
    /about[:\s]+(.+)/i
  ];
  
  for (const pattern of descPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Return first few lines as description
  return lines.slice(1, 4).join(' ').substring(0, 500);
}

/**
 * Extract character information
 */
function extractCharacters(text) {
  const characters = [];
  
  // Look for character sections
  const charPattern = /character[s]?[:\s]+(.+?)(?=\n\n|\n[A-Z]|$)/gis;
  const matches = text.matchAll(charPattern);
  
  for (const match of matches) {
    const charText = match[1];
    const lines = charText.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      const nameParts = line.match(/^([^-:]+)[-:](.+)/);
      if (nameParts) {
        characters.push({
          name: nameParts[1].trim(),
          description: nameParts[2].trim()
        });
      }
    });
  }
  
  return characters;
}

/**
 * Extract location information
 */
function extractLocations(text) {
  const locations = [];
  
  // Look for location sections
  const locPattern = /location[s]?[:\s]+(.+?)(?=\n\n|\n[A-Z]|$)/gis;
  const matches = text.matchAll(locPattern);
  
  for (const match of matches) {
    const locText = match[1];
    const lines = locText.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      const nameParts = line.match(/^([^-:]+)[-:](.+)/);
      if (nameParts) {
        locations.push({
          name: nameParts[1].trim(),
          description: nameParts[2].trim()
        });
      }
    });
  }
  
  return locations;
}

/**
 * Extract items/objects
 */
function extractItems(text) {
  const items = [];
  
  // Look for item sections
  const itemPattern = /item[s]?[:\s]+(.+?)(?=\n\n|\n[A-Z]|$)/gis;
  const matches = text.matchAll(itemPattern);
  
  for (const match of matches) {
    const itemText = match[1];
    const lines = itemText.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      const nameParts = line.match(/^([^-:]+)[-:](.+)/);
      if (nameParts) {
        items.push({
          name: nameParts[1].trim(),
          description: nameParts[2].trim()
        });
      }
    });
  }
  
  return items;
}

/**
 * Extract game rules
 */
function extractRules(text) {
  const rules = [];
  
  // Look for rules sections
  const rulePattern = /rule[s]?[:\s]+(.+?)(?=\n\n[A-Z]|$)/gis;
  const matches = text.matchAll(rulePattern);
  
  for (const match of matches) {
    const ruleText = match[1];
    const lines = ruleText.split('\n').filter(line => line.trim());
    rules.push(...lines);
  }
  
  return rules;
}

/**
 * Extract action options from PDF
 * Looks for patterns like: **!! content !!**
 */
function extractActionOptions(text) {
  const options = [];

  // Pattern to match **!! content !!**
  const optionPattern = /\*\*!!\s*(.+?)\s*!!\*\*/g;
  const matches = text.matchAll(optionPattern);

  for (const match of matches) {
    const optionText = match[1].trim();
    if (optionText) {
      options.push({
        text: optionText,
        raw: match[0]
      });
    }
  }

  return options;
}

/**
 * Extract initial attributes from PDF
 * Looks for character stats, skills, and other attributes
 */
function extractInitialAttributes(text) {
  const attributes = {};

  // Pattern to match various attribute formats
  const patterns = [
    // Chinese patterns: 属性：数值, 属性: 数值, 属性数值
    /([^\s:：]+)[：:]\s*(\d+(?:\/\d+)?)/g,
    // Key-value pairs in character panels
    /([^\s:：]+)[：:]\s*([^|\n]+(?:\n(?!\s*[^\s:：]+[：:]).*)*)/g,
    // Look for sections that contain attributes
    /(?:人物面板|属性面板|技能面板|人物属性)[：\s]*?\n((?:[^\n]+\n?)*?)(?=\n\n|\n[A-Z]|$)/gi
  ];

  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const attrName = match[1]?.trim();
      const attrValue = match[2]?.trim();

      if (attrName && attrValue && isLikelyAttribute(attrName)) {
        // Try to parse numeric values
        const numericMatch = attrValue.match(/(\d+)(?:\/\d+)?/);
        if (numericMatch) {
          const numericValue = parseInt(numericMatch[1]);
          if (!isNaN(numericValue)) {
            attributes[attrName] = numericValue;
          }
        }
      }
    }
  });

  return attributes;
}

/**
 * Extract initial items from PDF
 * Looks for items, inventory, assets mentioned
 */
function extractInitialItems(text) {
  const items = [];

  // Pattern to match items in various formats
  const patterns = [
    // Items in lists: - Item Name: description
    /-?\s*([^\n:：]+)[：:]\s*([^|\n]+(?:\n(?!\s*[-•]|\d+\.).*)*)/g,
    // Items in parentheses or quotes
    /(?:物品|道具|资产|财产)[：\s]*?([^|\n]+(?:\n(?!\s*[^\s:：]+[：:]).*)*)/gi,
    // Look for sections mentioning items
    /(?:物品|道具|资产|财产|家产)[：\s]*?\n((?:[^\n]+\n?)*?)(?=\n\n|\n[A-Z]|$)/gi
  ];

  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const itemText = match[1] || match[0];
      if (itemText && itemText.length > 3) {
        // Extract individual items
        const itemMatches = itemText.matchAll(/([^\n,，、；;]+)(?:[：:]\s*([^,\n]+))?/g);
        for (const itemMatch of itemMatches) {
          const itemName = itemMatch[1]?.trim();
          const itemDesc = itemMatch[2]?.trim();

          if (itemName && itemName.length > 1 && !isCommonWord(itemName)) {
            items.push({
              name: itemName,
              description: itemDesc || `${itemName} - 从游戏设定中获得`,
              quantity: 1,
              value: 0
            });
          }
        }
      }
    }
  });

  return items;
}

/**
 * Check if a string is likely an attribute name
 */
function isLikelyAttribute(name) {
  const attributeKeywords = [
    '姓名', '性别', '年龄', '身高', '体重', '容貌', '性格', '出生', '学校', '派系',
    '月收入', '存款', '资产', '负债', '零花钱', '体力', '精神', '魅力', '智力',
    '力量', '敏捷', '幸运', '健康', '能量', '经验', '等级', '好感度', '声望',
    'name', 'age', 'height', 'weight', 'appearance', 'income', 'money', 'asset',
    'health', 'energy', 'strength', 'intelligence', 'charisma', 'luck', 'level'
  ];

  return attributeKeywords.some(keyword =>
    name.toLowerCase().includes(keyword.toLowerCase()) ||
    keyword.toLowerCase().includes(name.toLowerCase())
  );
}

/**
 * Check if a word is too common to be an item name
 */
function isCommonWord(word) {
  const commonWords = [
    '一个', '一个', '这个', '那个', '这些', '那些', '所有', '一些', '许多', '几个',
    '第一', '第二', '第三', '第四', '第五', '第六', '以及', '或者', '但是', '然而'
  ];

  return commonWords.includes(word.trim());
}


/**
 * Extract narrative/story content
 */
function extractNarrative(text) {
  // Return the full text as narrative content
  // In a more sophisticated implementation, you could extract specific story sections
  return {
    fullText: text,
    paragraphs: text.split('\n\n').filter(p => p.trim()),
    wordCount: text.split(/\s+/).length
  };
}

/**
 * Prepare game settings for LLM prompt
 */
export const prepareGameSettingsForLLM = (gameSettings) => {
  let prompt = `
Game Title: ${gameSettings.title}

Description: ${gameSettings.description}

Characters:
${gameSettings.characters.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Locations:
${gameSettings.locations.map(l => `- ${l.name}: ${l.description}`).join('\n')}

Items:
${gameSettings.items.map(i => `- ${i.name}: ${i.description}`).join('\n')}

Rules:
${gameSettings.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

  // Include action options if available
  if (gameSettings.actionOptions && gameSettings.actionOptions.length > 0) {
    prompt += `\n\nPredefined Action Options (extracted from PDF with **!! !! markers):
${gameSettings.actionOptions.map((opt, i) => `${i + 1}. ${opt.text}`).join('\n')}

Note: These are suggested action options. You can use them in your game responses when appropriate.`;
  }

  prompt += `\n\nFull Narrative Content:
${gameSettings.narrative.fullText}`;

  return prompt.trim();
};

