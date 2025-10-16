import crypto from 'crypto';
import {
  createGameSession,
  processPlayerAction,
  getSession,
  getCharacterStatus as getStatusFromService,
  updateCharacterStatus as updateStatusInService
} from '../services/gameService.js';
import { listAllSessions, exportStatus, useItem } from '../services/statusService.js';
import {
  exportAllGameData,
  exportLatestAction,
  listAvailableSessions,
  getGameData as getGameDataFromExport,
  getManifest
} from '../services/exportService.js';

export const startGame = async (req, res) => {
  try {
    const { fileId, playerName } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const sessionId = crypto.randomBytes(16).toString('hex');
    const session = await createGameSession(sessionId, fileId, playerName);

    // Export initial game data for colleague's frontend
    exportAllGameData(sessionId, session);

    res.json({
      success: true,
      sessionId,
      gameState: session.gameState,
      characterStatus: session.characterStatus,
      message: 'Game session created successfully'
    });
  } catch (error) {
    console.error('Start game error:', error);
    res.status(500).json({ error: 'Failed to start game', message: error.message });
  }
};

export const sendAction = async (req, res) => {
  try {
    const { sessionId, action } = req.body;

    if (!sessionId || !action) {
      return res.status(400).json({ error: 'sessionId and action are required' });
    }

    const result = await processPlayerAction(sessionId, action);

    // Export latest action and updated game data for colleague's frontend
    const session = getSession(sessionId);
    if (session) {
      exportAllGameData(sessionId, session);
      exportLatestAction(sessionId, {
        action,
        response: result.response,
        gameState: result.gameState,
        characterStatus: result.characterStatus,
        actionOptions: result.actionOptions
      });
    }

    res.json({
      success: true,
      response: result.response,
      gameState: result.gameState,
      characterStatus: result.characterStatus, // Include parsed character status
      actionOptions: result.actionOptions // Include extracted action options
    });
  } catch (error) {
    console.error('Action error:', error);
    res.status(500).json({ error: 'Failed to process action', message: error.message });
  }
};

export const getGameState = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      gameState: session.gameState,
      history: session.history,
      characterStatus: session.characterStatus
    });
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ error: 'Failed to get game state', message: error.message });
  }
};

export const getCharacterStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const status = getStatusFromService(sessionId);

    if (!status) {
      return res.status(404).json({ error: 'Character status not found' });
    }

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Get character status error:', error);
    res.status(500).json({ error: 'Failed to get character status', message: error.message });
  }
};

export const updateCharacterStatusAPI = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;

    const updatedStatus = updateStatusInService(sessionId, updates);

    res.json({
      success: true,
      status: updatedStatus
    });
  } catch (error) {
    console.error('Update character status error:', error);
    res.status(500).json({ error: 'Failed to update character status', message: error.message });
  }
};

export const exportGameSave = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const saveData = exportStatus(sessionId);

    if (!saveData) {
      return res.status(404).json({ error: 'Save data not found' });
    }

    res.json({
      success: true,
      saveData
    });
  } catch (error) {
    console.error('Export save error:', error);
    res.status(500).json({ error: 'Failed to export save', message: error.message });
  }
};

export const listGameSaves = async (req, res) => {
  try {
    const saves = listAllSessions();

    res.json({
      success: true,
      saves
    });
  } catch (error) {
    console.error('List saves error:', error);
    res.status(500).json({ error: 'Failed to list saves', message: error.message });
  }
};

export const useItemAPI = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    const result = useItem(sessionId, itemId);

    res.json({
      success: true,
      status: result.status,
      usedItem: result.usedItem,
      message: `Used ${result.usedItem.name}`
    });
  } catch (error) {
    console.error('Use item error:', error);
    res.status(500).json({ error: 'Failed to use item', message: error.message });
  }
};

/**
 * Get exported game data (for colleague's frontend)
 */
export const getExportedGameData = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const data = getGameDataFromExport(sessionId);

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'Game data not found' });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get exported game data error:', error);
    res.status(500).json({ error: 'Failed to get game data', message: error.message });
  }
};

/**
 * List all available sessions (for colleague's frontend)
 */
export const listExportedSessions = async (req, res) => {
  try {
    const sessions = listAvailableSessions();

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('List exported sessions error:', error);
    res.status(500).json({ error: 'Failed to list sessions', message: error.message });
  }
};

/**
 * Get manifest file (central index of all sessions)
 */
export const getManifestAPI = async (req, res) => {
  try {
    const manifest = getManifest();

    if (!manifest) {
      return res.status(404).json({ error: 'Manifest not found' });
    }

    res.json({
      success: true,
      ...manifest
    });
  } catch (error) {
    console.error('Get manifest error:', error);
    res.status(500).json({ error: 'Failed to get manifest', message: error.message });
  }
};

