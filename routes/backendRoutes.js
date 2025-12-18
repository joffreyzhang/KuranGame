import express from 'express';
import { upload } from '../middleware/upload.js';
import {
  uploadAndProcessPDF,
  getGameFiles,
  getSpecificFile,
  getGameHistory,
  createSession,
  sendGameAction,
  getSessionState,
  useItem,
  changeScene,
  getSavedGameFiles,
  getSavedGameSpecificFile,
  updatePlayerName,
  getMusicFiles,
  serveMusicFile,
  getLiteraryStyles
} from '../controllers/backendController.js';
import {
  generateGameImages,
  serveWorldImage,
  servePlayerImage,
  serveSceneImage,
  serveIconImage,
  serveAvatarImage,
  serveSceneImageFromFileId,
  serveIconImageFromFileId,
  serveAvatarImageFromFileId
} from '../controllers/imageController.js';
import {
  getMissions,
  getAllMissions,
  submitMission,
  getStorylineStatus,
  abandonMissionController
} from '../controllers/missionController.js';
import {
  connectToSessionStream,
  sendActionWithStream,
  sendActionWithLiveStream,
  getActiveConnections,
  buildingFeatureInteractionWithStream,
  getBuildingFeatures,
  getSceneBuildings
} from '../controllers/sseController.js';
import {
  sendMessageToNPC,
  getChatHistory,
  clearChatHistory,
  getPlayerNetwork,
  getActiveConnections as getNPCActiveConnections
} from '../controllers/npcChatController.js';
import {
  generateNovelController,
  getNovelController,
  deleteNovelController
} from '../controllers/novelController.js';
import { skipToNextEra } from '../controllers/timeController.js';

const router = express.Router();

// ============================================
// INTERFACE 1: PDF UPLOAD & PROCESSING
// ============================================

/**
 * Upload and process PDF in one step
 * POST /api/backend/pdf/upload-and-process
 *
 * Request: multipart/form-data with 'pdf' field
 * Response: { success, fileId, message, data }
 */
router.post('/pdf/upload-and-process', upload.single('pdf'), uploadAndProcessPDF);
// ============================================
// INTERFACE 2: JSON FILE RETRIEVAL
// ============================================

/**
 * Get all game data files for a fileId or sessionId
 * GET /api/backend/files/:identifier
 *
 * Response: {
 *   success,
 *   identifier,
 *   type: "file" | "session",
 *   files: { lore, player, items, scenes },
 *   timestamp
 * }
 */
router.get('/files/:identifier', getGameFiles);
/**
 * Get specific file type (lore, player, items, scenes)
 * GET /api/backend/files/:identifier/:fileType
 *
 * Supported fileTypes: lore, player, items, scenes
 * Response: { success, identifier, fileType, data, timestamp }
 */
router.get('/files/:identifier/:fileType', getSpecificFile);

/**
 * Get game history for a specific session
 * GET /api/backend/history/:sessionId
 *
 * Response: {
 *   success,
 *   sessionId,
 *   history: [{ type, message, timestamp }, ...],
 *   totalMessages,
 *   lastUpdated,
 *   timestamp
 * }
 */
router.get('/history/:sessionId', getGameHistory);

/**
 * Get all game data files from saved game
 * GET /api/backend/saves/:saveId/files
 *
 * Response: {
 *   success,
 *   saveId,
 *   files: { lore, player, items, scenes },
 *   timestamp
 * }
 */
router.get('/saves/:saveId/files', getSavedGameFiles);

/**
 * Get specific file type from saved game
 * GET /api/backend/saves/:saveId/files/:fileType
 *
 * Supported fileTypes: lore, player, items, scenes
 * Response: { success, saveId, fileType, data, timestamp }
 */
router.get('/saves/:saveId/files/:fileType', getSavedGameSpecificFile);

/**
 * Update player character name in an existing session
 * PUT /api/backend/game/session/:sessionId/player/name
 *
 * Request body: { name: "new character name" }
 * Response: {
 *   success: true,
 *   message: "Player name updated successfully",
 *   previousName: "old name",
 *   newName: "new name",
 *   updatedFiles: { player: {...} },
 *   timestamp: "2025-11-06T..."
 * }
 */
router.put('/game/session/:sessionId/player/name', updatePlayerName);

// ============================================
// INTERFACE 3: GAME SESSION & LLM RESPONSE
// ============================================

/**
 * Create a new game session
 * POST /api/backend/game/session/create
 *
 * Request body: { fileId, playerName? }
 * Response: {
 *   success,
 *   sessionId,
 *   fileId,
 *   playerName,
 *   gameState,
 *   characterStatus,
 *   files: { lore, player, items, scenes },
 *   isInitialized
 * }
 */
router.post('/game/session/create', createSession);

/**
 * Send player action and get LLM response + updated JSON files
 * POST /api/backend/game/session/:sessionId/action
 *
 * Request body: { action }
 * Response: {
 *   success,
 *   response: "LLM text",
 *   actionOptions: [...],
 *   gameState,
 *   characterStatus,
 *   isInitialized,
 *   updatedFiles: { lore, player, items, scenes },
 *   timestamp
 * }
 */
router.post('/game/session/:sessionId/action', sendGameAction);

/**
 * Get current session state + all files
 * GET /api/backend/game/session/:sessionId
 *
 * Response: {
 *   success,
 *   sessionId,
 *   fileId,
 *   playerName,
 *   gameState,
 *   characterStatus,
 *   history,
 *   conversationHistory,
 *   isInitialized,
 *   files: { lore, player, items, scenes },
 *   timestamp
 * }
 */
router.get('/game/session/:sessionId', getSessionState);

/**
 * Use an item from inventory
 * POST /api/backend/game/session/:sessionId/use-item
 *
 * Request body: { itemId: "item_identifier" }
 * Response: {
 *   success,
 *   itemUsed: { id, name },
 *   response: "LLM text with '我使用了{itemName}' prepended",
 *   actionOptions: [...],
 *   gameState,
 *   characterStatus,
 *   isInitialized,
 *   updatedFiles: { lore, player, items, scenes },
 *   timestamp
 * }
 */
router.post('/game/session/:sessionId/use-item', useItem);



/**
 * Change Scene/Location - Direct scene navigation from frontend
 * POST /api/backend/game/session/:sessionId/change-scene
 *
 * Request body: {
 *   sceneId: "scene_identifier",    // Target scene ID from scenes JSON
 *   description?: "Optional description of how player arrived at scene"
 * }
 *
 * Response: {
 *   success: true,
 *   message: "Scene changed successfully",
 *   previousScene: "old_scene_id",
 *   currentScene: "new_scene_id",
 *   sceneData: { ...scene object... },
 *   updatedFiles: { player: {...}, items: {...}, scenes: {...} },
 *   timestamp: "2025-11-03T..."
 * }
 */
router.post('/game/session/:sessionId/change-scene', changeScene);

// ============================================
// INTERFACE 4: IMAGE GENERATION
// ============================================


/**
 * Generate all images for NPCs and scenes
 * POST /api/backend/images/generate/:fileId
 *
 * Request body: {
 *   generateNPCs?: boolean (default: true),
 *   generateScenes?: boolean (default: true),
 *   generateBuildings?: boolean (default: false),
 *   updateJSON?: boolean (default: true)
 * }
 *
 * Response: {
 *   success,
 *   message,
 *   fileId,
 *   results: {
 *     npcsGenerated: number,
 *     scenesGenerated: number,
 *     buildingsGenerated: number,
 *     errorsCount: number,
 *     details: { npcs: [...], scenes: [...], buildings: [...], errors: [...] }
 *   }
 * }
 */
router.post('/images/generate/:fileId', generateGameImages);



/**
 * Serve world image
 * GET /api/backend/images/:fileId/world
 *
 * Parameters:
 * - fileId: Game file ID
 *
 * Response: World image file (world_{fileId}.png) with proper headers
 */
router.get('/images/:fileId/world', serveWorldImage);

/**
 * Serve player image
 * GET /api/backend/images/:fileId/player
 *
 * Parameters:
 * - fileId: Game file ID
 *
 * Response: Player image file (player_{fileId}.png) with proper headers
 */
router.get('/images/:fileId/player', servePlayerImage);

/**
 * Serve images from fileId structure
 * GET /api/backend/images/:fileId/serve/scenes/:filename
 * GET /api/backend/images/:fileId/serve/icons/:filename
 * GET /api/backend/images/:fileId/serve/avatars/:filename
 *
 * These routes support the new fileId-based image organization structure
 */
router.get('/images/:fileId/serve/scenes/:filename', serveSceneImageFromFileId);
router.get('/images/:fileId/serve/icons/:filename', serveIconImageFromFileId);
router.get('/images/:fileId/serve/avatars/:filename', serveAvatarImageFromFileId);

// ============================================
// SSE STREAMING ENDPOINTS
// ============================================

/**
 * Connect to SSE stream for real-time updates
 * GET /api/backend/game/session/:sessionId/stream
 *
 * Opens a persistent SSE connection for receiving real-time updates.
 * Keep this connection open and send actions via the action endpoints below.
 */
router.get('/game/session/:sessionId/stream', connectToSessionStream);

/**
 * Send action with SSE streaming (buffered response)
 * POST /api/backend/game/session/:sessionId/stream/action
 *
 * Sends action and streams the response via SSE.
 * This endpoint returns complete response with chunks.
 *
 * Request body: { action }
 * Response: SSE stream with events:
 * - processing: Action is being processed
 * - chunk: LLM response chunks
 * - complete: Final data with all files
 */
router.post('/game/session/:sessionId/stream/action', sendActionWithStream);

/**
 * Send action with TRUE streaming from Claude API
 * POST /api/backend/game/session/:sessionId/stream/action-live
 *
 * Streams LLM response in real-time as Claude generates it.
 * Best user experience - text appears character by character.
 *
 * Request body: { action }
 * Response: SSE stream with events:
 * - start: Stream started
 * - stream: Real-time chunks from Claude
 * - complete: Final data with all files
 */
router.post('/game/session/:sessionId/stream/action-live', sendActionWithLiveStream);

// ============================================
// BUILDING FEATURE INTERACTION WITH SSE
// ============================================

/**
 * Building feature interaction with SSE streaming (single-turn)
 * POST /api/backend/game/session/:sessionId/building-feature/stream
 *
 * Handles single-turn building feature interactions.
 * First call without selectedOption shows options, second call with selectedOption executes action.
 *
 * Request body: { sceneId, buildingId, feature, selectedOption? }
 * Response: SSE stream with events:
 * - start: Interaction started
 * - stream: Real-time response chunks
 * - complete: Final result with response and options (if applicable)
 */
router.post('/game/session/:sessionId/building-feature/stream', buildingFeatureInteractionWithStream);

/**
 * Get building features
 * GET /api/backend/game/session/:sessionId/scene/:sceneId/building/:buildingId/features
 *
 * Returns available features for a specific building.
 */
router.get('/game/session/:sessionId/scene/:sceneId/building/:buildingId/features', getBuildingFeatures);

/**
 * Get scene buildings
 * GET /api/backend/game/session/:sessionId/scene/:sceneId/buildings
 *
 * Returns all buildings in a scene with their features.
 */
router.get('/game/session/:sessionId/scene/:sceneId/buildings', getSceneBuildings);

// ============================================
// INTERFACE 5: NPC CHAT WITH SSE
// ============================================

/**
 * Send a message to an NPC with SSE streaming
 * POST /api/backend/npc-chat/:sessionId/:npcId/send
 *
 * Request body: { message: "user's message" }
 * Response: SSE stream with events:
 * - connected: Connection established
 * - chunk: Text chunks from NPC response
 * - complete: Final data with relationship changes
 * - done: Stream finished
 *
 * Example:
 * POST /api/backend/npc-chat/session123/npc_merchant/send
 * Body: { "message": "你好，最近怎么样？" }
 */
router.post('/npc-chat/:sessionId/:npcId/send', sendMessageToNPC);

/**
 * Get chat history with an NPC
 * GET /api/backend/npc-chat/:sessionId/:npcId/history
 *
 * Response: {
 *   success,
 *   sessionId,
 *   npcId,
 *   history: [{ role, content }, ...],
 *   messageCount
 * }
 */
router.get('/npc-chat/:sessionId/:npcId/history', getChatHistory);

/**
 * Clear chat history with an NPC
 * DELETE /api/backend/npc-chat/:sessionId/:npcId/history
 *
 * Response: {
 *   success,
 *   message
 * }
 */
router.delete('/npc-chat/:sessionId/:npcId/history', clearChatHistory);

/**
 * Get active SSE connections info (for debugging)
 * GET /api/backend/debug/connections
 */
router.get('/debug/connections', getActiveConnections);

/**
 * Get active NPC chat connections info (for debugging)
 * GET /api/backend/debug/npc-connections
 */
router.get('/debug/npc-connections', getNPCActiveConnections);

// ============================================
// INTERFACE 6: NOVEL GENERATION
// ============================================

/**
 * Generate a novel based on game history and lore
 * POST /api/backend/novel/generate
 *
 * Request body: {
 *   sessionId: string (required) - Game session ID
 *   novelId?: string - Custom novel ID, auto-generated if not provided
 *   title?: string - Novel title, default: "Untitled Novel"
 *   theme?: string - Theme (adventure/romance/mystery/drama/thriller), default: "adventure"
 *   chapterCount?: number - Number of chapters to generate, default: 1
 *   style?: string - Writing style (literary/casual/dramatic/poetic/thriller), default: "literary"
 *   language?: string - Output language, default: "Chinese"
 * }
 *
 * Response: {
 *   success: true,
 *   message: string,
 *   data: {
 *     novelId: string,
 *     title: string,
 *     theme: string,
 *     style: string,
 *     language: string,
 *     chapterCount: number,
 *     totalWordCount: number,
 *     tokenUsage: { inputTokens, outputTokens },
 *     chapters: [{ id, number, title, wordCount, preview }],
 *     createdAt: string
 *   },
 *   timestamp: string
 * }
 *
 * Example:
 * POST /api/backend/novel/generate
 * Body: {
 *   "sessionId": "5c73d366f103730ce1c5b390c3683d5f",
 *   "title": "Journey Through Time",
 *   "theme": "adventure",
 *   "chapterCount": 3,
 *   "style": "literary"
 * }
 */
router.post('/novel/generate', generateNovelController);


/**
 * Get complete novel data
 * GET /api/backend/novel/:sessionId/:novelId
 *
 * Query parameters:
 * - includeContent: boolean - Include full chapter content (default: false)
 *
 * Response: {
 *   success: true,
 *   data: { ...novel data... }
 * }
 *
 * Example:
 * GET /api/backend/novel/5c73d366f103730ce1c5b390c3683d5f/novel_1234567890?includeContent=true
 */
router.get('/novel/:sessionId/:novelId', getNovelController);

/**
 * Delete a novel
 * DELETE /api/backend/novel/:sessionId/:novelId
 *
 * Response: {
 *   success: true,
 *   message: string
 * }
 *
 * Example:
 * DELETE /api/backend/novel/5c73d366f103730ce1c5b390c3683d5f/novel_1234567890
 */
router.delete('/novel/:sessionId/:novelId', deleteNovelController);

// ============================================
// INTERFACE 9: MUSIC FILES
// ============================================

/**
 * Get music files for a game
 * GET /api/backend/music/:identifier
 *
 * Returns list of music files available for a game.
 * Supports both active games (fileId) and saved games (saveId).
 *
 * Response: {
 *   success: true,
 *   identifier: string,
 *   music: [{ filename, url, title }, ...],
 *   count: number,
 *   timestamp: string
 * }
 *
 * Example:
 * GET /api/backend/music/82df196f6f2f045a977a3baa20c37cf5
 */
router.get('/music/:identifier', getMusicFiles);
router.get('/music/:identifier/:filename', serveMusicFile);
router.get('/saves/:saveId/scenes/:filename', serveSceneImage);
router.get('/saves/:saveId/icons/:filename', serveIconImage);
router.get('/saves/:saveId/avatars/:filename', serveAvatarImage);

// ============================================
// INTERFACE 10: MISSION SYSTEM
// ============================================

/**
 * Get mission summary for a session
 * GET /api/backend/game/session/:sessionId/missions
 *
 * Returns mission summary including active missions, completed missions,
 * turn count, and turns until next mission generation.
 *
 * Response: {
 *   success: true,
 *   data: {
 *     turnCount: number,
 *     lastMissionTurn: number,
 *     turnsUntilNextMission: number,
 *     activeMissions: [...],
 *     completedMissions: [...],
 *     totalMissions: number
 *   },
 *   timestamp: string
 * }
 *
 * Example:
 * GET /api/backend/game/session/5c73d366f103730ce1c5b390c3683d5f/missions
 */
router.get('/game/session/:sessionId/missions', getMissions);

/**
 * Get all mission data for a session
 * GET /api/backend/game/session/:sessionId/missions/all
 *
 * Returns complete mission data including all missions and metadata.
 *
 * Response: {
 *   success: true,
 *   data: {
 *     missions: [...],
 *     turnCount: number,
 *     lastMissionTurn: number
 *   },
 *   timestamp: string
 * }
 *
 * Example:
 * GET /api/backend/game/session/5c73d366f103730ce1c5b390c3683d5f/missions/all
 */
router.get('/game/session/:sessionId/missions/all', getAllMissions);

/**
 * Submit a mission for completion validation
 * POST /api/backend/game/session/:sessionId/missions/:missionId/submit
 *
 * Validates mission completion by checking all possible completion paths.
 * Returns which path (if any) was completed and detailed progress information.
 *
 * Request body: (none required)
 *
 * Response: {
 *   success: true,
 *   completed: boolean,
 *   mission: { ...mission object... },
 *   completedPath: string | null,       // ID of the completed path
 *   completedPathName: string | null,   // Name of the completed path
 *   pathResults: [                      // Results for each path
 *     {
 *       pathId: string,
 *       pathName: string,
 *       completed: boolean,
 *       details: { items: [...], gold: {...}, relationships: [...], ... },
 *       missingRequirements: [...]
 *     }
 *   ],
 *   message: string,
 *   attempts: number,
 *   timestamp: string
 * }
 *
 * Example:
 * POST /api/backend/game/session/abc123/missions/mission_xyz/submit
 */
router.post('/game/session/:sessionId/missions/:missionId/submit', submitMission);

/**
 * Abandon/give up an active mission
 * POST /api/backend/game/session/:sessionId/missions/:missionId/abandon
 *
 * Abandons an active mission without receiving any rewards.
 * If the mission was blocking the storyline, it will be unblocked and the story will continue.
 * The mission status is changed to 'abandoned'.
 *
 * Request body: (none required)
 *
 * Response (if storyline was blocked - SSE stream):
 * - mission_abandoned event: {
 *     success: true,
 *     abandoned: true,
 *     mission: { ...mission object... },
 *     message: string,
 *     storylineUnblocked: boolean
 *   }
 * - stream events: Real-time story continuation chunks
 * - story_complete event: {
 *     characterStatus: object,
 *     newMission: object | null
 *   }
 *
 * Response (if storyline was not blocked - JSON):
 * {
 *   success: true,
 *   abandoned: true,
 *   mission: { ...mission object... },
 *   message: string,
 *   storylineUnblocked: false,
 *   timestamp: string
 * }
 *
 * Error cases:
 * - 400: Mission not found or not active
 * - 500: Server error
 *
 * Example:
 * POST /api/backend/game/session/abc123/missions/mission_xyz/abandon
 */
router.post('/game/session/:sessionId/missions/:missionId/abandon', abandonMissionController);

/**
 * Check if the main storyline is currently blocked by a story mission
 * GET /api/backend/game/session/:sessionId/storyline/status
 *
 * Returns whether the main storyline is blocked and which mission is blocking it.
 * Frontend should check this before allowing story progression.
 *
 * Response: {
 *   success: true,
 *   blocked: boolean,
 *   mission: { ...blocking mission... } | null,
 *   hasActiveStoryMission: boolean,
 *   timestamp: string
 * }
 *
 * Example:
 * GET /api/backend/game/session/abc123/storyline/status
 */
router.get('/game/session/:sessionId/storyline/status', getStorylineStatus);

/**
 * Get player's relationship network
 * GET /api/backend/game/session/:sessionId/network
 *
 * Query parameters:
 * - grouped: boolean - Return network grouped by relationship levels (default: false)
 *
 * Returns the player's relationship network with all NPCs, including their details
 * from the scene data. Relationships are automatically synced to scene JSON files.
 *
 * Example:
 * GET /api/backend/game/session/abc123/network
 * GET /api/backend/game/session/abc123/network?grouped=true
 */
router.get('/game/session/:sessionId/network', getPlayerNetwork);

// ============================================
// INTERFACE 11: TIME MANAGEMENT & ERA SKIPPING
// ============================================

/**
 * Skip to the next historical era
 * POST /api/backend/game/session/:sessionId/skip-to-era
 *
 * Request body: (none required)
 *
 * Response: {
 *   success: true,
 *   message: string,
 *   previousEra: {
 *     index: number,
 *     title: string,
 *     year: string
 *   },
 *   currentEra: {
 *     index: number,
 *     title: string,
 *     year: string,
 *     description: string
 *   },
 *   timeChange: {
 *     yearsPassed: number,
 *     previousDate: string,
 *     newDate: string
 *   },
 *   playerChanges: {
 *     ageIncrease: number,
 *     newAge: number,
 *     statsGrowth: object,
 *     goldGained: number
 *   },
 *   narrative: string,
 *   updatedFiles: {
 *     lore: object,
 *     player: object
 *   },
 *   timestamp: string
 * }
 *
 * Error cases:
 * - 400: Already at the last era
 * - 404: Session not found
 * - 500: Server error
 *
 * Example:
 * POST /api/backend/game/session/abc123/skip-to-era
 */
router.post('/game/session/:sessionId/skip-to-era', skipToNextEra);

// ============================================
// INTERFACE 11: LITERARY STYLES
// ============================================

/**
 * Get all available literary styles
 * GET /api/backend/literary-styles
 *
 * Response: {
 *   success: true,
 *   styles: [
 *     {
 *       id: "delicate_psychological",
 *       name: "细腻心理风格 (Delicate Psychological)",
 *       nameEn: "Delicate Psychological",
 *       description: "注重心理活动描写，细腻刻画人物内心世界",
 *       descriptionEn: "Focus on psychological activities and inner world"
 *     },
 *     ...
 *   ],
 *   count: 6
 * }
 *
 * Example:
 * GET /api/backend/literary-styles
 */
router.get('/literary-styles', getLiteraryStyles);

export default router;
