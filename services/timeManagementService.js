import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadGameData } from './gameInitializationService.js';
import { loadStatus, saveStatus } from './statusService.js';
import { getSession } from './gameService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');

/**
 * Parse year string from keyEvents (e.g., "184年" -> 184, "208年以后" -> 208)
 */
function parseEventYear(yearString) {
  const match = yearString.match(/(\d+)年/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Convert absolute year to 建安 year
 * 建安1年 = 196 CE, so 建安year = absolute year - 195
 */
function toJiananYear(absoluteYear) {
  return absoluteYear - 195;
}

/**
 * Convert 建安 year to absolute year
 */
function toAbsoluteYear(jiananYear) {
  return jiananYear + 195;
}

/**
 * Determine current era index based on gameTime
 */
function getCurrentEraIndex(gameTime, keyEvents) {
  const currentAbsoluteYear = toAbsoluteYear(gameTime.currentYear);

  // Find the most recent event that has passed
  let currentEraIndex = 0;
  for (let i = 0; i < keyEvents.length; i++) {
    const eventYear = parseEventYear(keyEvents[i].year);
    if (eventYear && currentAbsoluteYear >= eventYear) {
      currentEraIndex = i;
    } else {
      break;
    }
  }

  return currentEraIndex;
}

/**
 * Calculate time difference between two eras
 */
function calculateTimeDifference(fromYear, toYear) {
  return toYear - fromYear;
}

/**
 * Simulate player growth over time period
 * Returns stat adjustments based on years passed
 */
function simulatePlayerGrowth(yearsPassed, currentStats) {
  const growthFactors = {
    health: 5 * yearsPassed,      // +5 health per year
    maxHealth: 5 * yearsPassed,   // +5 max health per year
    attack: 2 * yearsPassed,      // +2 attack per year
    defense: 2 * yearsPassed,     // +2 defense per year
    speed: 1 * yearsPassed        // +1 speed per year
  };

  const newStats = { ...currentStats };
  for (const [stat, growth] of Object.entries(growthFactors)) {
    if (newStats[stat] !== undefined) {
      newStats[stat] = Math.min(newStats[stat] + growth, 999); // Cap at 999
    }
  }

  return newStats;
}

/**
 * Generate narrative text for era transition
 */
function generateEraTransitionNarrative(fromEra, toEra, yearsPassed) {
  return `
[NARRATION: 时光流转，${yearsPassed}年光阴如白驹过隙。]

[NARRATION: ${fromEra.title}的硝烟已经散去，天下局势再次发生变化。]

[NARRATION: ${toEra.year}，${toEra.title}。]

[NARRATION: ${toEra.description}]

[HINT: 你在这${yearsPassed}年间不断成长，实力显著提升。]
  `.trim();
}

/**
 * Skip to the next era in the game timeline
 */
export async function skipToNextEra(sessionId) {
  console.log('\n=== ⏭️ SKIP TO NEXT ERA ===');
  console.log('Session ID:', sessionId);

  try {
    // Get session to determine file structure
    let session = getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed;

    // Load game data
    const gameData = loadGameData(identifier, isSessionId);
    if (!gameData || !gameData.backgroundData) {
      throw new Error('Game lore data not found');
    }

    const loreData = gameData.backgroundData;
    const keyEvents = loreData.keyEvents || [];
    const gameTime = loreData.gameTime || {};

    if (keyEvents.length === 0) {
      throw new Error('No key events defined in lore data');
    }

    // Determine current era
    const currentEraIndex = getCurrentEraIndex(gameTime, keyEvents);
    console.log(`📅 Current era: ${keyEvents[currentEraIndex].title} (index ${currentEraIndex})`);

    // Check if we're already at the last era
    if (currentEraIndex >= keyEvents.length - 1) {
      return {
        success: false,
        message: '已经到达最后一个时代，无法继续跳过。',
        currentEra: keyEvents[currentEraIndex]
      };
    }

    // Get next era
    const nextEraIndex = currentEraIndex + 1;
    const currentEra = keyEvents[currentEraIndex];
    const nextEra = keyEvents[nextEraIndex];

    console.log(`➡️ Skipping to: ${nextEra.title} (index ${nextEraIndex})`);

    // Calculate time difference
    const currentAbsoluteYear = toAbsoluteYear(gameTime.currentYear);
    const nextEventYear = parseEventYear(nextEra.year);
    const yearsPassed = calculateTimeDifference(currentAbsoluteYear, nextEventYear);

    console.log(`⏰ Years passed: ${yearsPassed}`);

    // Update game time
    const newGameTime = {
      ...gameTime,
      currentYear: toJiananYear(nextEventYear),
      currentMonth: 1,  // Reset to first month of the year
      currentDay: 1,    // Reset to first day
      season: '春'      // Spring season (first season)
    };

    // Update lore data
    loreData.gameTime = newGameTime;

    // Save updated lore data
    const loreFilePath = path.join(
      GAME_DATA_DIR,
      identifier,
      `lore_${identifier}.json`
    );
    fs.writeFileSync(loreFilePath, JSON.stringify(loreData, null, 2), 'utf-8');
    console.log('✅ Lore data updated with new game time');

    // Load and update player data
    const playerData = loadStatus(sessionId);
    if (playerData) {
      // Update player age
      const currentAge = playerData.profile?.age || 16;
      const newAge = currentAge + yearsPassed;

      if (!playerData.profile) playerData.profile = {};
      playerData.profile.age = newAge;

      // Simulate player growth
      const currentStats = playerData.stats || {};
      const newStats = simulatePlayerGrowth(yearsPassed, currentStats);
      playerData.stats = newStats;

      // Add currency growth (simulate wealth accumulation)
      if (playerData.currency) {
        playerData.currency.gold = (playerData.currency.gold || 0) + (yearsPassed * 50);
      }

      // Save updated player data
      saveStatus(sessionId, playerData);
      console.log('✅ Player data updated:', {
        ageChange: `${currentAge} -> ${newAge}`,
        statsGrowth: newStats
      });
    }

    // Generate transition narrative
    const narrative = generateEraTransitionNarrative(currentEra, nextEra, yearsPassed);

    return {
      success: true,
      message: `成功跳转到 ${nextEra.title}`,
      previousEra: {
        index: currentEraIndex,
        title: currentEra.title,
        year: currentEra.year
      },
      currentEra: {
        index: nextEraIndex,
        title: nextEra.title,
        year: nextEra.year,
        description: nextEra.description
      },
      timeChange: {
        yearsPassed,
        previousDate: `建安${gameTime.currentYear}年${gameTime.currentMonth}月${gameTime.currentDay}日`,
        newDate: `建安${newGameTime.currentYear}年${newGameTime.currentMonth}月${newGameTime.currentDay}日`
      },
      playerChanges: playerData ? {
        ageIncrease: yearsPassed,
        newAge: playerData.profile.age,
        statsGrowth: playerData.stats,
        goldGained: yearsPassed * 50
      } : null,
      narrative,
      updatedFiles: {
        lore: loreData,
        player: playerData
      }
    };

  } catch (error) {
    console.error('❌ Error skipping to next era:', error);
    throw error;
  }
}

/**
 * Get current era information
 */
export function getCurrentEraInfo(sessionId) {
  try {
    let session = getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed;

    const gameData = loadGameData(identifier, isSessionId);
    if (!gameData || !gameData.backgroundData) {
      throw new Error('Game lore data not found');
    }

    const loreData = gameData.backgroundData;
    const keyEvents = loreData.keyEvents || [];
    const gameTime = loreData.gameTime || {};

    const currentEraIndex = getCurrentEraIndex(gameTime, keyEvents);
    const currentEra = keyEvents[currentEraIndex];
    const nextEra = currentEraIndex < keyEvents.length - 1 ? keyEvents[currentEraIndex + 1] : null;

    return {
      success: true,
      currentEra: {
        index: currentEraIndex,
        title: currentEra.title,
        year: currentEra.year,
        description: currentEra.description
      },
      nextEra: nextEra ? {
        index: currentEraIndex + 1,
        title: nextEra.title,
        year: nextEra.year,
        description: nextEra.description
      } : null,
      gameTime: {
        yearName: gameTime.yearName,
        currentYear: gameTime.currentYear,
        currentMonth: gameTime.currentMonth,
        currentDay: gameTime.currentDay,
        season: gameTime.season
      },
      canSkipToNextEra: nextEra !== null
    };
  } catch (error) {
    console.error('Error getting current era info:', error);
    throw error;
  }
}
