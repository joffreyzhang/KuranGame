import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  uploadAndProcessDocumentController,
  getDocumentFilesController,
  listAllDocumentsController,
  deleteDocumentController,
  createSessionController,
  getSessionStateController,
  startNewRoundController,
  getHistoryController,
  distributeEventController,
  getActiveEventsController,
  interactWithNPCController,
  selectOptionController,
  generateAllImagesController,
  generateWorldMapController,
  generateSceneImageController,
  generateSubsceneImageController,
  generateScenesAndSubscenesController,
  generateNPCImagesController,
  generateNPCVariantController,
  serveImageController,
  getGameFilesController
} from '../controllers/worldInteractionController.js';
import {
  updateWorldSettingController,
  updatePlayerController,
  getAllNPCsController,
  getNPCController,
  addNPCController,
  updateNPCController,
  deleteNPCController,
  updateSubsceneNpcSlotsController,
  getAllScenesController,
  getSceneController,
  addSceneController,
  updateSceneController,
  deleteSceneController,
  getSubscenesController,
  getSubsceneController,
  addSubsceneController,
  updateSubsceneController,
  deleteSubsceneController,
  moveSubsceneController,
  updateScenePositionsController,
  updateSubscenePositionsController,
  uploadNPCImageController,
  uploadSceneImageController,
  uploadSubsceneImageController,
  uploadPlayerImageController,
  uploadWorldMapImageController,
  deleteNPCImageController,
  deleteSceneImageController,
  deleteSubsceneImageController,
} from '../controllers/worldInteractionEditController.js';

const router = express.Router();

// Configure multer for document uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'));
    }
  }
});

// Configure multer for image uploads
const imageUpload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, and WEBP files are allowed'));
    }
  }
});

// ============================================
// DOCUMENT MANAGEMENT ENDPOINTS
// ============================================

/**
 * Upload and process document for world interaction game
 * POST /api/world-interaction/document/upload
 *
 * Request: multipart/form-data with 'document' field
 * Response: {
 *   success: boolean,
 *   message: string,
 *   fileId: string,
 *   metadata: { fileId, originalFileName, fileType, createdAt, worldSetting, npcCount, sceneCount },
 *   preview: { title, playerName, npcCount, sceneCount }
 * }
 */
router.post('/document/upload', upload.single('document'), uploadAndProcessDocumentController);

/**
 * Get world interaction game files by fileId
 * GET /api/world-interaction/document/:fileId
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
router.get('/document/:fileId', getDocumentFilesController);

/**
 * List all uploaded world interaction game files
 * GET /api/world-interaction/document/list/all
 *
 * Response: {
 *   success: boolean,
 *   count: number,
 *   files: [...]
 * }
 */
router.get('/document/list/all', listAllDocumentsController);

/**
 * Delete world interaction game files by fileId
 * DELETE /api/world-interaction/document/:fileId
 *
 * Response: {
 *   success: boolean,
 *   message: string
 * }
 */
router.delete('/document/:fileId', deleteDocumentController);

// ============================================
// SESSION MANAGEMENT ENDPOINTS
// ============================================

/**
 * Create a new world interaction session
 * POST /api/world-interaction/session/create
 *
 * Request body: {
 *   fileId: string  // Required: The game file ID
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   session: {
 *     sessionId: string,
 *     fileId: string,
 *     currentRound: number,
 *     worldInfo: { title, summary, themes },
 *     player: { name, age, gender, ... }
 *   }
 * }
 */
router.post('/session/create', createSessionController);

/**
 * Get session state
 * GET /api/world-interaction/session/:sessionId
 *
 * Response: {
 *   success: boolean,
 *   state: {
 *     sessionId: string,
 *     fileId: string,
 *     currentRound: number,
 *     worldInfo: {...},
 *     player: {...},
 *     currentKeyEvent: {...},
 *     currentKeyEventIndex: number,
 *     completedKeyEvents: number[],
 *     totalKeyEvents: number,
 *     allKeyEventsCompleted: boolean,
 *     activeEvents: [...],
 *     scenes: [...],
 *     allSubscenes: [...],
 *     npcs: [...],
 *     totalEvents: number,
 *     eventHistory: [...]
 *   }
 * }
 */
router.get('/session/:sessionId', getSessionStateController);

/**
 * Start a new round (Round Over button)
 * POST /api/world-interaction/session/:sessionId/next-round
 *
 * This endpoint should be called when:
 * - All active events in current round are completed
 * - Ready to load settings and distribute new events
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   currentRound: number
 * }
 */
router.post('/session/:sessionId/next-round', startNewRoundController);

/**
 * Get interaction history
 * GET /api/world-interaction/session/:sessionId/history
 *
 * Response: {
 *   success: boolean,
 *   sessionId: string,
 *   interactions: [...],
 *   count: number
 * }
 */
router.get('/session/:sessionId/history', getHistoryController);

// ============================================
// EVENT MANAGEMENT ENDPOINTS
// ============================================

/**
 * Generate and distribute a new event for a random NPC
 * POST /api/world-interaction/session/:sessionId/distribute-event
 *
 * This is called at the start of each round to create a new event.
 * The system will:
 * 1. Select a random NPC
 * 2. Generate an event based on current key event
 * 3. Assign the NPC to a subscene
 * 4. Add the event to active events
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   event: {
 *     eventId: string,
 *     eventTitle: string,
 *     eventDescription: string,
 *     eventType: string,
 *     targetNpcId: string,
 *     targetSubsceneId: string,
 *     relatedKeyEventIndex: number,
 *     estimatedImportance: number,
 *     status: 'active',
 *     round: number
 *   },
 *   npc: { id, name, image },
 *   subscene: { id, name, parentSceneName }
 * }
 */
router.post('/session/:sessionId/distribute-event', distributeEventController);

/**
 * Get all active events in current round
 * GET /api/world-interaction/session/:sessionId/events/active
 *
 * Response: {
 *   success: boolean,
 *   count: number,
 *   events: [
 *     {
 *       eventId: string,
 *       eventTitle: string,
 *       targetNpcId: string,
 *       targetSubsceneId: string,
 *       npc: { id, name, image },
 *       subscene: { id, name, parentSceneId, parentSceneName },
 *       ...
 *     }
 *   ]
 * }
 */
router.get('/session/:sessionId/events/active', getActiveEventsController);

/**
 * Interact with a distributed NPC (click on NPC icon)
 * POST /api/world-interaction/session/:sessionId/interact/:eventId
 *
 * When player clicks on an NPC with an active event, this endpoint:
 * 1. Generates the NPC's dialogue
 * 2. Generates 3-4 player response options
 * 3. Returns the interaction data
 *
 * Response: {
 *   success: boolean,
 *   interaction: {
 *     eventId: string,
 *     eventTitle: string,
 *     npc: { id, name, image },
 *     subscene: { id, name, parentSceneName },
 *     npcDialogue: string,  // NPC's dialogue with descriptions
 *     atmosphere: string,
 *     options: [
 *       {
 *         optionId: string,
 *         text: string,
 *         type: string,  // positive, negative, neutral, romantic, friendly, etc.
 *         consequence: string
 *       },
 *       ...
 *     ],
 *     emotionalTone: string
 *   }
 * }
 */
router.post('/session/:sessionId/interact/:eventId', interactWithNPCController);

/**
 * Select an option (player makes a choice)
 * POST /api/world-interaction/session/:sessionId/select-option
 *
 * Request body: {
 *   eventId: string,  // Required
 *   optionId: string  // Required
 * }
 *
 * This endpoint:
 * 1. Terminates the current event
 * 2. Checks if the key event is completed
 * 3. Decides if a new event should be generated
 * 4. If key event completed, advances to next key event
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   completedEvent: {...},
 *   shouldGenerateNewEvent: boolean,
 *   keyEventCompleted: boolean,
 *   nextEventSuggestion: {
 *     targetNpcId: string,
 *     suggestedType: string,
 *     reasoning: string
 *   },
 *   decision: {...}  // Full decision from AI
 * }
 */
router.post('/session/:sessionId/select-option', selectOptionController);

// ============================================
// IMAGE GENERATION ENDPOINTS
// ============================================

/**
 * Generate all images for world interaction
 * POST /api/world-interaction/images/generate-all
 *
 * Request body: {
 *   fileId: string  // Required
 * }
 *
 * This generates:
 * - 1 world map showing all scenes
 * - N scene images (one per scene, showing subscenes)
 * - M subscene images (one per subscene)
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   results: {
 *     worldMap: string,  // API path
 *     scenesGenerated: number,
 *     scenesTotal: number,
 *     subscenesGenerated: number,
 *     subscenesTotal: number,
 *     errors: number
 *   },
 *   details: {
 *     worldMap: string,
 *     scenes: [...],
 *     subscenes: [...],
 *     errors: [...]
 *   }
 * }
 */
router.post('/images/generate-all', generateAllImagesController);

/**
 * Generate all scenes and subscenes images only
 * POST /api/world-interaction/images/generate-scenes
 *
 * Request body: {
 *   fileId: string  // Required
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   results: {
 *     scenesGenerated: number,
 *     scenesTotal: number,
 *     subscenesGenerated: number,
 *     subscenesTotal: number,
 *     errors: number
 *   },
 *   details: {
 *     scenes: [...],
 *     subscenes: [...],
 *     errors: [...]
 *   }
 * }
 */
router.post('/images/generate-scenes', generateScenesAndSubscenesController);

/**
 * Generate all NPC images only
 * POST /api/world-interaction/images/generate-npcs
 *
 * Request body: {
 *   fileId: string  // Required
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   results: {
 *     npcsGenerated: number,
 *     npcsTotal: number,
 *     errors: number
 *   },
 *   details: {
 *     npcs: [...],
 *     errors: [...]
 *   }
 * }
 */
router.post('/images/generate-npcs', generateNPCImagesController);

/**
 * Generate NPC variant image (one by one)
 * POST /api/world-interaction/images/generate-npc-variant
 *
 * Request body: {
 *   fileId: string,  // Required
 *   npcId: string,   // Required
 *   variant: {       // Required
 *     type: string,        // "expression", "clothing", or "pose"
 *     value: string,       // e.g., "happy", "casual", "sitting"
 *     description: string  // Optional additional description
 *   }
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   result: {
 *     npcId: string,
 *     variant: string,
 *     variantType: string,
 *     imagePath: string  // API path to variant image
 *   }
 * }
 */
router.post('/images/generate-npc-variant', generateNPCVariantController);

/**
 * Generate world map image only
 * POST /api/world-interaction/images/generate-world-map
 *
 * Request body: {
 *   fileId: string  // Required
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   imagePath: string  // API path to world map image
 * }
 */
router.post('/images/generate-world-map', generateWorldMapController);

/**
 * Generate single scene image
 * POST /api/world-interaction/images/generate-scene
 *
 * Request body: {
 *   fileId: string,
 *   sceneId: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   sceneId: string,
 *   imagePath: string  // API path like /api/world-interaction/images/{fileId}/scenes/{sceneId}.png
 * }
 */
router.post('/images/generate-scene', generateSceneImageController);

/**
 * Generate single subscene image
 * POST /api/world-interaction/images/generate-subscene
 *
 * Request body: {
 *   fileId: string,
 *   sceneId: string,
 *   subsceneId: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   subsceneId: string,
 *   imagePath: string  // API path like /api/world-interaction/images/{fileId}/subscenes/{subsceneId}.png
 * }
 */
router.post('/images/generate-subscene', generateSubsceneImageController);

/**
 * Serve world interaction images
 * GET /api/world-interaction/images/:fileId/:type/:npcId/:filename (for NPCs with subdirectory)
 * GET /api/world-interaction/images/:fileId/:type/:filename (for scenes, subscenes, players)
 *
 * Examples:
 * - /api/world-interaction/images/2d3096f8.../npcs/gu_qinghan/base.png
 * - /api/world-interaction/images/2d3096f8.../world_map.png/dummy
 * - /api/world-interaction/images/2d3096f8.../scenes/classroom_building.png
 * - /api/world-interaction/images/2d3096f8.../subscenes/class_2_3.png
 * - /api/world-interaction/images/2d3096f8.../players/base.png
 */
router.get('/images/:fileId/:type/:npcId/:filename', serveImageController);
router.get('/images/:fileId/:type/:filename', serveImageController);

// ============================================
// DATA ACCESS ENDPOINTS
// ============================================

/**
 * Get game files (worldSetting, npcSetting, sceneSetting)
 * GET /api/world-interaction/files/:fileId
 *
 * Response: {
 *   success: boolean,
 *   fileId: string,
 *   worldSetting: {...},
 *   npcSetting: {...},
 *   sceneSetting: {...}
 * }
 */
router.get('/files/:fileId', getGameFilesController);

// ============================================
// EDITING ENDPOINTS
// ============================================

// World Setting
router.put('/edit/:fileId/world-setting', updateWorldSettingController);
router.put('/edit/:fileId/player', updatePlayerController);
router.put('/edit/:fileId/scenes/positions', updateScenePositionsController);
router.put('/edit/:fileId/scenes/:sceneId/subscenes/positions', updateSubscenePositionsController);

// NPCs
router.get('/edit/:fileId/npcs', getAllNPCsController);
router.post('/edit/:fileId/npcs', addNPCController);
router.get('/edit/:fileId/npcs/:npcId', getNPCController);
router.put('/edit/:fileId/npcs/:npcId', updateNPCController);
router.delete('/edit/:fileId/npcs/:npcId', deleteNPCController);

// Scenes
router.get('/edit/:fileId/scenes', getAllScenesController);
router.get('/edit/:fileId/scenes/:sceneId', getSceneController);
router.post('/edit/:fileId/scenes', addSceneController);
router.put('/edit/:fileId/scenes/:sceneId', updateSceneController);
router.delete('/edit/:fileId/scenes/:sceneId', deleteSceneController);

// Subscenes
router.get('/edit/:fileId/scenes/:sceneId/subscenes', getSubscenesController);
router.get('/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId', getSubsceneController);
router.post('/edit/:fileId/scenes/:sceneId/subscenes', addSubsceneController);
router.put('/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId', updateSubsceneController);
router.delete('/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId', deleteSubsceneController);

// Subscene NPC Slots
router.put('/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId/npc-slots', updateSubsceneNpcSlotsController);

// Scene-Subscene Relationships
router.post('/edit/:fileId/subscenes/:subsceneId/move', moveSubsceneController);

// Image uploads
router.post('/edit/:fileId/npcs/:npcId/image', imageUpload.single('image'), uploadNPCImageController);
router.post('/edit/:fileId/scenes/:sceneId/image', imageUpload.single('image'), uploadSceneImageController);
router.post('/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId/image', imageUpload.single('image'), uploadSubsceneImageController);
router.post('/edit/:fileId/player/image', imageUpload.single('image'), uploadPlayerImageController);
router.post('/edit/:fileId/world-map/image', imageUpload.single('image'), uploadWorldMapImageController);

// Image deletions
router.delete('/edit/:fileId/npcs/:npcId/image/:variant', deleteNPCImageController);
router.delete('/edit/:fileId/scenes/:sceneId/image', deleteSceneImageController);
router.delete('/edit/:fileId/scenes/:sceneId/subscenes/:subsceneId/image', deleteSubsceneImageController);

export default router;
