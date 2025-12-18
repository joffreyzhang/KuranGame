import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { processPDFFile } from '../services/pdfService.js';
import { processDocxFile } from '../services/docxService.js';
import { extractGameInitializationData, loadGameData } from '../services/gameInitializationService.js';
import { createGameSession, processPlayerAction, getSession, recoverSession} from '../services/gameService.js';
import { loadStatus, saveStatus } from '../services/statusService.js';
import { generateAllGameImages} from '../services/imageGenerationService.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');
const GAME_SAVES_DIR = path.join(__dirname, '..', 'game_saves');

export const uploadAndProcessPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const fileType = getFileType(req.file.originalname);
    if (!fileType) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Only PDF and DOCX files are supported.'
      });
    }

    const fileId = path.parse(req.file.filename).name;

    // Process the document
    const documentData = await processDocument(req.file.path, fileType);

    // Extract game initialization data (4 JSON files)
    await extractGameInitializationData(documentData.text, fileId);

    // Optional image generation
    // Parse boolean values from form-data (all values are strings in form-data)
    const generateImages = req.body.generateImages === 'true' || req.body.generateImages === true;
    let imageResults = null;
    if (generateImages) {
      console.log(`Generating images for fileId: ${fileId}`);
      try {
        imageResults = await generateAllGameImages(fileId, {
          generateNPCs: true,
          generateScenes: true,
          generateBuildings: true,
          generateWorld: true,
          generateUser: true,
          updateJSON: true
        });
      } catch (imageError) {
        console.error('Image generation error:', imageError);
        
        // Don't fail the entire request if image generation fails
        imageResults = { error: imageError.message };
      }
    }

    res.json({
      success: true,
      fileId,
      message: generateImages
        ? 'PDF processed and game data generated successfully (with images)'
        : 'PDF processed and game data generated successfully (without images)',
      data: {
        filename: req.file.originalname,
        fileType,
        size: req.file.size,
        textLength: documentData.text.length,
        numPages: documentData.numpages
      },
      imagesGenerated: generateImages,
      imageResults: imageResults ? {
        npcsGenerated: imageResults.npcs?.length || 0,
        scenesGenerated: imageResults.scenes?.length || 0,
        buildingsGenerated: imageResults.buildings?.length || 0,
        worldGenerated: imageResults.world?.success || false,
        userGenerated: imageResults.user?.success || false,
        errorsCount: imageResults.errors?.length || 0,
        error: imageResults.error || null
      } : null
    });
  } catch (error) {
    console.error('Upload and process error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process PDF',
      message: error.message
    });
  }
};
/**
 * GET /api/backend/files/:identifier
 */
export const getGameFiles = async (req, res) => {
  try {
    const { identifier } = req.params;

    // Try to load as fileId first
    let isSession = true;
    let gameData = loadGameData(identifier, isSession);
    

    // If not found, try to load session and get fileId
    if (!gameData) {
      let session = getSession(identifier);

      // Try to recover session if not found in memory
      if (!session) {
        session = recoverSession(identifier);
      }

      if (session && session.fileId) {
        gameData = loadGameData(session.fileId);
        isSession = true;
      }
    }

    if (!gameData) {
      return res.status(404).json({
        success: false,
        error: 'Game data not found',
        message: 'Please upload and process a PDF file first'
      });
    }

    // For session, also include session-specific player data
    let playerData = gameData.playerData;
    if (isSession) {
      const sessionPlayerData = loadStatus(identifier);
      if (sessionPlayerData) {
        playerData = sessionPlayerData;
      }
    }

    res.json({
      success: true,
      identifier,
      type: isSession ? 'session' : 'file',
      files: {
        lore: gameData.backgroundData,
        player: playerData,
        items: gameData.itemData,
        scenes: gameData.worldData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get game files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game files',
      message: error.message
    });
  }
};
/**
 * GET /api/backend/files/:identifier/:fileType
 */
export const getSpecificFile = async (req, res) => {
  try {
    const {identifier, fileType } = req.params;

    // Map fileType to data property
    const fileTypeMap = {
      'lore': 'backgroundData',
      'player': 'playerData',
      'items': 'itemData',
      'scenes': 'worldData'
    };

    const dataProperty = fileTypeMap[fileType];
    if (!dataProperty) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: `Supported types: ${Object.keys(fileTypeMap).join(', ')}`
      });
    }
    let isSession = true;
    let gameData = loadGameData(identifier, isSession);
    // If not found, try to load session and get fileId

    if (!gameData) {
      return res.status(404).json({
        success: false,
        error: 'Game data not found'
      });
    }

    // For player data in sessions, load session-specific data
    let fileData = gameData[dataProperty];
    if (isSession && fileType === 'player') {
      const sessionPlayerData = loadStatus(identifier);
      if (sessionPlayerData) {
        fileData = sessionPlayerData;
      }
    }

    res.json({
      success: true,
      identifier,
      fileType,
      data: fileData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get specific file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/history/:sessionId
 */
export const getGameHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // History file is stored in public/game_data/{sessionId}/history_{sessionId}.json
    const historyFilePath = path.join(GAME_DATA_DIR, sessionId, `history_${sessionId}.json`);

    // Check if history file exists
    if (!fs.existsSync(historyFilePath)) {
      return res.status(404).json({
        success: false,
        error: 'History file not found',
        message: `No history file found for session ID: ${sessionId}`
      });
    }

    // Read and parse the history file
    const historyData = fs.readFileSync(historyFilePath, 'utf-8');
    const history = JSON.parse(historyData);

    res.json({
      success: true,
      sessionId,
      history: history.history || [],
      totalMessages: history.totalMessages || 0,
      lastUpdated: history.lastUpdated || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get game history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game history',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/saves/:saveId/files
 */
export const getSavedGameFiles = async (req, res) => {
  try {
    const { saveId } = req.params;

    const saveDir = path.join(GAME_SAVES_DIR, saveId);

    // Check if save directory exists
    if (!fs.existsSync(saveDir)) {
      return res.status(404).json({
        success: false,
        error: 'Saved game not found',
        message: `No saved game found with ID: ${saveId}`
      });
    }

    // Load all JSON files
    const files = {};
    const fileTypes = ['lore', 'player', 'items', 'scenes'];

    for (const fileType of fileTypes) {
      const filename = `${fileType}_${saveId}.json`;
      const filePath = path.join(saveDir, filename);

      if (fs.existsSync(filePath)) {
        try {
          const fileData = fs.readFileSync(filePath, 'utf-8');
          files[fileType] = JSON.parse(fileData);
        } catch (error) {
          console.error(`Error reading ${fileType} file:`, error);
          files[fileType] = null;
        }
      }
    }

    res.json({
      success: true,
      saveId,
      files,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get saved game files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get saved game files',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/saves/:saveId/files/:fileType
 */
export const getSavedGameSpecificFile = async (req, res) => {
  try {
    const { saveId, fileType } = req.params;

    // Validate file type
    const validTypes = ['lore', 'player', 'items', 'scenes'];
    if (!validTypes.includes(fileType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: `Supported types: ${validTypes.join(', ')}`
      });
    }

    const saveDir = path.join(GAME_SAVES_DIR, saveId);

    // Check if save directory exists
    if (!fs.existsSync(saveDir)) {
      return res.status(404).json({
        success: false,
        error: 'Saved game not found',
        message: `No saved game found with ID: ${saveId}`
      });
    }

    const filename = `${fileType}_${saveId}.json`;
    const filePath = path.join(saveDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: `${fileType} file not found in saved game`
      });
    }

    // Read and parse the file
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileData);

    res.json({
      success: true,
      saveId,
      fileType,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get saved game specific file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get saved game file',
      message: error.message
    });
  }
};

/**
 * POST /api/backend/game/session/create
 */
export const createSession = async (req, res) => {
  try {
    const { fileId, playerName = 'Player', literaryStyle } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    // Verify game data exists
    const gameData = loadGameData(fileId);
    if (!gameData) {
      return res.status(404).json({
        success: false,
        error: 'Game data not found',
        message: 'Please upload and process a PDF file first'
      });
    }

    // Create session with literary style
    const sessionId = crypto.randomBytes(16).toString('hex');
    const session = await createGameSession(sessionId, fileId, playerName, literaryStyle);

    // Get game data from session (already loaded during creation)
    const identifier = session.isPreProcessed ? sessionId : fileId;
    const isSessionId = session.isPreProcessed || false;
    const gameDataAfterSession = loadGameData(identifier, isSessionId);

    // Get player data
    const playerData = loadStatus(sessionId);

    res.json({
      success: true,
      message: 'Game session created successfully',
      sessionId,
      fileId,
      playerName,
      literaryStyle: session.literaryStyle,  // Include literary style in response
      gameState: session.gameState,
      characterStatus: session.characterStatus,
      files: {
        lore: gameDataAfterSession.backgroundData,
        player: playerData,
        items: gameDataAfterSession.itemData,
        scenes: gameDataAfterSession.worldData
      },
      isInitialized: false
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session',
      message: error.message
    });
  }
};

/**
 * POST /api/backend/game/session/:sessionId/action
 */
export const sendGameAction = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required'
      });
    }

    // Process action
    const result = await processPlayerAction(sessionId, action);

    // Get session to load fileId
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Load all game data files (these might have been updated)
    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed || false;
    const gameData = loadGameData(identifier, isSessionId);
    res.json({
      success: true,
      response: result.response,
      actionOptions: result.actionOptions,
      gameState: result.gameState,
      characterStatus: result.characterStatus,
      isInitialized: result.isInitialized,
      updatedFiles: {
        lore: gameData.backgroundData,
        player: gameData.playerData,
        items: gameData.itemData,
        scenes: gameData.worldData
      },
      missions: result.missions || null,
      completedMissions: result.completedMissions || [],
      newMission: result.newMission || null,
      newAchievements: result.newAchievements || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Send action error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process action',
      message: error.message
    });
  }
};

/**
 *  * PUT /api/backend/game/session/:sessionId/player/name
 */
export const updatePlayerName = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid name is required'
      });
    }

    // Load current player data
    const playerData = loadStatus(sessionId);
    if (!playerData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or player data not available',
        message: 'Please create a session first'
      });
    }

    const previousName = playerData.data?.profile?.name || 'Unknown';

    // Update the name in the player data
    if (!playerData.data) playerData.data = {};
    if (!playerData.data.profile) playerData.data.profile = {};
    playerData.data.profile.name = name.trim();

    // Update lastUpdated timestamp
    playerData.lastUpdated = new Date().toISOString();

    // Save the updated player data
    saveStatus(sessionId, playerData);

    res.json({
      success: true,
      message: 'Player name updated successfully',
      previousName,
      newName: name.trim(),
      updatedFiles: {
        player: playerData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update player name error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update player name',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/game/session/:sessionId
 */
export const getSessionState = async (req, res) => {
  try {
    const { sessionId } = req.params;

    let session = getSession(sessionId);

    // Try to recover session if not found in memory
    if (!session) {
      session = recoverSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
    }

    // Load all game data files
    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed || false;
    const gameData = loadGameData(identifier, isSessionId);
    const playerData = loadStatus(sessionId);

    res.json({
      success: true,
      sessionId: session.sessionId,
      fileId: session.fileId,
      playerName: session.playerName,
      gameState: session.gameState,
      characterStatus: session.characterStatus,
      history: session.history,
      conversationHistory: session.conversationHistory,
      isInitialized: session.gameState?.isInitialized || false,
      files: {
        lore: gameData.backgroundData,
        player: playerData,
        items: gameData.itemData,
        scenes: gameData.worldData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get session state error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session state',
      message: error.message
    });
  }
};

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  return null;
}

async function processDocument(filePath, fileType) {
  if (fileType === 'pdf') {
    return await processPDFFile(filePath, () => {});
  } else if (fileType === 'docx') {
    const docxData = await processDocxFile(filePath, () => {});
    return {
      text: docxData.text,
      numpages: null,
      info: docxData.metadata,
      metadata: docxData.metadata
    };
  }
  throw new Error('Unsupported file type');
}

/**
 * POST /api/backend/game/session/:sessionId/use-item
 */
export const useItem = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'itemId is required'
      });
    }

    // Get session to load fileId
    let session = getSession(sessionId);

    // Try to recover session if not found in memory
    if (!session) {
      session = recoverSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
    }

    // Load player data to get inventory
    const playerData = loadStatus(sessionId);
    if (!playerData || !playerData.data || !playerData.data.inventory) {
      return res.status(404).json({
        success: false,
        error: 'Player data not found or no inventory'
      });
    }

    // Find the item in player's inventory
    const item = playerData.data.inventory.find(
      invItem => invItem.id === itemId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in inventory',
        message: `Item with id "${itemId}" does not exist in player inventory`
      });
    }

    // Build the action message with item usage
    const action = `我使用了${item.name}`;

    // Process action through the normal game action flow
    const result = await processPlayerAction(sessionId, action);

    // Load updated game data files
    const gameData = loadGameData(session.fileId);
    const updatedPlayerData = loadStatus(sessionId);

    res.json({
      success: true,
      itemUsed: {
        id: item.id,
        name: item.name
      },
      response: result.response,
      actionOptions: result.actionOptions,
      gameState: result.gameState,
      characterStatus: result.characterStatus,
      isInitialized: result.isInitialized,
      updatedFiles: {
        lore: gameData.backgroundData,
        player: updatedPlayerData,
        items: gameData.itemData,
        scenes: gameData.worldData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Use item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to use item',
      message: error.message
    });
  }
};

/**
 * POST /api/backend/game/session/:sessionId/change-scene
 */
export const changeScene = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sceneId } = req.body;

    if (!sceneId) {
      return res.status(400).json({
        success: false,
        error: 'sceneId is required',
        message: 'Please provide a valid scene ID'
      });
    }

    // Load game data to verify scene exists
    let session = getSession(sessionId);

    // Try to recover session if not found in memory
    if (!session) {
      session = recoverSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          message: 'Game session not found'
        });
      }
    }

    const identifier = session.isPreProcessed ? sessionId : session.fileId;
    const isSessionId = session.isPreProcessed;
    const gameData = loadGameData(identifier, isSessionId);

    if (!gameData || !gameData.worldData) {
      return res.status(404).json({
        success: false,
        error: 'Game data not found',
        message: 'Could not load scene data'
      });
    }

    // Verify scene exists
    const targetScene = gameData.worldData[sceneId];
    if (!targetScene) {
      return res.status(404).json({
        success: false,
        error: 'Scene not found',
        message: `Scene with ID "${sceneId}" does not exist`
      });
    }

    // Check if scene is unlocked
    const currentStatus = loadStatus(sessionId);
    if (currentStatus && currentStatus.unlockedScenes) {
      const unlockedScenes = currentStatus.unlockedScenes;
      if (!unlockedScenes.includes(sceneId)) {
        return res.status(403).json({
          success: false,
          error: 'Scene locked',
          message: `场景 "${targetScene.name}" 尚未解锁。你需要先在游戏中解锁这个地点才能前往。`,
          sceneId: sceneId,
          sceneName: targetScene.name,
          locked: true
        });
      }
    }

    // Get current location before change
    const previousScene = session.gameState.currentLocation;

    // Update session location
    session.gameState.currentLocation = sceneId;
    session.gameState.lastAction = new Date().toISOString();

    // Update player status location
    if (currentStatus) {
      currentStatus.location = sceneId;
      saveStatus(sessionId, currentStatus);
    }

    // Add to history if description provided
    console.log(`🏠 Scene changed: ${previousScene} → ${sceneId} (${targetScene.name})`);

    res.json({
      success: true,
      message: 'Scene changed successfully',
      previousScene,
      currentScene: sceneId,
      sceneData: targetScene,
      updatedFiles: {
        lore: gameData.backgroundData,
        player: loadStatus(sessionId),
        items: gameData.itemData,
        scenes: gameData.worldData
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Change scene error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change scene',
      message: error.message
    });
  }
};

/**
 * GET /api/backend/music/:identifier
 */
export const getMusicFiles = async (req, res) => {
  try {
    const { identifier } = req.params;

    // Check both game_data and game_saves directories
    let musicDir = path.join(GAME_SAVES_DIR, identifier, 'music');
    if (!fs.existsSync(musicDir)) {
      return res.json({
        success: true,
        identifier,
        music: [],
        message: 'No music directory found for this game',
        timestamp: new Date().toISOString()
      });
    }

    // Read music files
    const files = fs.readdirSync(musicDir);
    const musicFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext);
      })
      .map(file => ({
        filename: file,
        url: `/api/backend/music/${identifier}/${file}`,
        title: path.parse(file).name
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename)); // Sort alphabetically

    res.json({
      success: true,
      identifier,
      music: musicFiles,
      count: musicFiles.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get music files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get music files',
      message: error.message
    });
  }
};

export const serveMusicFile = async (req, res) => {
  try {
    const { identifier, filename } = req.params;

    const musicPath = path.join(GAME_SAVES_DIR, identifier, 'music', filename);

    // Check if file exists
    if (!fs.existsSync(musicPath)) {
      return res.status(404).json({
        success: false,
        error: 'Music file not found',
        message: `Music file not found: ${filename}`
      });
    }

    // Determine content type based on extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac'
    };

    // Set appropriate headers
    res.setHeader('Content-Type', contentTypes[ext] || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');

    // Send the file
    res.sendFile(musicPath);
  } catch (error) {
    console.error('Serve music file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve music file',
      message: error.message
    });
  }
};

// ============================================
// LITERARY STYLES
// ============================================

/**
 * Get all available literary styles
 * GET /api/backend/literary-styles
 */
export const getLiteraryStyles = async (req, res) => {
  try {
    const { getAllStyles } = await import('../services/literaryStyleService.js');
    const styles = getAllStyles();

    res.json({
      success: true,
      styles,
      count: styles.length
    });
  } catch (error) {
    console.error('Get literary styles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve literary styles',
      message: error.message
    });
  }
};

