import {
  getMissionSummary,
  loadMissions,
  submitMissionForValidation,
  checkStorylineBlocked,
  abandonMission
} from '../services/missionService.js';

import { processPlayerAction } from '../services/gameService.js';

/**
 * GET /api/backend/game/session/:sessionId/missions
 */
export const getMissions = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const missionSummary = getMissionSummary(sessionId);

    res.json({
      success: true,
      data: missionSummary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get missions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get missions',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/game/session/:sessionId/missions/all
 */
export const getAllMissions = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Load full mission data
    const missionData = loadMissions(sessionId);

    res.json({
      success: true,
      data: missionData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get all missions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get mission data',
      message: error.message
    });
  }
};

/**
 * POST /api/backend/game/session/:sessionId/missions/:missionId/submit
 * Submit a mission for validation and check if requirements are met
 * If completed, automatically generate story continuation with streaming
 */
export const submitMission = async (req, res) => {
  try {
    const { sessionId, missionId } = req.params;

    console.log(`[Mission Controller] Submitting mission: ${missionId} for session: ${sessionId}`);

    // Validate mission submission
    const result = submitMissionForValidation(sessionId, missionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.error,
        timestamp: new Date().toISOString()
      });
    }

    // If mission is completed, automatically generate story continuation with streaming
    if (result.completed) {
      console.log(`[Mission Controller] Mission completed! Generating story continuation with streaming...`);

      try {
        // Set up Server-Sent Events (SSE) for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send mission completion data first
        res.write(`data: ${JSON.stringify({
          type: 'mission_completed',
          success: true,
          completed: true,
          mission: result.mission,
          completedPath: result.completedPath || null,
          completedPathName: result.completedPathName || null,
          pathResults: result.pathResults || null,
          message: result.message,
          attempts: result.attempts || 0,
          timestamp: new Date().toISOString()
        })}\n\n`);

        // Define streaming callback for story continuation
        const onChunk = async (chunk) => {
          res.write(`data: ${chunk}\n`);
        };

        // Generate story continuation with streaming
        const storyContinuation = await processPlayerAction(
          sessionId,
          '继续剧情', // Internal action to continue story
          onChunk // Pass streaming callback
        );

        // Send final completion event
        res.write(`data: ${JSON.stringify({
          type: 'story_complete',
          characterStatus: storyContinuation.characterStatus,
          newMission: storyContinuation.newMission || null
        })}\n\n`);

        res.end();

      } catch (storyError) {
        console.error('[Mission Controller] Error generating story continuation:', storyError);

        // If streaming already started, send error event
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: '故事续写失败，请手动发送消息继续游戏'
          })}\n\n`);
          res.end();
        } else {
          // If story generation fails before streaming starts, return JSON
          return res.json({
            success: true,
            completed: true,
            mission: result.mission,
            completedPath: result.completedPath || null,
            completedPathName: result.completedPathName || null,
            message: result.message + '\n\n（故事续写失败，请手动发送消息继续游戏）',
            timestamp: new Date().toISOString()
          });
        }
      }
    } else {
      // Mission not completed yet - return validation result
      res.json({
        success: true,
        completed: false,
        mission: result.mission,
        pathResults: result.pathResults || null,
        message: result.message,
        attempts: result.attempts || 0,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Submit mission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit mission',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * GET /api/backend/game/session/:sessionId/storyline/status
 * Check if the main storyline is currently blocked by an active story mission
 */
export const getStorylineStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log(`[Mission Controller] Checking storyline status for session: ${sessionId}`);

    // Check storyline status
    const status = checkStorylineBlocked(sessionId);

    res.json({
      success: true,
      blocked: status.blocked,
      mission: status.mission,
      hasActiveStoryMission: status.hasActiveStoryMission,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get storyline status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get storyline status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * POST /api/backend/game/session/:sessionId/missions/:missionId/abandon
 * Abandon/give up an active mission
 * The mission is marked as abandoned, storyline is unblocked if it was a story mission,
 * and the player does NOT receive any rewards
 */
export const abandonMissionController = async (req, res) => {
  try {
    const { sessionId, missionId } = req.params;

    console.log(`[Mission Controller] Abandoning mission: ${missionId} for session: ${sessionId}`);

    // Abandon the mission
    const result = abandonMission(sessionId, missionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.error,
        status: result.status,
        timestamp: new Date().toISOString()
      });
    }

    // If mission was successfully abandoned and it was blocking the storyline,
    // automatically generate story continuation with streaming
    if (result.abandoned && result.storylineUnblocked) {
      console.log(`[Mission Controller] Mission abandoned and storyline unblocked! Generating story continuation...`);

      try {
        // Set up Server-Sent Events (SSE) for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send mission abandonment data first
        res.write(`data: ${JSON.stringify({
          type: 'mission_abandoned',
          success: true,
          abandoned: true,
          mission: result.mission,
          message: result.message,
          storylineUnblocked: result.storylineUnblocked,
          timestamp: new Date().toISOString()
        })}\n\n`);

        // Define streaming callback for story continuation
        const onChunk = async (chunk) => {
          res.write(`data: ${chunk}\n`);
        };

        // Generate story continuation with streaming
        const storyContinuation = await processPlayerAction(
          sessionId,
          '继续剧情', // Internal action to continue story after abandoning mission
          onChunk // Pass streaming callback
        );

        // Send final completion event
        res.write(`data: ${JSON.stringify({
          type: 'story_complete',
          characterStatus: storyContinuation.characterStatus,
          newMission: storyContinuation.newMission || null
        })}\n\n`);

        res.end();

      } catch (storyError) {
        console.error('[Mission Controller] Error generating story continuation:', storyError);

        // If streaming already started, send error event
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: '故事续写失败，请手动发送消息继续游戏'
          })}\n\n`);
          res.end();
        } else {
          // If story generation fails before streaming starts, return JSON
          return res.json({
            success: true,
            abandoned: true,
            mission: result.mission,
            message: result.message + '\n\n（故事续写失败，请手动发送消息继续游戏）',
            storylineUnblocked: result.storylineUnblocked,
            timestamp: new Date().toISOString()
          });
        }
      }
    } else {
      // Mission abandoned but didn't block storyline - return simple JSON response
      res.json({
        success: true,
        abandoned: true,
        mission: result.mission,
        message: result.message,
        storylineUnblocked: result.storylineUnblocked || false,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Abandon mission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to abandon mission',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
