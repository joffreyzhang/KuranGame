import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create public/game_data directory for colleague's frontend to access
const EXPORT_DIR = path.join(__dirname, '..', 'public', 'game_data');

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * Export session state to JSON file
 */
export const exportSessionState = (sessionId, sessionData) => {
  try {
    const filePath = path.join(EXPORT_DIR, `session_${sessionId}.json`);
    const data = {
      sessionId: sessionData.sessionId,
      fileId: sessionData.fileId,
      playerName: sessionData.playerName,
      gameState: sessionData.gameState,
      createdAt: sessionData.gameState.createdAt,
      lastUpdated: new Date().toISOString(),
      isInitialized: sessionData.gameState.isInitialized
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  } catch (error) {
    console.error('Error exporting session state:', error);
    throw error;
  }
};

/**
 * Export character status to JSON file
 */
export const exportCharacterStatus = (sessionId, characterStatus) => {
  try {
    const filePath = path.join(EXPORT_DIR, `status_${sessionId}.json`);
    const data = {
      sessionId,
      characterStatus,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  } catch (error) {
    console.error('Error exporting character status:', error);
    throw error;
  }
};

/**
 * Export game history to JSON file
 */
export const exportGameHistory = (sessionId, history) => {
  try {
    const filePath = path.join(EXPORT_DIR, `history_${sessionId}.json`);
    const data = {
      sessionId,
      history,
      lastUpdated: new Date().toISOString(),
      totalMessages: history.length
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  } catch (error) {
    console.error('Error exporting game history:', error);
    throw error;
  }
};

/**
 * Export latest action/response to JSON file
 */
export const exportLatestAction = (sessionId, latestData) => {
  try {
    const filePath = path.join(EXPORT_DIR, `latest_${sessionId}.json`);
    const data = {
      sessionId,
      ...latestData,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  } catch (error) {
    console.error('Error exporting latest action:', error);
    throw error;
  }
};

/**
 * Export all game data for a session
 */
export const exportAllGameData = (sessionId, sessionData) => {
  try {
    const exports = {
      session: exportSessionState(sessionId, sessionData),
      status: exportCharacterStatus(sessionId, sessionData.characterStatus),
      history: exportGameHistory(sessionId, sessionData.history)
    };

    // Update manifest after each export
    updateManifest();

    console.log(`✅ Exported all game data for session ${sessionId}`);
    return exports;
  } catch (error) {
    console.error('Error exporting all game data:', error);
    throw error;
  }
};

/**
 * List all available sessions
 */
export const listAvailableSessions = () => {
  try {
    const files = fs.readdirSync(EXPORT_DIR);
    const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));

    const sessions = sessionFiles.map(file => {
      const filePath = path.join(EXPORT_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        sessionId: data.sessionId,
        playerName: data.playerName,
        fileId: data.fileId,
        lastUpdated: data.lastUpdated,
        isInitialized: data.isInitialized
      };
    });

    return sessions;
  } catch (error) {
    console.error('Error listing sessions:', error);
    return [];
  }
};

/**
 * Get full game data for a session
 */
export const getGameData = (sessionId) => {
  try {
    const sessionPath = path.join(EXPORT_DIR, `session_${sessionId}.json`);
    const statusPath = path.join(EXPORT_DIR, `status_${sessionId}.json`);
    const historyPath = path.join(EXPORT_DIR, `history_${sessionId}.json`);
    const latestPath = path.join(EXPORT_DIR, `latest_${sessionId}.json`);

    const data = {};

    if (fs.existsSync(sessionPath)) {
      data.session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    }

    if (fs.existsSync(statusPath)) {
      data.status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    }

    if (fs.existsSync(historyPath)) {
      data.history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }

    if (fs.existsSync(latestPath)) {
      data.latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
    }

    return data;
  } catch (error) {
    console.error('Error getting game data:', error);
    return null;
  }
};

/**
 * Delete session data
 */
export const deleteSessionData = (sessionId) => {
  try {
    const files = [
      `session_${sessionId}.json`,
      `status_${sessionId}.json`,
      `history_${sessionId}.json`,
      `latest_${sessionId}.json`
    ];

    files.forEach(file => {
      const filePath = path.join(EXPORT_DIR, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    // Update manifest after deletion
    updateManifest();

    console.log(`✅ Deleted all data for session ${sessionId}`);
    return true;
  } catch (error) {
    console.error('Error deleting session data:', error);
    return false;
  }
};

/**
 * Update manifest file with all available sessions
 * This creates an index file that frontends can read to discover all sessions
 */
export const updateManifest = () => {
  try {
    const manifestPath = path.join(EXPORT_DIR, 'manifest.json');

    // Get all session files
    const files = fs.readdirSync(EXPORT_DIR);
    const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));

    const sessions = [];

    sessionFiles.forEach(file => {
      try {
        const filePath = path.join(EXPORT_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Extract sessionId from filename as backup
        const sessionIdFromFile = file.replace('session_', '').replace('.json', '');

        sessions.push({
          sessionId: data.sessionId || sessionIdFromFile,
          playerName: data.playerName || 'Unknown Player',
          fileId: data.fileId,
          createdAt: data.createdAt,
          lastUpdated: data.lastUpdated,
          isInitialized: data.isInitialized,
          // Add file references for easy access
          files: {
            session: `session_${data.sessionId || sessionIdFromFile}.json`,
            status: `status_${data.sessionId || sessionIdFromFile}.json`,
            history: `history_${data.sessionId || sessionIdFromFile}.json`,
            latest: `latest_${data.sessionId || sessionIdFromFile}.json`
          },
          // Add display-friendly information
          displayName: `${data.playerName || 'Unknown'} - ${new Date(data.lastUpdated).toLocaleString()}`,
          shortId: (data.sessionId || sessionIdFromFile).substring(0, 8)
        });
      } catch (error) {
        console.error(`Error reading session file ${file}:`, error);
      }
    });

    // Sort by last updated (newest first)
    sessions.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

    const manifest = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      totalSessions: sessions.length,
      sessions: sessions,
      // Add helpful metadata
      description: 'Manifest file listing all available game sessions',
      usage: {
        listAll: 'Read this file to get all available sessions',
        accessSession: 'Use files.session, files.status, etc. to access specific data',
        directAccess: 'Files can be accessed at /game_data/<filename>'
      }
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`✅ Manifest updated with ${sessions.length} sessions`);

    return manifest;
  } catch (error) {
    console.error('Error updating manifest:', error);
    return null;
  }
};

/**
 * Get manifest
 */
export const getManifest = () => {
  try {
    const manifestPath = path.join(EXPORT_DIR, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      // Create manifest if it doesn't exist
      return updateManifest();
    }

    const data = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting manifest:', error);
    return null;
  }
};
