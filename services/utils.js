import {loadGameData} from './gameInitializationService.js';

export function parseJSONFromResponse(responseText) {
  let jsonText = responseText.trim();

  // Try to extract JSON from markdown code blocks
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                    responseText.match(/```\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  // Try to extract JSON object if not already
  if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
    const objectMatch = jsonText.match(/(\{[\s\S]*\})/);
    if (objectMatch) {
      jsonText = objectMatch[1];
    }
  }

  try {
    // First attempt: direct parse
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn('⚠️ First JSON parse attempt failed, trying sanitization...');

    try {
      // Second attempt: sanitize common issues
      let sanitized = jsonText
        // Remove any text before first { or [
        .replace(/^[^{[]*/, '')
        // Remove any text after last } or ]
        .replace(/[^}\]]*$/, '')
        // Remove trailing commas before } or ]
        .replace(/,(\s*[}\]])/g, '$1')
        // Remove comments (// and /* */)
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      return JSON.parse(sanitized);
    } catch (secondError) {
      console.warn('⚠️ Second parse failed, trying aggressive cleanup...');

      try {
        // Third attempt: Fix common property name issues
        let aggressiveSanitized = jsonText
          .replace(/^[^{[]*/, '')
          .replace(/[^}\]]*$/, '')
          .replace(/,(\s*[}\]])/g, '$1')
          // Fix unquoted property names
          .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
          // Fix single-quoted property names and values
          .replace(/'/g, '"');

        return JSON.parse(aggressiveSanitized);
      } catch (thirdError) {
        console.error('❌ Failed to parse JSON after all attempts');
        console.error('Original error:', error.message);
        console.error('Second error:', secondError.message);
        console.error('Third error:', thirdError.message);
        console.error('Response preview:', responseText.substring(0, 500));
        console.error('Problem area around position', error.message.match(/position (\d+)/)?.[1], ':');

        // Try to show the problematic area
        const position = parseInt(error.message.match(/position (\d+)/)?.[1] || '0');
        if (position > 0) {
          const start = Math.max(0, position - 100);
          const end = Math.min(jsonText.length, position + 100);
          console.error('Context:', jsonText.substring(start, end));
        }

        throw new Error(`Failed to parse LLM response as JSON: ${error.message}`);
      }
    }
  }
}

/**
 * Deep merge objects
 */
export function deepMerge(target, source) {
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
 * Format nested attributes into display-friendly structure
 */
export function formatAttributesForDisplay(attributes) {
  const display = [];

  if (!attributes || Object.keys(attributes).length === 0) {
    return display;
  }

  Object.entries(attributes).forEach(([category, attrs]) => {
    if (typeof attrs === 'object' && attrs !== null) {
      if (Array.isArray(attrs)) {
        // Handle skill arrays
        display.push({
          category,
          type: 'skill_array',
          items: attrs.map(skill => ({
            name: skill.name || skill,
            level: skill.level || 0,
            description: skill.description || ''
          }))
        });
      } else {
        // Handle nested objects
        const items = [];
        Object.entries(attrs).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            // Nested skill categories
            items.push({
              key,
              type: 'skill_category',
              skills: value.map(skill => ({
                name: skill.name,
                level: skill.level || 0,
                description: skill.description || ''
              }))
            });
          } else if (typeof value === 'object' && value !== null) {
            // Nested objects - stringify
            items.push({
              key,
              type: 'object',
              value: JSON.stringify(value)
            });
          } else {
            // Primitive values
            items.push({
              key,
              type: 'primitive',
              value: String(value) // Convert to string to avoid [object Object]
            });
          }
        });

        display.push({
          category,
          type: 'nested_object',
          items
        });
      }
    }
  });

  return display;
}


/**
 * Prepare game data for LLM prompt by loading structured JSON files
 * Supports both session directories and fileId directories
 */
export function prepareGameDataForLLM(identifier, isSessionId = false, unlockedScenes = null) {
  console.log(`📋 Preparing LLM prompt from game data for ${isSessionId ? 'session' : 'file'}: ${identifier}`);

  const gameData = loadGameData(identifier, isSessionId);
  if (!gameData) {
    throw new Error(`Game data not found for ${isSessionId ? 'session' : 'file'}: ${identifier}`);
  }
  const { backgroundData, playerData, itemData, worldData } = gameData;

  // Build comprehensive prompt from structured data
  let prompt = '';
  // 1. Background Information
  if (backgroundData?.worldBackground) {
    prompt += `\n=== 时代背景 (Era Background) ===\n`;
    prompt += `标题: ${backgroundData.worldBackground.title || 'Unknown'}\n`;
    if (backgroundData.worldBackground.content?.length > 0) {
      prompt += `背景描述:\n${backgroundData.worldBackground.content.map(c => `  - ${c}`).join('\n')}\n`;
    }
  }
  // 2. Player Story
  if (backgroundData?.playerStory) {
    prompt += `\n=== 主角背景 (Protagonist Background) ===\n`;
    if (backgroundData.playerStory.content?.length > 0) {
      prompt += `背景故事:\n${backgroundData.playerStory.content.map(c => `  - ${c}`).join('\n')}\n`;
    }
  }

  // 4. Game Time
  if (backgroundData?.gameTime) {
    prompt += `\n=== 游戏时间 (Game Time) ===\n`;
    prompt += `纪元: ${backgroundData.gameTime.yearName || 'Unknown'}\n`;
    prompt += `当前年: ${backgroundData.gameTime.currentYear || 'Unknown'}\n`;
    prompt += `当前月: ${backgroundData.gameTime.currentMonth || 'Unknown'}\n`;
    prompt += `当前日: ${backgroundData.gameTime.currentDay || 'Unknown'}\n`;
    if (backgroundData.gameTime.monthNames?.length > 0) {
      prompt += `月份名称: ${backgroundData.gameTime.monthNames.join(', ')}\n`;
    }
    prompt += `季节: ${backgroundData.gameTime.season || 'Unknown'}\n`;
  }

  // 5. Player Profile
  if (playerData?.profile) {
    prompt += `\n=== 玩家资料 (Player Profile) ===\n`;
    prompt += `头像: ${playerData.profile.avatar || 'N/A'}\n`;
    prompt += `姓名: ${playerData.profile.name || 'Unknown'}\n`;
    prompt += `年龄: ${playerData.profile.age || 'Unknown'}\n`;
    prompt += `性别: ${playerData.profile.gender || 'Unknown'}\n`;
    prompt += `职业: ${playerData.profile.job || 'Unknown'}\n`;
  }

  // 6. Player Stats
  if (playerData?.stats) {
    prompt += `\n=== 玩家属性 (Player Stats) ===\n`;
    prompt += ` ${playerData.stats || 'Unknown'}\n`;
  }

  // 7. Player Currency
  if (playerData?.currency) {
    prompt += `\n=== 玩家货币 (Player Currency) ===\n`;
    prompt += `金币: ${playerData.currency.gold || 'Unknown'}\n`;
  }

  // 8. Initial Inventory
  if (playerData?.inventory?.items?.length > 0) {
    prompt += `\n=== 玩家拥有的物品 ===\n`;
    playerData.inventory.items.forEach(item => {
      prompt += `- ${item.name} x${item.quantity}`;
      if (item.description) prompt += `: ${item.description}`;
      prompt += `\n`;
    });
  }

  // 9. World - Scenes/Locations
  const sceneEntries = Object.entries(worldData || {});
  if (sceneEntries.length > 0) {
    prompt += `\n=== 场景/地点 (Locations) ===\n`;

    // Separate unlocked and locked scenes
    const allScenes = sceneEntries.map(([sceneId, scene]) => ({ sceneId, ...scene }));

    if (unlockedScenes && Array.isArray(unlockedScenes)) {
      // Scene unlock system is active
      const unlockedSceneSet = new Set(unlockedScenes);

      // Find adjacent locked scenes (connected to unlocked scenes via exits)
      const adjacentLockedScenes = new Set();
      allScenes.forEach(scene => {
        if (unlockedSceneSet.has(scene.sceneId) && scene.exits) {
          Object.values(scene.exits).forEach(exitSceneId => {
            if (!unlockedSceneSet.has(exitSceneId)) {
              adjacentLockedScenes.add(exitSceneId);
            }
          });
        }
      });

      prompt += `\n已解锁场景 (Unlocked Scenes):\n`;
      allScenes.forEach(scene => {
        if (!unlockedSceneSet.has(scene.sceneId)) return; // Skip locked scenes

        prompt += `- ${scene.name} (${scene.sceneId}): ${scene.description || 'No description'}\n`;
        if (scene.background) prompt += `  背景: ${scene.background}\n`;

        // Buildings in this scene
        if (scene.buildings?.length > 0) {
          prompt += `  建筑:\n`;
          scene.buildings.forEach(building => {
            prompt += `    - ${building.name} (${building.type}): ${building.description || 'No description'}\n`;
            if (building.features?.length > 0) {
              prompt += `      特色: ${building.features.join(', ')}\n`;
            }
          });
        }

        // NPCs in this scene
        if (scene.npcs?.length > 0) {
          prompt += `  NPC:\n`;
          scene.npcs.forEach(npc => {
            prompt += `    - ${npc.name} (${npc.age}岁, ${npc.gender}, ${npc.job}): ${npc.description || 'No description'}\n`;
            if (npc.relationships) {
              const relationships = Object.entries(npc.relationships).map(([name, rel]) => `${name}(${rel})`).join(', ');
              prompt += `      关系: ${relationships}\n`;
            }
          });
        }

        // Events and exits
        if (scene.events?.length > 0) {
          prompt += `  事件: ${scene.events.join(', ')}\n`;
        }
        if (scene.exits && Object.keys(scene.exits).length > 0) {
          const exitInfo = Object.entries(scene.exits).map(([dir, dest]) => {
            const isUnlocked = unlockedSceneSet.has(dest);
            return `${dir} -> ${dest}${isUnlocked ? '' : ' (🔒未解锁)'}`;
          }).join(', ');
          prompt += `  出口: ${exitInfo}\n`;
        }
      });

      // Show adjacent locked scenes (for context)
      if (adjacentLockedScenes.size > 0) {
        prompt += `\n相邻的锁定场景 (Adjacent Locked Scenes):\n`;
        allScenes.forEach(scene => {
          if (!adjacentLockedScenes.has(scene.sceneId)) return;
          prompt += `- ${scene.name} (${scene.sceneId}): 🔒 此场景尚未解锁\n`;
        });
      }

    } else {
      // No unlock system - show all scenes (default behavior)
      allScenes.forEach(scene => {
        prompt += `- ${scene.name}: ${scene.description || 'No description'}\n`;
        if (scene.background) prompt += `  背景: ${scene.background}\n`;

        // Buildings in this scene
        if (scene.buildings?.length > 0) {
          prompt += `  建筑:\n`;
          scene.buildings.forEach(building => {
            prompt += `    - ${building.name} (${building.type}): ${building.description || 'No description'}\n`;
            if (building.features?.length > 0) {
              prompt += `      特色: ${building.features.join(', ')}\n`;
            }
          });
        }

        // NPCs in this scene
        if (scene.npcs?.length > 0) {
          prompt += `  NPC:\n`;
          scene.npcs.forEach(npc => {
            prompt += `    - ${npc.name} (${npc.age}岁, ${npc.gender}, ${npc.job}): ${npc.description || 'No description'}\n`;
            if (npc.relationships) {
              const relationships = Object.entries(npc.relationships).map(([name, rel]) => `${name}(${rel})`).join(', ');
              prompt += `      关系: ${relationships}\n`;
            }
          });
        }
        // Events and exits
        if (scene.events?.length > 0) {
          prompt += `  事件: ${scene.events.join(', ')}\n`;
        }
        if (scene.exits && Object.keys(scene.exits).length > 0) {
          prompt += `  出口: ${Object.entries(scene.exits).map(([dir, dest]) => `${dir} -> ${dest}`).join(', ')}\n`;
        }
      });
    }
  }

  console.log(`✅ LLM prompt prepared (${prompt.length} characters)`);
  return prompt.trim();
}
