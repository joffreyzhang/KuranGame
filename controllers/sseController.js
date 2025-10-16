import { processPlayerAction, processPlayerActionStreaming, getSession } from '../services/gameService.js';
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
    const responseChunks = chunkText(result.response, 50); // Increased chunk size for sentence-based splitting
    for (let i = 0; i < responseChunks.length; i++) {
      connection.write(`data: ${JSON.stringify({
        type: 'response_chunk',
        chunk: responseChunks[i],
        index: i,
        total: responseChunks.length,
        timestamp: new Date().toISOString()
      })}\n\n`);
      // Delay between chunks for better streaming effect
      await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay to 200ms
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
 * Improved to split by sentences and words for better streaming effect
 */
function chunkText(text, chunkSize) {
  const chunks = [];
  
  // First split by sentences (Chinese periods, English periods, exclamation marks, question marks)
  const sentences = text.split(/([。！？.!?])/);
  
  let currentChunk = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    // If adding this sentence would exceed chunk size, push current chunk and start new one
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // If no chunks were created (text is very short), create one chunk
  if (chunks.length === 0) {
    chunks.push(text);
  }
  
  return chunks;
}

/**
 * Send action with true streaming from Claude API
 */
export const sendActionWithTrueStreaming = async (req, res) => {
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

    // Process the action with true real-time streaming
    const result = await processActionWithRealTimeStreaming(sessionId, action, connection);

    // Export game data
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
      success: false,
      error: error.message
    });
  }
};

/**
 * Process action with real-time streaming from Claude API
 */
async function processActionWithRealTimeStreaming(sessionId, action, connection) {
  try {
    const { getSession, updateGameState } = await import('../services/gameService.js');
    const { loadStatus, getStatusUpdatePrompt, applyClaudeUpdates, extractActionOptions } = await import('../services/statusService.js');
    const { prepareGameSettingsForLLM } = await import('../services/gameSettingsService.js');
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const dotenv = await import('dotenv');
    
    // Load environment variables
    dotenv.config();
    
    // Initialize Claude client
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
      baseURL: process.env.CLAUDE_BASE_URL,
    });

    const session = getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const status = loadStatus(sessionId);
    const statusPrompt = getStatusUpdatePrompt(status);
    
    const systemPrompt = `你是一个专业的互动小说游戏主持人（Game Master）。你将基于以下PDF文档中的设定来主持一个互动小说游戏。

游戏设定内容：
${prepareGameSettingsForLLM(session.gameSettings)}

${statusPrompt}

你的职责：
1. 严格遵循PDF中提供的所有设定、规则和框架
2. 根据PDF要求生成相应的可视化板块和模块（如人物面板、时间、地点、热搜等）
3. 用生动、细腻的文笔描述剧情，营造沉浸式体验
4. 根据玩家的选择和行动推进剧情发展
5. 支持中英文双语交互
6. 保持剧情连贯性和逻辑性
7. 当游戏事件影响角色状态时，在回复中包含状态更新标记

**重要：行动选项格式规范**
在每次回复的结尾，你必须提供玩家可以选择的行动选项。
使用以下特殊格式来标记行动选项（每个选项独占一行）：

[ACTION: 选项描述文本]

示例：
[ACTION: 探索神秘的森林深处]
[ACTION: 与NPC对话获取信息]
[ACTION: 在旅馆休息恢复体力]

注意：
- 每个行动选项必须使用 [ACTION: ...] 格式
- 每个选项独占一行
- 通常提供3-5个选项
- 选项要具体、可操作
- 不要在其他地方使用这个格式

请用中文回复，语言要生动有趣。`;

    // Build conversation history for Claude (same as original implementation)
    const messages = [...session.conversationHistory];
    
    // Add current action
    messages.push({
      role: 'user',
      content: action
    });

    // 使用流式模式
    const stream = await anthropic.messages.create({
      model: 'deepseek-chat',
      max_tokens: 10000,
      system: systemPrompt,
      messages: messages,
      stream: true  // 启用流式模式
    });

    let fullResponse = '';
    let chunkIndex = 0;
    
    // 实时处理流式响应
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        const token = chunk.delta.text;
        fullResponse += token;
        
        // 立即发送每个token到前端
        connection.write(`data: ${JSON.stringify({
          type: 'response_chunk',
          chunk: token,
          index: chunkIndex,
          total: -1, // -1 表示未知总数，正在流式生成
          timestamp: new Date().toISOString()
        })}\n\n`);
        
        chunkIndex++;
        
        // 添加小延迟以控制流式速度
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // 发送流式结束标记
    connection.write(`data: ${JSON.stringify({
      type: 'response_chunk',
      chunk: '',
      index: chunkIndex,
      total: chunkIndex,
      timestamp: new Date().toISOString(),
      isComplete: true
    })}\n\n`);

    // 解析完整响应
    const response = {
      message: fullResponse
    };
    
    // Update game state based on action
    updateGameState(session, action, response);
    
    // Parse and apply status updates from Claude's response
    const updatedStatus = await applyClaudeUpdates(sessionId, response.message);
    session.characterStatus = updatedStatus;

    // Extract action options for the frontend to render as buttons
    const actionOptions = extractActionOptions(response.message);

    // Update conversation history (same as original implementation)
    session.conversationHistory.push({
      role: 'user',
      content: action
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: response.message
    });

    // Send game state update
    connection.write(`data: ${JSON.stringify({
      type: 'state_update',
      gameState: session.gameState,
      characterStatus: updatedStatus,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Send action options
    if (actionOptions && actionOptions.length > 0) {
      connection.write(`data: ${JSON.stringify({
        type: 'action_options',
        options: actionOptions,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }

    // Send completion event
    connection.write(`data: ${JSON.stringify({
      type: 'complete',
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    return {
      response: response.message,
      gameState: session.gameState,
      characterStatus: updatedStatus,
      actionOptions
    };
    
  } catch (error) {
    console.error('Real-time streaming error:', error);
    
    // Send error event to SSE connection
    connection.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    throw error;
  }
}

