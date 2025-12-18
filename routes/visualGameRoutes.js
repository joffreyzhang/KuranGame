import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  uploadAndProcessDocument,
  getDocumentFiles,
  listAllDocuments,
  deleteDocument,
  createSession,
  getSessionState,
  sendActionWithStream,
  getHistory,
  regenerateResponse,
  editHistory,
  generateAllImages,
  generateNPCImage,
  generateNPCVariant,
  generateSceneImage,
  generatePlayerImage,
  serveImage,
  getPresetsList,
  getPresetGame,
  servePresetImage,
  servePresetMusic
} from '../controllers/visualGameController.js';
import {
  updateWorldSettingController,
  updatePlayerController,
  getAllNPCsController,
  getNPCController,
  addNPCController,
  updateNPCController,
  deleteNPCController,
  getAllScenesController,
  addSceneController,
  updateSceneController,
  deleteSceneController,
  getCompleteGameDataController,
  uploadNPCImageController,
  uploadSceneImageController,
  uploadPlayerImageController,
  deleteNPCImageController
} from '../controllers/visualGameEditController.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, PNG, JPG, JPEG, and WEBP files are allowed'));
    }
  }
});

// ============================================
// DOCUMENT MANAGEMENT ENDPOINTS
// ============================================

/**
 * Upload and process document for visual game
 * POST /api/visual/document/upload
 *
 * Request: multipart/form-data with 'document' field
 * Response: {
 *   success,
 *   message,
 *   fileId,
 *   metadata: { fileId, originalFileName, fileType, createdAt, worldSetting, npcCount, sceneCount },
 *   preview: { title, playerName, npcCount, sceneCount }
 * }
 */
router.post('/document/upload', upload.single('document'), uploadAndProcessDocument);

/**
 * Get visual game files by fileId
 * GET /api/visual/document/:fileId
 *
 * Response: {
 *   success,
 *   fileId,
 *   worldSetting: {...},
 *   npcSetting: {...},
 *   sceneSetting: {...},
 *   metadata: {...}
 * }
 */
router.get('/document/:fileId', getDocumentFiles);

/**
 * List all uploaded visual game files
 * GET /api/visual/document/list/all
 *
 * Response: {
 *   success,
 *   count,
 *   files: [{ fileId, originalFileName, createdAt, worldSetting, npcCount, sceneCount }, ...]
 * }
 */
router.get('/document/list/all', listAllDocuments);

/**
 * Delete visual game files by fileId
 * DELETE /api/visual/document/:fileId
 *
 * Response: {
 *   success,
 *   message
 * }
 */
router.delete('/document/:fileId', deleteDocument);

// ============================================
// SESSION MANAGEMENT ENDPOINTS
// ============================================

/**
 * Create a new visual game session
 * POST /api/visual/session/create
 *
 * Request body: {
 *   fileId?: string,      // Optional: Use custom uploaded game
 *   playerName?: string   // Optional: Override player name
 * }
 *
 * Response: {
 *   success,
 *   message,
 *   sessionId,
 *   fileId,
 *   player: { name, age, gender, race, personality, appearance, tone, currentLocation },
 *   currentScene: { id, name },
 *   worldInfo: { title, summary, theme }
 * }
 */
router.post('/session/create', createSession);

/**
 * Get visual game session state
 * GET /api/visual/session/:sessionId
 *
 * Response: {
 *   success,
 *   sessionState: {
 *     sessionId,
 *     mode,
 *     player,
 *     currentScene: { id, name, type, description, atmosphere, dangerLevel, image },
 *     npcs: [{ id, name, job, race, images }, ...],
 *     visitedScenes,
 *     gameStarted,
 *     worldInfo: { title, summary, theme }
 *   }
 * }
 */
router.get('/session/:sessionId', getSessionState);

/**
 * Send action to visual game with SSE streaming
 * POST /api/visual/session/:sessionId/action/stream
 *
 * Request body: {
 *   action: string  // Required: Player's action or dialogue
 * }
 *
 * Response: Server-Sent Events (SSE) stream with the following event types:
 * - type: 'start' - Initial event when processing starts
 * - type: 'raw_text' - Raw text chunks from Claude as they arrive
 * - type: 'step' - Parsed narrative steps (narration, dialogue, thought, transition, choice)
 * - type: 'complete' - Final summary of all steps
 * - type: 'data' - Complete response with all game state data
 * - event: 'done' - Final completion marker
 * - type: 'error' - Error occurred during processing
 */
router.post('/session/:sessionId/action/stream', sendActionWithStream);

/**
 * Get conversation history
 * GET /api/visual/session/:sessionId/history
 *
 * Response: {
 *   success,
 *   history: [{ role, content }, ...],
 *   visitedScenes: [sceneId, ...]
 * }
 */
router.get('/session/:sessionId/history', getHistory);

/**
 * Regenerate a response from conversation history with SSE streaming
 * POST /api/visual/session/:sessionId/regenerate
 *
 * Request body: {
 *   historyIndex?: number  // Optional: Index in history to regenerate from (null = regenerate last)
 * }
 *
 * Response: Server-Sent Events (SSE) stream with the following event types:
 * - type: 'start' - Initial event when regeneration starts
 * - type: 'raw_text' - Raw text chunks from Claude as they arrive
 * - type: 'step' - Parsed narrative steps (narration, dialogue, thought, transition, choice)
 * - type: 'complete' - Final summary of all steps
 * - type: 'data' - Complete response with all game state data
 * - event: 'done' - Final completion marker
 * - type: 'error' - Error occurred during regeneration
 */
router.post('/session/:sessionId/regenerate', regenerateResponse);

/**
 * Edit a message in conversation history
 * PUT /api/visual/session/:sessionId/history/:historyIndex
 *
 * Request body: {
 *   content: string  // Required: New content for the message
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   editedIndex: number,
 *   editedMessage: {
 *     role: 'user' | 'assistant',
 *     content: string,
 *     previousContent: string,
 *     previousLength: number,
 *     newLength: number
 *   },
 *   totalMessages: number,    // Total messages after edit and truncation
 *   deletedMessages: number   // Number of messages deleted after the edited index
 * }
 *
 * Note: When a message is edited, all messages after the edited index are automatically
 * deleted because they were generated based on the old content.
 */
router.put('/session/:sessionId/history/:historyIndex', editHistory);

// ============================================
// IMAGE GENERATION ENDPOINTS
// ============================================

/**
 * Generate all images for a visual game
 * POST /api/visual/images/generate-all
 *
 * Request body: {
 *   fileId?: string,            // Optional: fileId for custom game (null for preset)
 *   generateNPCs?: boolean,     // Default: true
 *   generateScenes?: boolean,   // Default: true
 *   generatePlayers?: boolean,  // Default: true - Generate player character image
 *   generateVariants?: boolean, // Default: false - Generate differential NPC illustrations
 *   removeBg?: boolean          // Default: true - Remove background from NPC images
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   results: {
 *     npcs: number,        // Count of generated NPC images
 *     npcVariants: number, // Count of generated NPC variant images
 *     scenes: number,      // Count of generated scene images
 *     players: number,     // Count of generated player images
 *     errors: number       // Count of errors
 *   },
 *   details: {
 *     npcs: [{ id, name, imagePath, success }, ...],
 *     npcVariants: [{ npcId, npcName, variant, variantType, imagePath, success }, ...],
 *     scenes: [{ id, name, imagePath, success }, ...],
 *     players: [{ name, imagePath, success }, ...],
 *     errors: [{ type, id, name, variant?, error }, ...]
 *   }
 * }
 */
router.post('/images/generate-all', generateAllImages);

/**
 * Generate single NPC image
 * POST /api/visual/images/generate-npc
 *
 * Request body: {
 *   npc: {
 *     id: string,
 *     name: string,
 *     race: string,
 *     age: number,
 *     job: string,
 *     description: string,
 *     appearance: string,
 *     personality: string
 *   },
 *   fileId?: string,
 *   removeBg?: boolean  // Default: true
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string  // API path to the generated image
 * }
 */
router.post('/images/generate-npc', generateNPCImage);

/**
 * Generate NPC variant image using base image as reference
 * POST /api/visual/images/generate-npc-variant
 *
 * This endpoint uses the base image as a reference to generate variants
 * with consistent character appearance (image-to-image style generation)
 *
 * Request body: {
 *   npcId: string,              // Required: NPC identifier
 *   baseImagePath: string,       // Required: Path to base image (e.g., "/api/visual/images/preset/npcs/gandalf/base.png")
 *   variant: {
 *     type: 'expression' | 'clothing' | 'pose',  // Required: Type of variant
 *     value: string,             // Required: Variant value (e.g., "happy", "formal_robe", "sitting")
 *     description?: string       // Optional: Additional description
 *   },
 *   fileId?: string,             // Optional: fileId (null for preset)
 *   removeBg?: boolean           // Default: true
 * }
 *
 * Example:
 * {
 *   "npcId": "gandalf",
 *   "baseImagePath": "/api/visual/images/preset/npcs/gandalf/base.png",
 *   "variant": {
 *     "type": "expression",
 *     "value": "happy",
 *     "description": "微笑着，眼神温和慈祥"
 *   },
 *   "fileId": null,
 *   "removeBg": true
 * }
 */
router.post('/images/generate-npc-variant', generateNPCVariant);

/**
 * Generate single scene image
 * POST /api/visual/images/generate-scene
 *
 * Request body: {
 *   scene: {
 *     id: string,
 *     name: string,
 *     type: string,
 *     description: string,
 *     atmosphere: string
 *   },
 *   fileId?: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string  // API path to the generated image
 * }
 */
router.post('/images/generate-scene', generateSceneImage);

/**
 * Generate player image
 * POST /api/visual/images/generate-player
 *
 * Request body: {
 *   player: {
 *     name: string,
 *     race?: string,
 *     age?: number,
 *     job?: string,
 *     description?: string,
 *     appearance?: string,
 *     personality?: string
 *   },
 *   fileId?: string,
 *   removeBg?: boolean  // Default: true
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string  // API path to the generated image (e.g., "/api/visual/images/preset/players/base.png")
 * }
 */
router.post('/images/generate-player', generatePlayerImage);

/**
 * Serve visual game images
 * GET /api/visual/images/:fileId/npcs/:npcId/:filename
 * GET /api/visual/images/:fileId/scenes/:filename
 * GET /api/visual/images/:fileId/players/:filename
 *
 * Examples:
 * - /api/visual/images/preset/npcs/gandalf/base.png
 * - /api/visual/images/preset/npcs/gandalf/expression_happy.png
 * - /api/visual/images/preset/scenes/shire_baggins.png
 * - /api/visual/images/preset/players/base.png
 * - /api/visual/images/user-file-123/npcs/frodo/base.png
 */
router.get('/images/:fileId/:type/:npcId/:filename', serveImage);
router.get('/images/:fileId/:type/:npcId', serveImage);

// ============================================
// PRESET GAMES ENDPOINTS (visual_saves)
// ============================================

/**
 * Get list of all preset games from visual_saves directory
 * GET /api/visual/presets/list
 *
 * Response: {
 *   success: boolean,
 *   count: number,
 *   presets: [
 *     {
 *       presetId: string,
 *       title: string,
 *       summary: string,
 *       themes: string[],
 *       playerName: string
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/presets/list', getPresetsList);

/**
 * Get specific preset game data with transformed image paths
 * GET /api/visual/presets/:presetId?updateFiles=true
 *
 * Query Parameters:
 * - updateFiles: boolean (default: true) - Whether to write transformed paths back to JSON files
 *
 * Note: By default, this endpoint will automatically update the npcSetting.json and sceneSetting.json
 * files with the transformed image paths. Use ?updateFiles=false to prevent file updates.
 */
router.get('/presets/:presetId', getPresetGame);

/**
 * Serve preset game images
 * GET /api/visual/presets/:presetId/images/npcs/:imageId/:filename
 * GET /api/visual/presets/:presetId/images/scenes/:imageId
 * GET /api/visual/presets/:presetId/images/players/:imageId
 *
 * Examples:
 * - /api/visual/presets/5d4fd123-34f3-fgf6-f477-4e9bcfb4bda3/images/npcs/harry_truman/base.png
 * - /api/visual/presets/5d4fd123-34f3-fgf6-f477-4e9bcfb4bda3/images/npcs/audrey_horne/flirty.png
 * - /api/visual/presets/5d4fd123-34f3-fgf6-f477-4e9bcfb4bda3/images/scenes/great_northern.png
 * - /api/visual/presets/5d4fd123-34f3-fgf6-f477-4e9bcfb4bda3/images/players/base.png
 */
router.get('/presets/:presetId/images/:type/:imageId/:filename', servePresetImage);
router.get('/presets/:presetId/images/:type/:imageId', servePresetImage);

/**
 * Serve preset game music files
 * GET /api/visual/presets/:presetId/musics/:filename
 *
 * Examples:
 * - /api/visual/presets/c1c0450b-b086-440d-a477-f31fb71adbde/musics/Howard Shore - Concerning Hobbits.mp3
 * - /api/visual/presets/c1c0450b-b086-440d-a477-f31fb71adbde/musics/Enya - May It Be.mp3
 */
router.get('/presets/:presetId/musics/:filename', servePresetMusic);

// ============================================
// CONTENT EDITING ENDPOINTS
// ============================================

/**
 * Get complete game data for editing
 * GET /api/visual/edit/:fileId/complete
 *
 * Response: {
 *   success: boolean,
 *   fileId: string,
 *   worldSetting: {...},
 *   npcSetting: {...},
 *   sceneSetting: {...},
 *   metadata: {...}
 * }
 */
router.get('/edit/:fileId/complete', getCompleteGameDataController);

/**
 * Update world setting
 * PUT /api/visual/edit/:fileId/world
 *
 * Request body: {
 *   title?: string,
 *   background?: string,
 *   preamble?: string,
 *   initialPlot?: string,
 *   literary?: string,
 *   summary?: string,
 *   Theme?: string[],
 *   keyEvents?: Array<{title: string, description: string}>,
 *   WorldRules?: object
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   worldSetting: {...}
 * }
 */
router.put('/edit/:fileId/world', updateWorldSettingController);

/**
 * Update player information
 * PUT /api/visual/edit/:fileId/player
 *
 * Request body: {
 *   name?: string,
 *   gender?: string,
 *   appearance?: string,
 *   age?: number,
 *   race?: string,
 *   personality?: string,
 *   tone?: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   player: {...}
 * }
 */
router.put('/edit/:fileId/player', updatePlayerController);

/**
 * Get all NPCs
 * GET /api/visual/edit/:fileId/npcs
 *
 * Response: {
 *   success: boolean,
 *   count: number,
 *   npcs: [...]
 * }
 */
router.get('/edit/:fileId/npcs', getAllNPCsController);

/**
 * Get single NPC by ID
 * GET /api/visual/edit/:fileId/npcs/:npcId
 *
 * Response: {
 *   success: boolean,
 *   npc: {...}
 * }
 */
router.get('/edit/:fileId/npcs/:npcId', getNPCController);

/**
 * Add a new NPC
 * POST /api/visual/edit/:fileId/npcs
 *
 * Request body: {
 *   id: string,              // Required: unique identifier
 *   name: string,            // Required
 *   gender: string,          // Required
 *   description: string,     // Required
 *   appearance: string,      // Required
 *   tone: string,            // Required
 *   age?: number,
 *   job?: string,
 *   personality?: string,
 *   relationship?: string,
 *   abilities?: string[],
 *   dialogue?: string[]
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   npc: {...}
 * }
 */
router.post('/edit/:fileId/npcs', addNPCController);

/**
 * Update an existing NPC
 * PUT /api/visual/edit/:fileId/npcs/:npcId
 *
 * Request body: Any NPC fields to update (except 'id')
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   npc: {...}
 * }
 */
router.put('/edit/:fileId/npcs/:npcId', updateNPCController);

/**
 * Delete an NPC
 * DELETE /api/visual/edit/:fileId/npcs/:npcId
 *
 * Response: {
 *   success: boolean,
 *   message: string
 * }
 */
router.delete('/edit/:fileId/npcs/:npcId', deleteNPCController);


/**
 * Get all scenes
 * GET /api/visual/edit/:fileId/scenes
 *
 * Response: {
 *   success: boolean,
 *   count: number,
 *   scenes: [...]
 * }
 */
router.get('/edit/:fileId/scenes', getAllScenesController);

/**
 * Add a new scene
 * POST /api/visual/edit/:fileId/scenes
 *
 * Request body: {
 *   id: string,              // Required: unique identifier
 *   name: string,            // Required
 *   description: string,     // Required
 *   type?: string,
 *   atmosphere?: string,
 *   dangerLevel?: number,
 *   npcs?: string[],
 *   items?: string[],
 *   events?: string[]
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   scene: {...}
 * }
 */
router.post('/edit/:fileId/scenes', addSceneController);

/**
 * Update an existing scene
 * PUT /api/visual/edit/:fileId/scenes/:sceneId
 *
 * Request body: Any scene fields to update (except 'id')
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   scene: {...}
 * }
 */
router.put('/edit/:fileId/scenes/:sceneId', updateSceneController);

/**
 * Delete a scene
 * DELETE /api/visual/edit/:fileId/scenes/:sceneId
 *
 * Response: {
 *   success: boolean,
 *   message: string
 * }
 */
router.delete('/edit/:fileId/scenes/:sceneId', deleteSceneController);

// ============================================
// IMAGE UPLOAD ENDPOINTS
// ============================================

/**
 * Upload NPC image
 * POST /api/visual/edit/:fileId/npcs/:npcId/image
 *
 * Request: multipart/form-data
 * - image: File (PNG, JPG, JPEG, or WEBP)
 * - variant: string (optional, default: 'base') - e.g., 'base', 'expression_happy', 'clothing_formal'
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string,  // API path to access the image
 *   variant: string,
 *   npcId: string
 * }
 *
 * Example variants:
 * - 'base' - Default NPC appearance
 * - 'expression_happy' - Happy expression variant
 * - 'expression_sad' - Sad expression variant
 * - 'clothing_formal' - Formal clothing variant
 * - 'pose_sitting' - Sitting pose variant
 */
router.post('/edit/:fileId/npcs/:npcId/image', upload.single('image'), uploadNPCImageController);

/**
 * Upload scene image
 * POST /api/visual/edit/:fileId/scenes/:sceneId/image
 *
 * Request: multipart/form-data
 * - image: File (PNG, JPG, JPEG, or WEBP)
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string,  // API path to access the image
 *   sceneId: string
 * }
 *
 * Note: Uploading a new scene image will replace the existing one
 */
router.post('/edit/:fileId/scenes/:sceneId/image', upload.single('image'), uploadSceneImageController);

/**
 * Upload player image
 * POST /api/visual/edit/:fileId/player/image
 *
 * Request: multipart/form-data
 * - image: File (PNG, JPG, JPEG, or WEBP)
 * - variant: string (optional, default: 'base') - e.g., 'base', 'expression_happy'
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string,  // API path to access the image
 *   variant: string
 * }
 */
router.post('/edit/:fileId/player/image', upload.single('image'), uploadPlayerImageController);

/**
 * Delete NPC image variant
 * DELETE /api/visual/edit/:fileId/npcs/:npcId/image/:variant
 *
 * Response: {
 *   success: boolean,
 *   message: string
 * }
 *
 * Example: DELETE /api/visual/edit/my-file-id/npcs/gandalf/image/expression_happy
 */
router.delete('/edit/:fileId/npcs/:npcId/image/:variant', deleteNPCImageController);

export default router;
