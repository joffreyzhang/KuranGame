import { processPlayerAction, getSession } from '../services/gameService.js';
import { completeGameSessionByParams } from '../login/controller/gamesController.js';
import { loadGameData } from '../services/gameInitializationService.js';
import { loadStatus } from '../services/statusService.js';

// Store active SSE connections
const activeConnections = new Map();

/**
 * SSE connection for game session streaming
 * GET /api/backend/game/session/:sessionId/stream
 */
export const connectToSessionStream = (req, res) => {
  const { sessionId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    sessionId,
    message: 'Connected to game session stream',
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Store connection
  if (!activeConnections.has(sessionId)) {
    activeConnections.set(sessionId, new Set());
  }
  activeConnections.get(sessionId).add(res);

  console.log(`✅ SSE connection opened for session: ${sessionId}`);

  // Handle client disconnect
  req.on('close', () => {
    const connections = activeConnections.get(sessionId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        activeConnections.delete(sessionId);
      }
    }
    console.log(`❌ SSE connection closed for session: ${sessionId}`);
  });

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    const connections = activeConnections.get(sessionId);
    if (connections && connections.has(res)) {
      try {
        res.write(`:heartbeat\n\n`);
      } catch (error) {
        clearInterval(heartbeat);
      }
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);
};

/**
 * Send action with SSE streaming response
 * POST /api/backend/game/session/:sessionId/stream/action
 */
export const sendActionWithStream = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required'
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'processing',
      message: 'Processing your action...',
      action
    })}\n\n`);

    // Process action with streaming
    const result = await processPlayerAction(sessionId, action, (chunk) => {
      // Stream LLM response chunks as they arrive
      res.write(`data: ${JSON.stringify({
        type: 'chunk',
        content: chunk
      })}\n\n`);
    });

    // Get session to load files
    const session = getSession(sessionId);
    if (!session) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Session not found'
      })}\n\n`);
      res.end();
      return;
    }

    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed || false;
    const gameData = loadGameData(identifier, isSessionId);
    const playerData = loadStatus(sessionId);

    // Send completion event with all data
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      response: result.response,
      actionOptions: result.actionOptions,
      gameState: result.gameState,
      characterStatus: result.characterStatus,
      isInitialized: result.isInitialized,
      updatedFiles: {
        lore: gameData?.backgroundData || null,
        player: playerData || null,
        items: gameData?.itemData || null,
        scenes: gameData?.worldData || null
      },
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Send final completion marker
    res.write(`event: complete\ndata: ${JSON.stringify({ success: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Send action with stream error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to process action',
      message: error.message
    })}\n\n`);
    res.end();
  }
};

/**
 * Send action with TRUE streaming from Claude API
 * POST /api/backend/game/session/:sessionId/stream/action-live
 */
export const sendActionWithLiveStream = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required'
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: 'Starting narrative generation...',
      action
    })}\n\n`);

    // Process action with TRUE streaming from Claude (now sends structured steps)
    const result = await processPlayerAction(sessionId, action, (data, index) => {
      // The chunk is already JSON string from parseNarrativeSteps
      res.write(`data: ${data}\n`);
    });

    // Get session and load files
    const session = getSession(sessionId);
    if (!session) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Session not found'
      })}\n\n`);
      res.end();
      return;
    }

    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed || false;
    const gameData = loadGameData(identifier, isSessionId);
    const playerData = loadStatus(sessionId);

    // Send final completion event with all data
    res.write(`data: ${JSON.stringify({
      type: 'data',
      success: true,
      response: result.response,
      narrativeSteps: result.narrativeSteps,
      actionOptions: result.actionOptions,
      gameState: result.gameState,
      characterStatus: result.characterStatus,
      completedMissions: result.completedMissions,
      newMission: result.newMission,
      newAchievements: result.newAchievements,
      isInitialized: result.isInitialized,
      updatedFiles: {
        lore: gameData?.backgroundData || null,
        player: playerData || null,
        items: gameData?.itemData || null,
        scenes: gameData?.worldData || null
      },
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.write(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Live stream error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to process action',
      message: error.message
    })}\n\n`);
    res.end();
  }
};

/**
 * Broadcast message to all connections for a session
 */
export const broadcastToSession = (sessionId, data) => {
  const connections = activeConnections.get(sessionId);
  if (connections) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    connections.forEach(res => {
      try {
        res.write(message);
      } catch (error) {
        console.error('Error broadcasting to connection:', error);
      }
    });
  }
};

/**
 * Get active connections info (for debugging)
 * GET /api/backend/debug/connections
 */
export const getActiveConnections = (req, res) => {
  const info = Array.from(activeConnections.entries()).map(([sessionId, connections]) => ({
    sessionId,
    connectionCount: connections.size
  }));

  res.json({
    success: true,
    totalSessions: activeConnections.size,
    connections: info
  });
};

// ============================================
// BUILDING INTERACTION WITH SSE STREAMING
// ============================================

/**
 * Building interaction with SSE streaming
 * POST /api/backend/game/session/:sessionId/building-interaction/stream
 */
export const buildingInteractionWithStream = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sceneId, buildingId, action, branchId, turnNumber } = req.body;

    // Validate required inputs
    if (!sceneId) {
      return res.status(400).json({
        success: false,
        error: 'sceneId is required'
      });
    }

    if (!buildingId) {
      return res.status(400).json({
        success: false,
        error: 'buildingId is required'
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required'
      });
    }

    const currentTurn = turnNumber || 1;
    const maxTurns = 5;

    // Check turn limit
    if (currentTurn > maxTurns) {
      return res.status(400).json({
        success: false,
        error: 'Maximum turns exceeded',
        message: `Building interactions are limited to ${maxTurns} turns`
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: 'Processing building interaction...',
      building: buildingId,
      action,
      turnNumber: currentTurn,
      maxTurns
    })}\n\n`);

    const session = getSession(sessionId);
    if (!session) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Session not found'
      })}\n\n`);
      res.end();
      return;
    }

    // Load game data (use session directory if pre-processed)
    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed || false;
    const gameData = loadGameData(identifier, isSessionId);
    if (!gameData || !gameData.worldData) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Game data not found'
      })}\n\n`);
      res.end();
      return;
    }

    // Find the scene
    const scene = gameData.worldData[sceneId];
    if (!scene) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Scene not found'
      })}\n\n`);
      res.end();
      return;
    }

    // Find the building
    const building = scene.buildings?.find(b => b.id === buildingId);
    if (!building) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Building not found'
      })}\n\n`);
      res.end();
      return;
    }

    // Load player data
    const playerData = loadStatus(sessionId);
    if (!playerData) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Player data not found',
        message: 'No player data exists for this session. Please create a game session first.'
      })}\n\n`);
      res.end();
      return;
    }

    // Store player data before for change detection
    const playerDataBefore = JSON.parse(JSON.stringify(playerData));

    let fullResponse = '';

    // Process the building interaction with streaming
    const { processBuildingInteraction } = await import('../services/gameService.js');

    const result = await processBuildingInteraction(
      sessionId,
      {
        scene,
        building,
        action,
        branchId,
        turnNumber: currentTurn,
        maxTurns,
        playerData: playerData.data,
        session: session  // Pass entire session object
      },
      // Stream callback
      (chunk, index) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({
          type: 'stream',
          content: chunk,
          chunkIndex: index
        })}\n\n`);
      }
    );

    // Load updated data to detect changes
    const updatedPlayerData = loadStatus(sessionId);
    const updatedGameData = loadGameData(identifier, isSessionId);

    // Detect state changes
    const stateChanges = detectStateChanges(
      playerDataBefore,
      updatedPlayerData
    );

    // Determine if user can continue
    const canContinue = currentTurn < maxTurns && !result.shouldEnd;

    // Send completion event with all data
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      branchId: result.branchId,
      turnNumber: currentTurn,
      maxTurns,
      canContinue,
      building: {
        id: building.id,
        name: building.name,
        description: building.description
      },
      narrative: result.narrative,
      options: result.options,
      stateChanges,
      characterStatus: updatedPlayerData,
      updatedFiles: {
        lore: updatedGameData.backgroundData,
        player: updatedPlayerData,
        items: updatedGameData.itemData,
        scenes: updatedGameData.worldData
      },
      metadata: result.metadata,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Send final completion marker
    res.write(`event: complete\ndata: ${JSON.stringify({ success: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Building interaction stream error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to process building interaction',
      message: error.message
    })}\n\n`);
    res.end();
  }
};

/**
 * Building feature interaction with SSE streaming (single-turn)
 * POST /api/backend/game/session/:sessionId/building-feature/stream
 */
export const buildingFeatureInteractionWithStream = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sceneId, buildingId, feature, selectedOption } = req.body;

    if (!buildingId) {
      return res.status(400).json({
        success: false,
        error: 'buildingId is required'
      });
    }

    if (!feature) {
      return res.status(400).json({
        success: false,
        error: 'feature is required'
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: 'Processing building feature interaction...',
      buildingId,
      feature,
      selectedOption
    })}\n\n`);

    // Load player data before interaction for change detection
    const playerDataBefore = loadStatus(sessionId);
    if (!playerDataBefore) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Player data not found',
        message: 'No player data exists for this session. Please create a game session first.'
      })}\n\n`);
      res.end();
      return;
    }

    let fullResponse = '';

    // Process the building feature interaction with streaming
    const { processBuildingFeatureInteraction } = await import('../services/buildingInteractionService.js');

    const result = await processBuildingFeatureInteraction(
      sessionId,
      sceneId,
      buildingId,
      feature,
      selectedOption,
      // Stream callback
      (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({
          type: 'stream',
          content: chunk
        })}\n\n`);
      }
    );

    // Load updated player data to detect changes
    const updatedPlayerData = loadStatus(sessionId);

    // Detect state changes
    const stateChanges = detectStateChanges(
      playerDataBefore,
      updatedPlayerData
    );

    // Upload session data to MinIO (after building interaction)
    try {
      const session = getSession(sessionId);
      if (session) {
        const fileId = session.sourceFileId || session.fileId;
        await completeGameSessionByParams(sessionId, 'public/game_data', fileId);
        console.log(`✅ [Building Interaction] Session data uploaded to MinIO: ${sessionId}`);
      }
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload session data after building interaction:', uploadError.message);
    }

    // Send completion event
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      interactionType: result.type,
      buildingId: result.buildingId,
      feature: result.feature,
      selectedOption: result.selectedOption,
      response: result.response,
      options: result.options,
      canContinue: result.canContinue,
      stateChanges,
      characterStatus: updatedPlayerData,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Send final completion marker
    res.write(`event: complete\ndata: ${JSON.stringify({ success: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Building feature interaction stream error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to process building feature interaction',
      message: error.message
    })}\n\n`);
    res.end();
  }
};

/**
 * Get building features
 * GET /api/backend/game/session/:sessionId/scene/:sceneId/building/:buildingId/features
 */
export const getBuildingFeatures = async (req, res) => {
  try {
    const { sessionId, sceneId, buildingId } = req.params;

    const { getBuildingFeatures } = await import('../services/buildingInteractionService.js');
    const features = await getBuildingFeatures(sessionId, sceneId, buildingId);

    res.json({
      success: true,
      buildingId,
      features
    });
  } catch (error) {
    console.error('Error getting building features:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get building features',
      message: error.message
    });
  }
};

/**
 * Get scene buildings
 * GET /api/backend/game/session/:sessionId/scene/:sceneId/buildings
 */
export const getSceneBuildings = async (req, res) => {
  try {
    const { sessionId, sceneId } = req.params;

    const { getSceneBuildings } = await import('../services/buildingInteractionService.js');
    const buildings = await getSceneBuildings(sessionId, sceneId);

    res.json({
      success: true,
      sceneId,
      buildings
    });
  } catch (error) {
    console.error('Error getting scene buildings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scene buildings',
      message: error.message
    });
  }
};

/**
 * Helper function to detect state changes between before and after player data
 */
function detectStateChanges(before, after) {
  const changes = {
    inventory: [],
    attributes: {},
    relationships: {}
  };

  // Safety check: return empty changes if data is invalid
  if (!before || !after) {
    console.warn('detectStateChanges: before or after data is null/undefined');
    return changes;
  }

  // Detect inventory changes
  const beforeInv = before.inventory?.items || [];
  const afterInv = after.inventory?.items || [];

  // Find added items
  afterInv.forEach(item => {
    const existedBefore = beforeInv.find(i => i.id === item.id);
    if (!existedBefore) {
      changes.inventory.push({ ...item, added: true });
    }
  });

  // Find removed items
  beforeInv.forEach(item => {
    const existsAfter = afterInv.find(i => i.id === item.id);
    if (!existsAfter) {
      changes.inventory.push({ ...item, removed: true });
    }
  });

  // Detect attribute changes (handle both 'attributes' and 'characterAttributes' fields)
  const beforeAttr = before.attributes || before.characterAttributes || {};
  const afterAttr = after.attributes || after.characterAttributes || {};

  for (const key in afterAttr) {
    const beforeVal = beforeAttr[key] || 0;
    const afterVal = afterAttr[key] || 0;
    if (beforeVal !== afterVal) {
      changes.attributes[key] = afterVal - beforeVal;
    }
  }

  // Detect relationship changes
  const beforeRel = before.relationships || {};
  const afterRel = after.relationships || {};

  for (const key in afterRel) {
    const beforeVal = beforeRel[key] || 0;
    const afterVal = afterRel[key] || 0;
    if (beforeVal !== afterVal) {
      changes.relationships[key] = afterVal - beforeVal;
    }
  }

  return changes;
}
