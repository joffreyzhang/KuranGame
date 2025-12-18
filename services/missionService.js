import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { loadStatus } from './statusService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAME_DATA_DIR = path.join(__dirname, '../public/game_data');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Build rich context for mission generation
 * Includes scene data, NPCs, previous missions, and recent history
 */
export function buildGameContext(sessionId, session, gameData, playerData) {
  let context = '';

  // 1. World background
  if (gameData?.backgroundData?.worldBackground) {
    context += `## 世界背景: ${gameData.backgroundData.worldBackground.title || '游戏世界'}\n`;
    if (gameData.backgroundData.worldBackground.content && Array.isArray(gameData.backgroundData.worldBackground.content)) {
      context += gameData.backgroundData.worldBackground.content.slice(0, 3).join(' ') + '\n\n';
    }
  }

  // 2. Current location details
  const currentLocation = playerData.location || 'unknown';
  const currentScene = gameData?.worldData?.[currentLocation];
  if (currentScene) {
    context += `## 当前场景: ${currentScene.name} (ID: ${currentLocation})\n`;
    context += `场景描述: ${currentScene.description || '无描述'}\n\n`;

    // NPCs in current scene
    if (currentScene.npcs && currentScene.npcs.length > 0) {
      context += `### 场景中的NPC:\n`;
      currentScene.npcs.forEach(npc => {
        context += `- **${npc.name}** (${npc.job || npc.type || 'NPC'})\n`;
        if (npc.description) {
          context += `  ${npc.description}\n`;
        }
        if (playerData.relationships && playerData.relationships[npc.name]) {
          context += `  关系值: ${playerData.relationships[npc.name]}\n`;
        }
      });
      context += '\n';
    }

    // Buildings in current scene
    if (currentScene.buildings && currentScene.buildings.length > 0) {
      context += `### 场景中的建筑:\n`;
      currentScene.buildings.forEach(building => {
        context += `- **${building.name}** (${building.type || 'building'})\n`;
        if (building.description) {
          context += `  ${building.description}\n`;
        }
        if (building.features && building.features.length > 0) {
          context += `  功能: ${building.features.join(', ')}\n`;
        }
      });
      context += '\n';
    }
  }

  // 3. All unlocked scenes (for location-based missions)
  if (playerData.unlockedScenes && playerData.unlockedScenes.length > 0) {
    context += `## 已解锁的场景 (可用于任务目标):\n`;
    playerData.unlockedScenes.forEach(sceneId => {
      const scene = gameData?.worldData?.[sceneId];
      if (scene) {
        context += `- **${scene.name}** (ID: ${sceneId})`;
        if (scene.description) {
          context += ` - ${scene.description.substring(0, 50)}...`;
        }
        context += '\n';

        // Include NPCs in unlocked scenes for NPC missions
        if (scene.npcs && scene.npcs.length > 0) {
          context += `  NPCs: ${scene.npcs.map(npc => npc.name).join(', ')}\n`;
        }
      }
    });
    context += '\n';
  }

  // 4. Adjacent scenes (potential exploration targets)
  if (currentScene && currentScene.exits && Object.keys(currentScene.exits).length > 0) {
    context += `## 相邻场景 (可探索方向):\n`;
    Object.entries(currentScene.exits).forEach(([direction, targetSceneId]) => {
      const targetScene = gameData?.worldData?.[targetSceneId];
      const isUnlocked = playerData.unlockedScenes?.includes(targetSceneId);
      if (targetScene) {
        context += `- ${direction}: **${targetScene.name}** (ID: ${targetSceneId}) ${isUnlocked ? '✓已解锁' : '🔒未解锁'}\n`;
      }
    });
    context += '\n';
  }

  // 5. Recent game history (last 10 interactions for story context)
  const recentHistory = session.history?.slice(-10) || [];
  if (recentHistory.length > 0) {
    context += `## 最近的游戏历史 (避免重复，保持故事连贯):\n`;
    recentHistory.forEach(entry => {
      if (entry.type === 'player') {
        const message = entry.message.substring(0, 100);
        context += `- 玩家: ${message}${entry.message.length > 100 ? '...' : ''}\n`;
      } else if (entry.type === 'game') {
        // Extract first sentence or first 100 chars
        const message = entry.message.split('\n')[0].substring(0, 100);
        context += `- 游戏: ${message}${entry.message.length > 100 ? '...' : ''}\n`;
      }
    });
    context += '\n';
  }

  // 6. Previous missions context (avoid duplication)
  const missionData = loadMissions(sessionId);
  const completedMissions = missionData.missions.filter(m => m.status === 'completed');
  const activeMissions = missionData.missions.filter(m => m.status === 'active');

  if (completedMissions.length > 0) {
    context += `## 已完成的任务 (不要生成类似任务):\n`;
    completedMissions.slice(-5).forEach(mission => {
      context += `- **${mission.title}** (${mission.type})`;
      if (mission.description) {
        context += `: ${mission.description.substring(0, 60)}...`;
      }
      context += '\n';
    });
    context += '\n';
  }

  if (activeMissions.length > 0) {
    context += `## 当前活跃任务 (不要生成重复任务):\n`;
    activeMissions.forEach(mission => {
      context += `- **${mission.title}** (${mission.type}): ${mission.description}\n`;
      if (mission.requirements) {
        context += `  要求: ${JSON.stringify(mission.requirements)}\n`;
      }
    });
    context += '\n';
  }

  // 7. Player inventory summary (for item-based missions)
  if (playerData.inventory && playerData.inventory.items && playerData.inventory.items.length > 0) {
    context += `## 玩家当前物品:\n`;
    const itemNames = playerData.inventory.items.map(item => item.name || item.id).slice(0, 10);
    context += itemNames.join(', ');
    if (playerData.inventory.items.length > 10) {
      context += `, 等共${playerData.inventory.items.length}件物品`;
    }
    context += '\n\n';
  }

  return context;
}

/**
 * Get mission file path for a session
 */
function getMissionFilePath(sessionId) {
  const sessionDir = path.join(GAME_DATA_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return path.join(sessionDir, `missions_${sessionId}.json`);
}

/**
 * Load mission data for a session
 */
export function loadMissions(sessionId) {
  const filePath = getMissionFilePath(sessionId);

  if (fs.existsSync(filePath)) {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileData);
  }

  // Initialize new mission data
  return {
    missions: [],
    turnCount: 0,
    lastMissionTurn: -5 // Allow mission generation on first turn after 5 turns
  };
}

/**
 * Save mission data for a session
 */
export function saveMissions(sessionId, missionData) {
  const filePath = getMissionFilePath(sessionId);
  fs.writeFileSync(filePath, JSON.stringify(missionData, null, 2), 'utf-8');
}

/**
 * Increment turn counter
 */
export function incrementTurnCount(sessionId) {
  const missionData = loadMissions(sessionId);
  missionData.turnCount += 1;
  saveMissions(sessionId, missionData);
  return missionData.turnCount;
}

/**
 * Generate a story-critical mission using Claude AI based on narrative context
 * Story missions block the main storyline until completed
 */
export async function generateStoryMission(sessionId, playerData, gameContext, narrativeContext) {
  const missionData = loadMissions(sessionId);

  // Check if there's already an active story mission blocking the storyline
  const activeStoryMissions = missionData.missions.filter(m => m.status === 'active' && m.isStoryMission);
  if (activeStoryMissions.length > 0) {
    console.log('[Mission System] Story mission already active, skipping generation');
    return null;
  }

  console.log('[Mission System] Generating story-critical mission using AI...');

  // Use Claude to generate contextual story mission with multiple completion paths
  const prompt = `You are a mission designer for an interactive fiction game. Based on the narrative context and player's current state, generate ONE story-critical mission that BLOCKS the main storyline until completed.

**CRITICAL REQUIREMENTS:**
1. This mission MUST be directly related to the current story/narrative
2. The mission description must CLEARLY state what needs to be accomplished
3. Requirements must be EXPLICIT, QUANTIFIED, and ACHIEVABLE

**Player Summary:**
- Name: ${playerData.profile?.name || 'Player'}
- Current Location: ${playerData.location || 'unknown'}
- Stats: ${JSON.stringify(playerData.stats || {})}
- Inventory Items: ${playerData.inventory?.items?.length || 0} items
- Gold: ${playerData.currency?.gold || 0}

**DETAILED GAME CONTEXT:**
${gameContext || 'Interactive fiction adventure game'}

**NARRATIVE CONTEXT (what just happened in the story):**
${narrativeContext || 'Story is progressing'}

**IMPORTANT MISSION DESIGN GUIDELINES:**

1. **CONTEXT-AWARE**: The mission MUST reference actual elements from the game context above:
   - Use ONLY scene IDs and names that appear in "已解锁的场景" or "相邻场景" sections
   - Reference ONLY NPCs that are mentioned in the context
   - Consider the current scene description and what makes sense narratively

2. **STORY-RELEVANT**: Look at "最近的游戏历史" to create missions that feel like natural story progressions
   - What has the player been doing recently?
   - What NPCs have they talked to?
   - What challenges have they faced?

3. **AVOID DUPLICATION**: Check "已完成的任务" and "当前活跃任务" sections
   - DO NOT create missions similar to completed ones
   - DO NOT create missions similar to active ones
   - Vary the mission types (location, stat, item, npc, combat)

4. **VALID TARGETS ONLY**:
   - For location missions: Use scene IDs from "已解锁的场景" section ONLY
   - For NPC missions: Use NPC names from "场景中的NPC" sections ONLY
   - For stat missions: Use existing stat names from player stats
   - Never invent locations or NPCs that don't exist in the context!

**Mission Type Requirements:**

- **location**: Go to a specific unlocked scene
  - Example: Visit "village_square" (村中心) to meet someone

- **stat**: Reach a specific stat level (based on current stats)
  - Example: Increase "attack" from current ${playerData.stats?.attack || 10} to ${(playerData.stats?.attack || 10) + 5}

- **item**: Collect a specific item
  - Example: Find "wooden_sword" (木剑)

- **npc**: Build relationship with an NPC to target value
  - Example: Increase relationship with "陈老根" to 70 (current: ${playerData.relationships?.['陈老根'] || 0})

**Mission Design Examples:**

Example 1 - Item Collection Mission:
Title: "战前准备"
Description: "战争即将来临，你需要准备好装备才能参战。你需要收集：铠甲1副、弓1张、箭30支。"
Completion Path:
  Purchase equipment from blacksmith
    - Requirements: Visit blacksmith shop, have 150 gold, buy armor (50g), bow (60g), arrows x30 (40g)

Example 2 - Problem Solving Mission:
Title: "夺回货物"
Description: "你走私的手机被海关扣押了。你必须想办法拿回这批货物才能继续你的生意。"
Completion Path:
  Bribe the customs officer
    - Requirements: Buy luxury gift at shop (80g), visit customs office, give gift to Officer Wang, relationship with Wang >= 40

**OUTPUT FORMAT (return ONLY valid JSON):**
{
  "type": "story",
  "title": "Mission Title (简短有力的标题)",
  "description": "Clear description of what happened in the story and what the player MUST accomplish to continue (详细描述故事情境和必须完成的目标)",
  "isStoryMission": true,
  "blocksStoryline": true,
  "completionPaths": [
    {
      "pathId": "path_1",
      "name": "Path Name (完成方案名称)",
      "description": "How to complete this mission (完成任务的方法)",
      "requirements": {
        "items": [
          {"itemName": "item_name", "quantity": 1}
        ],
        "relationships": [
          {"npcName": "NPC_name", "minValue": 60}
        ],
        "locations": ["location_id_to_visit"],
        "stats": [
          {"statName": "stat_name", "minValue": 10}
        ]
      }
    }
  ],
  "reward": {
    "gold": 50,
    "items": ["reward_item_id"],
    "experience": 100
  }
}

**IMPORTANT RULES:**
1. Requirements MUST be quantified (specific numbers for items, gold, relationship values)
2. All items, NPCs, locations mentioned must exist in the game context above
3. Generate EXACTLY 1 completion path (keep it simple and focused)
4. All text in Chinese except for IDs and field names

Generate the story mission now (return ONLY valid JSON):`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 5000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Mission System] Failed to parse AI response:', content);
      return null;
    }

    const missionTemplate = JSON.parse(jsonMatch[0]);

    // Create mission object
    const newMission = {
      id: `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: missionTemplate.title,
      description: missionTemplate.description,
      type: 'story',
      isStoryMission: true,
      blocksStoryline: true,
      completionPaths: missionTemplate.completionPaths,
      reward: missionTemplate.reward,
      status: 'active',
      createdAt: new Date().toISOString(),
      createdTurn: missionData.turnCount,
      attemptedSubmissions: 0
    };

    // Add mission to data
    missionData.missions.push(newMission);
    missionData.lastMissionTurn = missionData.turnCount;
    missionData.hasActiveStoryMission = true;
    saveMissions(sessionId, missionData);

    console.log('[Mission System] Story mission generated:', newMission.id, newMission.title);
    console.log(`[Mission System] Storyline is now BLOCKED until mission completion`);
    return newMission;

  } catch (error) {
    console.error('[Mission System] Error generating story mission:', error.message);
    return null;
  }
}


/**
 * Check if a specific completion path's requirements are met
 */
function checkPathRequirements(path, playerData) {
  const requirements = path.requirements || {};
  const results = {
    met: true,
    details: {},
    missingRequirements: []
  };

  // Check items
  if (requirements.items && requirements.items.length > 0) {
    const itemsCheck = requirements.items.map(reqItem => {
      const playerItems = playerData.inventory?.items || [];
      const foundItem = playerItems.find(item =>
        item.name === reqItem.itemName || item.id === reqItem.itemName
      );
      const hasEnough = foundItem && (foundItem.quantity || 1) >= reqItem.quantity;

      if (!hasEnough) {
        results.met = false;
        results.missingRequirements.push({
          type: 'item',
          name: reqItem.itemName,
          required: reqItem.quantity,
          current: foundItem ? (foundItem.quantity || 1) : 0
        });
      }

      return { item: reqItem.itemName, required: reqItem.quantity, has: foundItem ? (foundItem.quantity || 1) : 0, met: hasEnough };
    });
    results.details.items = itemsCheck;
  }

  // Check relationships
  if (requirements.relationships && requirements.relationships.length > 0) {
    const relationshipsCheck = requirements.relationships.map(reqRel => {
      const currentValue = playerData.relationships?.[reqRel.npcName] || 0;
      const meetsRequirement = currentValue >= reqRel.minValue;

      if (!meetsRequirement) {
        results.met = false;
        results.missingRequirements.push({
          type: 'relationship',
          npc: reqRel.npcName,
          required: reqRel.minValue,
          current: currentValue
        });
      }

      return { npc: reqRel.npcName, required: reqRel.minValue, current: currentValue, met: meetsRequirement };
    });
    results.details.relationships = relationshipsCheck;
  }

  // Check locations visited
  if (requirements.locations && requirements.locations.length > 0) {
    const locationsCheck = requirements.locations.map(locId => {
      const visited = playerData.location === locId ||
                     (playerData.visitedLocations && playerData.visitedLocations.includes(locId)) ||
                     (playerData.unlockedScenes && playerData.unlockedScenes.includes(locId));

      if (!visited) {
        results.met = false;
        results.missingRequirements.push({
          type: 'location',
          location: locId,
          visited: false
        });
      }

      return { location: locId, visited, met: visited };
    });
    results.details.locations = locationsCheck;
  }

  // Check stats
  if (requirements.stats && requirements.stats.length > 0) {
    const statsCheck = requirements.stats.map(reqStat => {
      const currentValue = playerData.stats?.[reqStat.statName] || 0;
      const meetsRequirement = currentValue >= reqStat.minValue;

      if (!meetsRequirement) {
        results.met = false;
        results.missingRequirements.push({
          type: 'stat',
          stat: reqStat.statName,
          required: reqStat.minValue,
          current: currentValue
        });
      }

      return { stat: reqStat.statName, required: reqStat.minValue, current: currentValue, met: meetsRequirement };
    });
    results.details.stats = statsCheck;
  }

  return results;
}

/**
 * Manually submit a mission for completion validation
 * Checks all completion paths and returns which path (if any) was completed
 */
export function submitMissionForValidation(sessionId, missionId) {
  console.log(`[Mission System] Validating mission submission: ${missionId}`);

  const missionData = loadMissions(sessionId);
  const mission = missionData.missions.find(m => m.id === missionId);

  if (!mission) {
    return {
      success: false,
      error: 'Mission not found',
      missionId
    };
  }

  if (mission.status !== 'active') {
    return {
      success: false,
      error: 'Mission is not active',
      status: mission.status,
      missionId
    };
  }

  // Load current player data
  const playerData = loadStatus(sessionId);
  if (!playerData) {
    return {
      success: false,
      error: 'Player data not found',
      missionId
    };
  }

  // Increment attempt counter
  mission.attemptedSubmissions = (mission.attemptedSubmissions || 0) + 1;

  // Check if this is a story mission with multiple completion paths
  if (mission.isStoryMission && mission.completionPaths && mission.completionPaths.length > 0) {
    console.log(`[Mission System] Checking ${mission.completionPaths.length} completion paths...`);

    // Check each path
    const pathResults = mission.completionPaths.map(path => {
      const check = checkPathRequirements(path, playerData);
      return {
        pathId: path.pathId,
        pathName: path.name,
        completed: check.met,
        details: check.details,
        missingRequirements: check.missingRequirements
      };
    });

    // Find first completed path
    const completedPath = pathResults.find(p => p.completed);

    if (completedPath) {
      // Mission completed!
      mission.status = 'completed';
      mission.completedAt = new Date().toISOString();
      mission.completedTurn = missionData.turnCount;
      mission.completedViaPath = completedPath.pathId;

      // Unblock storyline
      if (mission.blocksStoryline) {
        missionData.hasActiveStoryMission = false;
      }

      saveMissions(sessionId, missionData);

      console.log(`✅ Mission completed via path: ${completedPath.pathName}`);

      return {
        success: true,
        completed: true,
        mission,
        completedPath: completedPath.pathId,
        completedPathName: completedPath.pathName,
        pathResults,
        message: `任务完成！完成方式：${completedPath.pathName}`
      };
    } else {
      // No path completed
      saveMissions(sessionId, missionData);

      console.log(`❌ Mission not completed. Attempts: ${mission.attemptedSubmissions}`);

      return {
        success: true,
        completed: false,
        mission,
        pathResults,
        message: '任务要求尚未满足，请继续完成任务目标。',
        attempts: mission.attemptedSubmissions
      };
    }
  } 
}

/**
 * Check if a mission is completed based on current player state (legacy format)
 */
export function checkMissionCompletion(mission, playerData) {
  if (mission.status !== 'active') {
    return false;
  }

  const { type, requirements } = mission;

  switch (type) {
    case 'location':
      // Check if player is at target location
      if (requirements.targetLocation && playerData.location === requirements.targetLocation) {
        return true;
      }
      break;

    case 'stat':
      // Check if player stat reached target value
      if (requirements.stat && requirements.value) {
        const currentValue = playerData.stats?.[requirements.stat] || 50;
        if (currentValue >= requirements.value) {
          return true;
        }
      }
      break;

    case 'item':
      // Check if player has the required item
      if (requirements.itemId || requirements.itemName) {
        const items = playerData.inventory?.items || [];
        const hasItem = items.some(item =>
          item.id === requirements.itemId ||
          item.name === requirements.itemName
        );
        if (hasItem) {
          return true;
        }
      }
      break;

    case 'npc':
      // Check if relationship with NPC reached target value
      if (requirements.npcName && requirements.value) {
        const relationshipValue = playerData.relationships?.[requirements.npcName] || 0;
        if (relationshipValue >= requirements.value) {
          return true;
        }
      }
      break;
  }

  return false;
}
/**
 * Get mission summary for display
 */
export function getMissionSummary(sessionId) {
  const missionData = loadMissions(sessionId);
  const active = missionData.missions.filter(m => m.status === 'active');
  const completed = missionData.missions.filter(m => m.status === 'completed');

  return {
    turnCount: missionData.turnCount,
    lastMissionTurn: missionData.lastMissionTurn,
    turnsUntilNextMission: Math.max(0, 5 - (missionData.turnCount - missionData.lastMissionTurn)),
    activeMissions: active,
    completedMissions: completed,
    totalMissions: missionData.missions.length
  };
}

/**
 * Check if the main storyline should be blocked
 * Returns the blocking mission if one exists
 */
export function checkStorylineBlocked(sessionId) {
  const missionData = loadMissions(sessionId);
  const blockingMission = missionData.missions.find(m =>
    m.status === 'active' && m.isStoryMission && m.blocksStoryline
  );

  return {
    blocked: !!blockingMission,
    mission: blockingMission || null,
    hasActiveStoryMission: missionData.hasActiveStoryMission || false
  };
}

/**
 * Abandon/give up an active mission
 * The mission is marked as abandoned, storyline is unblocked if it was a story mission,
 * and the player does NOT receive any rewards
 */
export function abandonMission(sessionId, missionId) {
  console.log(`[Mission System] Abandoning mission: ${missionId} for session: ${sessionId}`);

  const missionData = loadMissions(sessionId);
  const mission = missionData.missions.find(m => m.id === missionId);

  if (!mission) {
    return {
      success: false,
      error: 'Mission not found',
      missionId
    };
  }

  // Mark mission as abandoned
  mission.status = 'abandoned';
  mission.abandonedAt = new Date().toISOString();
  mission.abandonedTurn = missionData.turnCount;

  // Unblock storyline if this was a story mission
  if (mission.isStoryMission && mission.blocksStoryline) {
    missionData.hasActiveStoryMission = false;
    console.log('[Mission System] Storyline unblocked after mission abandonment');
  }

  saveMissions(sessionId, missionData);

  console.log(`✅ Mission abandoned: ${mission.title}`);

  return {
    success: true,
    abandoned: true,
    mission,
    message: `任务已放弃：${mission.title}。剧情将继续，但你不会获得任何奖励。`,
    storylineUnblocked: mission.isStoryMission && mission.blocksStoryline
  };
}

export default {
  loadMissions,
  saveMissions,
  incrementTurnCount,
  generateStoryMission,
  checkMissionCompletion,
  getMissionSummary,
  submitMissionForValidation,
  checkStorylineBlocked,
  abandonMission,
  buildGameContext
};
