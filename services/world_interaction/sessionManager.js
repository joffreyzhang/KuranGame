import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import {
  SESSIONS_DIR,
  loadJSONFile,
  saveJSONFile,
  loadGameFiles,
  getAllSubscenes,
  getKeyEventByIndex,
  validateSessionData
} from './utils.js';

/**
 * Create a new world interaction session
 * @param {string} fileId - Optional file ID from temp directory
 * @param {string} presetId - Optional preset ID from visual_saves directory
 */
export function createWorldInteractionSession(fileId = null, presetId = null) {
  try {
    console.log(`🎮 Creating world interaction session${fileId ? ` for fileId: ${fileId}` : ''}${presetId ? ` for presetId: ${presetId}` : ''}`);

    // Load game files from either temp directory (fileId) or visual_saves directory (presetId)
    const { worldSetting, npcSetting, sceneSetting } = loadGameFiles(fileId, presetId);

    // Create session
    const sessionId = randomUUID();
    const session = {
      sessionId,
      fileId: fileId || null,
      presetId: presetId || null,
      createdAt: new Date().toISOString(),

      // Game state
      currentRound: 1,
      currentKeyEventIndex: 0,
      completedKeyEvents: [],

      // Active events in current round
      activeEvents: [],

      // Event history across all rounds
      eventHistory: [],

      // World info
      worldInfo: {
        title: worldSetting.title,
        summary: worldSetting.summary,
        themes: worldSetting.Theme || [],
        premble: worldSetting.premble,
        image: worldSetting.worldMapImage
      },

      // Player info
      player: worldSetting.Player || worldSetting.player,

      // Track visited scenes/subscenes
      visitedScenes: [],
      visitedSubscenes: [],

      // Interaction history for chat display
      interactionHistory: []
    };

    // Create session directory
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save session data (without full game settings)
    const sessionData = {
      sessionId: session.sessionId,
      fileId: session.fileId,
      presetId: session.presetId,
      createdAt: session.createdAt,
      currentRound: session.currentRound,
      currentKeyEventIndex: session.currentKeyEventIndex,
      completedKeyEvents: session.completedKeyEvents,
      activeEvents: session.activeEvents,
      eventHistory: session.eventHistory,
      worldInfo: session.worldInfo,
      player: session.player,
      visitedScenes: session.visitedScenes,
      visitedSubscenes: session.visitedSubscenes,
      updatedAt: new Date().toISOString()
    };

    const sessionPath = path.join(sessionDir, 'session.json');
    saveJSONFile(sessionPath, sessionData);

    // Save game settings separately
    const worldPath = path.join(sessionDir, 'worldSetting.json');
    const npcPath = path.join(sessionDir, 'npcSetting.json');
    const scenePath = path.join(sessionDir, 'sceneSetting.json');

    saveJSONFile(worldPath, worldSetting);
    saveJSONFile(npcPath, npcSetting);
    saveJSONFile(scenePath, sceneSetting);

    // Initialize empty interaction history
    const historyData = {
      sessionId,
      interactions: [],
      lastUpdated: new Date().toISOString(),
      totalInteractions: 0
    };
    const historyPath = path.join(sessionDir, 'history.json');
    saveJSONFile(historyPath, historyData);

    console.log(`✅ Session created: ${sessionId}`);
    return session;
  } catch (error) {
    console.error('Error creating world interaction session:', error);
    throw error;
  }
}

/**
 * Load session by ID
 */
export function loadWorldInteractionSession(sessionId) {
  try {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    const sessionPath = path.join(sessionDir, 'session.json');

    // Load main session data
    const sessionData = loadJSONFile(sessionPath);

    // Load game settings from separate files
    const worldPath = path.join(sessionDir, 'worldSetting.json');
    const npcPath = path.join(sessionDir, 'npcSetting.json');
    const scenePath = path.join(sessionDir, 'sceneSetting.json');

    const worldSetting = fs.existsSync(worldPath) ? loadJSONFile(worldPath) : null;
    const npcSetting = fs.existsSync(npcPath) ? loadJSONFile(npcPath) : null;
    const sceneSetting = fs.existsSync(scenePath) ? loadJSONFile(scenePath) : null;

    // Load interaction history
    const historyPath = path.join(sessionDir, 'history.json');
    let interactionHistory = [];
    if (fs.existsSync(historyPath)) {
      const historyData = loadJSONFile(historyPath);
      interactionHistory = historyData.interactions || [];
    }

    // Reconstruct full session
    const session = {
      ...sessionData,
      worldSetting,
      npcSetting,
      sceneSetting,
      interactionHistory
    };

    validateSessionData(session);
    return session;
  } catch (error) {
    console.error('Error loading session:', error);
    throw error;
  }
}

/**
 * Save session
 */
export function saveWorldInteractionSession(session) {
  try {
    validateSessionData(session);

    const sessionDir = path.join(SESSIONS_DIR, session.sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save essential session data
    const sessionData = {
      sessionId: session.sessionId,
      fileId: session.fileId,
      presetId: session.presetId,
      createdAt: session.createdAt,
      currentRound: session.currentRound,
      currentKeyEventIndex: session.currentKeyEventIndex,
      completedKeyEvents: session.completedKeyEvents,
      activeEvents: session.activeEvents,
      eventHistory: session.eventHistory,
      worldInfo: session.worldInfo,
      player: session.player,
      visitedScenes: session.visitedScenes,
      visitedSubscenes: session.visitedSubscenes,
      updatedAt: new Date().toISOString()
    };

    const sessionPath = path.join(sessionDir, 'session.json');
    saveJSONFile(sessionPath, sessionData);

    // Save game settings separately (only if they exist in session)
    if (session.worldSetting) {
      const worldPath = path.join(sessionDir, 'worldSetting.json');
      if (!fs.existsSync(worldPath)) {
        saveJSONFile(worldPath, session.worldSetting);
      }
    }
    if (session.npcSetting) {
      const npcPath = path.join(sessionDir, 'npcSetting.json');
      if (!fs.existsSync(npcPath)) {
        saveJSONFile(npcPath, session.npcSetting);
      }
    }
    if (session.sceneSetting) {
      const scenePath = path.join(sessionDir, 'sceneSetting.json');
      if (!fs.existsSync(scenePath)) {
        saveJSONFile(scenePath, session.sceneSetting);
      }
    }

    // Save interaction history separately
    saveInteractionHistory(session.sessionId, session.interactionHistory || []);
  } catch (error) {
    console.error('Error saving session:', error);
    throw error;
  }
}

/**
 * Save interaction history to separate file
 */
export function saveInteractionHistory(sessionId, interactions) {
  try {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    const historyData = {
      sessionId,
      interactions: interactions || [],
      lastUpdated: new Date().toISOString(),
      totalInteractions: (interactions || []).length
    };
    const historyPath = path.join(sessionDir, 'history.json');
    saveJSONFile(historyPath, historyData);
  } catch (error) {
    console.error('Error saving interaction history:', error);
    throw error;
  }
}

/**
 * Add interaction to history
 */
export function addInteractionToHistory(session, interaction) {
  if (!session.interactionHistory) {
    session.interactionHistory = [];
  }

  session.interactionHistory.push({
    ...interaction,
    timestamp: new Date().toISOString()
  });

  saveInteractionHistory(session.sessionId, session.interactionHistory);
  return session;
}

/**
 * Get interaction history for a session
 */
export function getInteractionHistory(sessionId) {
  try {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    const historyPath = path.join(sessionDir, 'history.json');

    if (fs.existsSync(historyPath)) {
      const historyData = loadJSONFile(historyPath);
      return historyData.interactions || [];
    }

    return [];
  } catch (error) {
    console.error('Error getting interaction history:', error);
    return [];
  }
}

/**
 * Get current key event for session
 */
export function getCurrentKeyEvent(session, worldSetting) {
  return getKeyEventByIndex(worldSetting, session.currentKeyEventIndex);
}

/**
 * Check if all key events are completed
 */
export function isAllKeyEventsCompleted(session, worldSetting) {
  return session.completedKeyEvents.length >= worldSetting.keyEvents.length;
}

/**
 * Mark key event as completed and move to next
 */
export function completeCurrentKeyEvent(session, worldSetting) {
  const currentKeyEvent = getCurrentKeyEvent(session, worldSetting);

  if (currentKeyEvent && !session.completedKeyEvents.includes(session.currentKeyEventIndex)) {
    session.completedKeyEvents.push(session.currentKeyEventIndex);
    console.log(`✅ Key event ${session.currentKeyEventIndex} completed: ${currentKeyEvent.title}`);
  }

  // Move to next key event
  session.currentKeyEventIndex += 1;

  // Check if all events are done
  if (isAllKeyEventsCompleted(session, worldSetting)) {
    console.log('🎉 All key events completed! Game finished!');
  } else {
    const nextKeyEvent = getCurrentKeyEvent(session, worldSetting);
    console.log(`📍 Moving to next key event: ${nextKeyEvent?.title}`);
  }

  return session;
}

/**
 * Start a new round
 */
export async function startNewRound(session) {
  // Import here to avoid circular dependency
  const { loadGameFiles } = await import('./utils.js');
  const { generateAndDistributeEvent } = await import('./eventManager.js');

  const { worldSetting } = loadGameFiles(session.fileId, session.presetId);

  // Clear active events for new round
  session.activeEvents = [];

  // Increment round
  session.currentRound += 1;

  // Move to next key event
  session.currentKeyEventIndex += 1;

  console.log(`🔄 Starting round ${session.currentRound}`);

  // Check if there are more key events
  if (session.currentKeyEventIndex < worldSetting.keyEvents.length) {
    const newKeyEvent = worldSetting.keyEvents[session.currentKeyEventIndex];
    console.log(`📍 Moving to key event ${session.currentKeyEventIndex}: ${newKeyEvent.title}`);

    // Save session before generating events
    saveWorldInteractionSession(session);

    // Generate initial event for the new key event
    try {
      console.log(`🎲 Generating initial event for new key event...`);
      await generateAndDistributeEvent(session.sessionId);
    } catch (error) {
      console.error('Error generating initial event for new round:', error);
      // Don't throw - allow round to start even if event generation fails
    }
  } else {
    console.log('🎉 All key events completed! Game finished!');
    saveWorldInteractionSession(session);
  }

  // Reload session to get updated state
  return loadWorldInteractionSession(session.sessionId);
}

/**
 * Add event to session
 */
export function addEventToSession(session, event) {
  // Add to active events
  session.activeEvents.push(event);

  // Add to history
  session.eventHistory.push({
    ...event,
    round: session.currentRound,
    timestamp: new Date().toISOString()
  });

  saveWorldInteractionSession(session);
  return session;
}

/**
 * Terminate an event
 */
export function terminateEvent(session, eventId) {
  const eventIndex = session.activeEvents.findIndex(e => e.eventId === eventId);

  if (eventIndex === -1) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const event = session.activeEvents[eventIndex];
  event.status = 'completed';
  event.completedAt = new Date().toISOString();

  // Remove from active events
  session.activeEvents.splice(eventIndex, 1);

  console.log(`✅ Event terminated: ${eventId}`);

  saveWorldInteractionSession(session);
  return event;
}

/**
 * Get session state with full game data
 */
export function getSessionState(sessionId) {
  try {
    const session = loadWorldInteractionSession(sessionId);
    const { worldSetting, npcSetting, sceneSetting } = loadGameFiles(session.fileId, session.presetId);

    const currentKeyEvent = getCurrentKeyEvent(session, worldSetting);
    const allKeyEventsCompleted = isAllKeyEventsCompleted(session, worldSetting);

    return {
      sessionId: session.sessionId,
      fileId: session.fileId,
      currentRound: session.currentRound,
      worldInfo: worldSetting,      // Key event progress
      currentKeyEvent,
      currentKeyEventIndex: session.currentKeyEventIndex,
      completedKeyEvents: session.completedKeyEvents,
      totalKeyEvents: worldSetting.keyEvents.length,
      allKeyEventsCompleted,

      // Active events in current round
      activeEvents: session.activeEvents,

      // Scenes and NPCs
      scenes: sceneSetting.scenes,
      allSubscenes: getAllSubscenes(sceneSetting),
      npcs: npcSetting.npcs,

      totalEvents: session.eventHistory.length,
      eventHistory: session.eventHistory.slice(-10) // Last 10 events
    };
  } catch (error) {
    console.error('Error getting session state:', error);
    throw error;
  }
}
