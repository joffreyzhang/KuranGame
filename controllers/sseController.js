import { processPlayerAction, getSession } from '../services/gameService.js';
import {
  exportAllGameData,
  exportLatestAction
} from '../services/exportService.js';

// Store active SSE connections
const activeConnections = new Map();

/**
 * SSE connection for real-time game updates
 */
export const streamGameEvents = (req, res) => {
  const { sessionId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, timestamp: new Date().toISOString() })}\n\n`);

  // Store connection
  activeConnections.set(sessionId, res);

  // Handle client disconnect
  req.on('close', () => {
    activeConnections.delete(sessionId);
    console.log(`SSE connection closed for session: ${sessionId}`);
  });

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    if (activeConnections.has(sessionId)) {
      res.write(`:heartbeat\n\n`);
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);
};

/**
 * Send action with SSE streaming response
 */
export const sendActionWithStream = async (req, res) => {
  const { sessionId } = req.params;
  const { action } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  const connection = activeConnections.get(sessionId);

  if (!connection) {
    return res.status(400).json({
      error: 'No active SSE connection for this session. Please connect to /api/game/stream/:sessionId first.'
    });
  }

  try {
    // Send action received event
    connection.write(`data: ${JSON.stringify({
      type: 'action_received',
      action,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Send processing event
    connection.write(`data: ${JSON.stringify({
      type: 'processing',
      message: 'Processing your action...',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Process the action
    const result = await processPlayerAction(sessionId, action);

    // Send response chunks (simulate streaming for now, can be enhanced with actual streaming from Claude)
    const responseChunks = chunkText(result.response, 100);
    for (let i = 0; i < responseChunks.length; i++) {
      connection.write(`data: ${JSON.stringify({
        type: 'response_chunk',
        chunk: responseChunks[i],
        index: i,
        total: responseChunks.length,
        timestamp: new Date().toISOString()
      })}\n\n`);
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Send game state update
    connection.write(`data: ${JSON.stringify({
      type: 'state_update',
      gameState: result.gameState,
      characterStatus: result.characterStatus,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Send action options
    if (result.actionOptions && result.actionOptions.length > 0) {
      connection.write(`data: ${JSON.stringify({
        type: 'action_options',
        options: result.actionOptions,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }

    // Send complete event
    connection.write(`data: ${JSON.stringify({
      type: 'complete',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Export data for colleague's frontend
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

    // Send acknowledgment to the action sender
    res.json({
      success: true,
      message: 'Action processed and streamed to SSE connection'
    });

  } catch (error) {
    console.error('SSE action error:', error);

    // Send error event to SSE connection
    if (connection) {
      connection.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }

    res.status(500).json({
      error: 'Failed to process action',
      message: error.message
    });
  }
};

/**
 * Broadcast event to specific session
 */
export const broadcastToSession = (sessionId, event) => {
  const connection = activeConnections.get(sessionId);
  if (connection) {
    connection.write(`data: ${JSON.stringify(event)}\n\n`);
  }
};

/**
 * Get active SSE connections count
 */
export const getActiveConnections = (req, res) => {
  res.json({
    success: true,
    activeConnections: activeConnections.size,
    sessions: Array.from(activeConnections.keys())
  });
};

/**
 * Helper function to chunk text for streaming
 */
function chunkText(text, chunkSize) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}
