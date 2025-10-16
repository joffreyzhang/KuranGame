import express from 'express';
import {
  startGame,
  sendAction,
  getGameState,
  getCharacterStatus,
  updateCharacterStatusAPI,
  exportGameSave,
  listGameSaves,
  useItemAPI,
  getExportedGameData,
  listExportedSessions,
  getManifestAPI
} from '../controllers/gameController.js';
import {
  streamGameEvents,
  sendActionWithStream,
  sendActionWithTrueStreaming,
  getActiveConnections
} from '../controllers/sseController.js';

const router = express.Router();

// ========== Traditional REST API Endpoints ==========

// Start a new game session
router.post('/start', startGame);

// Send player action
router.post('/action', sendAction);

// Get current game state
router.get('/state/:sessionId', getGameState);

// Get character status
router.get('/status/:sessionId', getCharacterStatus);

// Update character status (manual update)
router.post('/status/:sessionId', updateCharacterStatusAPI);

// Export game save
router.get('/save/:sessionId', exportGameSave);

// List all game saves
router.get('/saves', listGameSaves);

// Use item from inventory
router.post('/use-item/:sessionId', useItemAPI);

// ========== SSE (Server-Sent Events) Endpoints ==========

// Connect to SSE stream for real-time game events
router.get('/stream/:sessionId', streamGameEvents);

// Send action with SSE streaming response
router.post('/stream/:sessionId/action', sendActionWithStream);

// Send action with true streaming from Claude API
router.post('/stream/:sessionId/action/true', sendActionWithTrueStreaming);

// Get active SSE connections (for debugging)
router.get('/stream/debug/connections', getActiveConnections);

// ========== Data Export Endpoints (for colleague's frontend) ==========

// Get manifest (central index of all sessions) - MUST be before /export/:sessionId
router.get('/manifest', getManifestAPI);

// List all exported sessions
router.get('/export', listExportedSessions);

// Get all exported game data for a session
router.get('/export/:sessionId', getExportedGameData);

export default router;

