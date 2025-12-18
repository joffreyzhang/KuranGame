import * as npcChatService from '../services/npcChatService.js';
import { getSession } from '../services/gameService.js';
import { completeGameSessionByParams } from '../login/controller/gamesController.js';
import { getPlayerNetwork as getNetworkData, getNetworkByLevel } from '../services/networkService.js';

// Store active SSE connections
const activeConnections = new Map();

/**
 * Send a message to an NPC with SSE streaming
 * POST /api/backend/npc-chat/:sessionId/:npcId/send
 */
async function sendMessageToNPC(req, res) {
  const { sessionId, npcId } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Message is required and must be a string',
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  // Store connection
  const connectionKey = `${sessionId}_${npcId}_${Date.now()}`;
  activeConnections.set(connectionKey, res);

  // Handle client disconnect
  req.on('close', () => {
    activeConnections.delete(connectionKey);
    console.log(`SSE connection closed for ${sessionId}/${npcId}`);
  });

  try {
    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, npcId })}\n\n`);

    let fullResponse = '';

    // Stream chunks to client
    const onChunk = (chunk) => {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    };

    // Process the message
    const result = await npcChatService.sendNPCChatMessage(sessionId, npcId, message, onChunk);

    // Upload session data to MinIO (after NPC chat)
    try {
      const session = getSession(sessionId);
      if (session) {
        const fileId = session.sourceFileId || session.fileId;
        await completeGameSessionByParams(sessionId, 'public/game_data', fileId);
        console.log(`✅ [NPC Chat] Session data uploaded to MinIO: ${sessionId}`);
      }
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload session data after NPC chat:', uploadError.message);
    }

    // Send final result
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      npcName: result.npcName,
      fullResponse: result.response,
      relationshipChange: result.relationshipChange,
      newRelationship: result.newRelationship,
    })}\n\n`);

    // End the stream
    res.write('data: {"type":"done"}\n\n');
    res.end();

    activeConnections.delete(connectionKey);

  } catch (error) {
    console.error('Error in sendMessageToNPC:', error);

    // Send error event
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message,
    })}\n\n`);

    res.end();
    activeConnections.delete(connectionKey);
  }
}

/**
 * Get chat history with an NPC
 * GET /api/backend/npc-chat/:sessionId/:npcId/history
 */
async function getChatHistory(req, res) {
  const { sessionId, npcId } = req.params;

  try {
    const history = await npcChatService.getChatHistory(sessionId, npcId);

    res.json({
      success: true,
      sessionId,
      npcId,
      history,
      messageCount: history.length,
    });

  } catch (error) {
    console.error('Error in getChatHistory:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Clear chat history with an NPC
 * DELETE /api/backend/npc-chat/:sessionId/:npcId/history
 */
async function clearChatHistory(req, res) {
  const { sessionId, npcId } = req.params;

  try {
    await npcChatService.clearChatHistory(sessionId, npcId);

    res.json({
      success: true,
      message: `Chat history cleared for ${sessionId}/${npcId}`,
    });

  } catch (error) {
    console.error('Error in clearChatHistory:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get list of active NPC chat connections
 * GET /api/backend/npc-chat/connections
 */
function getActiveConnections(_req, res) {
  const connections = Array.from(activeConnections.keys());

  res.json({
    success: true,
    activeConnections: connections,
    count: connections.length,
  });
}

/**
 * Get player's relationship network
 * Returns all NPCs with their relationship values and details
 */
export const getPlayerNetwork = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { grouped } = req.query; // Optional: ?grouped=true for level grouping

    // Load player data
    const playerData = loadStatus(sessionId);
    if (!playerData) {
      return res.status(404).json({
        success: false,
        error: 'Player data not found'
      });
    }

    let networkData;
    if (grouped === 'true') {
      // Return network grouped by relationship levels
      networkData = getNetworkByLevel(sessionId, playerData);
    } else {
      // Return full network list
      networkData = getNetworkData(sessionId, playerData);
    }

    res.json({
      success: true,
      data: networkData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get player network error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get player network',
      message: error.message
    });
  }
};


export {
  sendMessageToNPC,
  getChatHistory,
  clearChatHistory,
  getActiveConnections,
};
