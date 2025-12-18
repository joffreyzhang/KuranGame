import { getCurrentEraInfo, skipToNextEra as skipEra } from '../services/timeManagementService.js';

/**
 * POST /api/backend/game/session/:sessionId/skip-to-era
 * Skip to the next historical era in the game timeline
 */
export const skipToNextEra = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await skipEra(sessionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        currentEra: result.currentEra,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: result.message,
      previousEra: result.previousEra,
      currentEra: result.currentEra,
      timeChange: result.timeChange,
      playerChanges: result.playerChanges,
      narrative: result.narrative,
      updatedFiles: result.updatedFiles,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Skip to next era error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to skip to next era',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * GET /api/backend/game/session/:sessionId/current-era
 * Get information about the current era and next available era
 */
export const getCurrentEra = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = getCurrentEraInfo(sessionId);

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get current era error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get current era information',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

