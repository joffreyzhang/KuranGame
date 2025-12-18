import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import backendRouter from './routes/backendRoutes.js';
import visualGameRouter from './routes/visualGameRoutes.js';
import worldInteractionRouter from './routes/worldInteractionRoutes.js';
import authRoutes from './login/routes/authRoutes.js';
import emailRoutes from './login/controller/emailController.js';
import payRoutes from './login/routes/payRoutes.js';
import gameRoutes from './login/routes/gameRoutes.js';
import visualRoutes from './login/routes/visualRoutes.js';
import worldRoutes from './login/routes/worldRoutes.js';
import { authMiddleware } from './login/authMiddleware.js';
import notify from './login/notify.js';
import './login/script/scheduledTask.js';
import './login/script/minioScheduledTask.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Create required directories
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const gameDataDir = join(__dirname, 'public', 'game_data');
if (!fs.existsSync(gameDataDir)) {
  fs.mkdirSync(gameDataDir, { recursive: true });
}

const gameSavesDir = join(__dirname, 'game_saves');
if (!fs.existsSync(gameSavesDir)) {
  fs.mkdirSync(gameSavesDir, { recursive: true });
}

// CORS Configuration - Enhanced for external frontend development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://0.0.0.0:3000',
      'http://localhost:5500',
      'http://localhost:8000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:8000',
      'http://127.0.0.1:8080',
      /\.onrender\.com$/,  // Allow all Render domains
      /\.github\.io$/,     // GitHub Pages support
      /\.vercel\.app$/,    // Vercel deployments
      /\.netlify\.app$/    // Netlify deployments
    ];

    // For development, also allow localhost with any port
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      // In development, allow all origins for easier frontend testing
      if (process.env.NODE_ENV !== 'production') {
        console.log('Development mode: Allowing origin for testing');
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200 // Support legacy browsers
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files - uploads and game data
app.use('/uploads', express.static(join(__dirname, uploadDir)));
app.use('/game_data', express.static(join(__dirname, 'public', 'game_data')));

// ============================================
// BACKEND API ROUTES
// ============================================
app.use('/api/backend', backendRouter);
// app.use('/api/auth', optionalAuthMiddleware, authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', authMiddleware, emailRoutes);
app.use('/api/pay', authMiddleware, payRoutes);
app.use('/api/wechat', authMiddleware, notify);
app.use('/api/auth', authMiddleware , gameRoutes);
app.use('/api/optical', authMiddleware, visualRoutes);
app.use('/api/worldInteraction', authMiddleware, worldRoutes);
// ============================================
// VISUAL GAME API ROUTES (NEW)
// ============================================
app.use('/api/visual', visualGameRouter);
app.use('/api/world-interaction', worldInteractionRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    environment: process.env.RENDER ? 'Render' : 'Local',
    nodeVersion: process.version
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Interactive Fiction Backend API',
    version: '2.0',
    description: 'Backend service for interactive fiction games powered by LLM - Supports both RPG and Visual Novel modes',

    // ============================================
    // GAME MODES
    // ============================================
    gameModes: {
      rpg: {
        name: 'RPG Game Mode',
        description: 'Full-featured interactive fiction RPG with building interactions, NPC chat, missions, novel writing, time management, and network services',
        baseUrl: '/api/backend'
      },
      visual: {
        name: 'Visual Novel Mode',
        description: 'Simplified visual novel game mode with streamlined narrative experience using only world, NPC, and scene settings',
        baseUrl: '/api/visual'
      }
    },

    // ============================================
    // BACKEND API INTERFACES (RPG MODE)
    // ============================================
    api: {
      description: 'Pure backend API with 3 core interfaces',
      baseUrl: '/api/backend',

      // Interface 1: Document Upload & Processing
      documentInterface: {
        uploadAndProcess: 'POST /api/backend/pdf/upload-and-process',
        processOnly: 'POST /api/backend/pdf/process/:fileId',
        description: 'Upload and process PDF/DOCX files to generate game data'
      },

      // Interface 2: JSON File Retrieval
      filesInterface: {
        getAllFiles: 'GET /api/backend/files/:identifier',
        listFiles: 'GET /api/backend/files/:identifier/list',
        getSpecificFile: 'GET /api/backend/files/:identifier/:fileType',
        description: 'Retrieve game data JSON files (lore, player, items, scenes)',
        supportedFileTypes: ['lore', 'player', 'items', 'scenes']
      },

      // Interface 3: Game Session & LLM Response
      gameInterface: {
        createSession: 'POST /api/backend/game/session/create',
        sendAction: 'POST /api/backend/game/session/:sessionId/action',
        getSessionState: 'GET /api/backend/game/session/:sessionId',
        description: 'Manage game sessions and interact with LLM. Action endpoint returns both LLM response and updated JSON files.'
      },

      // Interface 4: Image Generation & Access
      imageInterface: {
        generateAll: 'POST /api/backend/images/generate/:fileId',
        listImages: 'GET /api/backend/images/:fileId/list',
        serveImage: 'GET /api/backend/images/:fileId/serve/:imageType/:imageName',
        getFileIds: 'GET /api/backend/images/fileids',
        description: 'Generate and access AI-generated images for NPCs, scenes, and buildings. Images are generated automatically after JSON creation and served via static routes.'
      },

      // Interface 5: Player Settings
      playerSettingsInterface: {
        updatePlayerName: 'PUT /api/backend/game/session/:sessionId/player/name',
        description: 'Update player character settings in an existing game session. Currently supports character name updates.'
      },

      // SSE Streaming (Optional - for real-time updates)
      sseInterface: {
        connectStream: 'GET /api/backend/game/session/:sessionId/stream',
        sendActionStream: 'POST /api/backend/game/session/:sessionId/stream/action',
        sendActionLive: 'POST /api/backend/game/session/:sessionId/stream/action-live',
        description: 'Server-Sent Events for real-time LLM response streaming. Best for live text generation.'
      }
    },

    // ============================================
    // WORKFLOW EXAMPLE
    // ============================================
    workflow: {
      step1: {
        action: 'Upload Document (PDF/DOCX)',
        endpoint: 'POST /api/backend/pdf/upload-and-process',
        request: 'multipart/form-data with "pdf" field',
        response: '{ success, fileId, message, data }'
      },
      step2: {
        action: 'Get generated JSON files',
        endpoint: 'GET /api/backend/files/:fileId',
        response: '{ success, files: { lore, player, items, scenes } }'
      },
      step3: {
        action: 'Create game session',
        endpoint: 'POST /api/backend/game/session/create',
        request: '{ fileId, playerName }',
        response: '{ success, sessionId, files: {...} }'
      },
      step4: {
        action: 'Start game',
        endpoint: 'POST /api/backend/game/session/:sessionId/action',
        request: '{ action: "开始游戏" }',
        response: '{ success, response, actionOptions, updatedFiles: {...} }'
      },
      step5: {
        action: 'Continue gameplay',
        endpoint: 'POST /api/backend/game/session/:sessionId/action',
        request: '{ action: "user selected action or custom input" }',
        response: '{ success, response, actionOptions, updatedFiles: {...} }',
        note: 'Repeat this step until game ends'
      }
    },

    // ============================================
    // VISUAL GAME API INTERFACES (NEW)
    // ============================================
    visualApi: {
      description: 'Simplified visual novel game API',
      baseUrl: '/api/visual',

      sessionInterface: {
        createSession: 'POST /api/visual/session/create',
        getSessionState: 'GET /api/visual/session/:sessionId',
        sendAction: 'POST /api/visual/session/:sessionId/action',
        getHistory: 'GET /api/visual/session/:sessionId/history',
        description: 'Manage visual game sessions and interact with narrative AI'
      }
    },

    // ============================================
    // VISUAL GAME WORKFLOW (NEW)
    // ============================================
    visualWorkflow: {
      step1: {
        action: 'Create visual game session',
        endpoint: 'POST /api/visual/session/create',
        request: '{ playerName?: "custom name" } (optional)',
        response: '{ success, sessionId, player, currentScene, worldInfo }'
      },
      step2: {
        action: 'Start game',
        endpoint: 'POST /api/visual/session/:sessionId/action',
        request: '{ action: "开始游戏" }',
        response: '{ success, narrative, actionOptions, currentScene, npcs }'
      },
      step3: {
        action: 'Continue gameplay',
        endpoint: 'POST /api/visual/session/:sessionId/action',
        request: '{ action: "user selected action or custom input" }',
        response: '{ success, narrative, actionOptions, currentScene, npcs }',
        note: 'Repeat this step to progress through the story'
      },
      step4: {
        action: 'Get session state (optional)',
        endpoint: 'GET /api/visual/session/:sessionId',
        response: '{ success, sessionState: { player, currentScene, visitedScenes, worldInfo } }'
      }
    },

    features: {
      gameModes: 'Two game modes: Full RPG and Visual Novel',
      pdfSupport: 'PDF and DOCX file processing (RPG mode)',
      llmIntegration: 'Claude and DeepSeek LLM support',
      jsonExport: 'Automatic JSON file generation and updates',
      imageGeneration: 'AI-generated images for NPCs, scenes, and buildings (RPG mode)',
      sessionManagement: 'Persistent game session management for both modes',
      visualNovel: 'Simplified visual novel mode with 3 JSON settings',
      cors: 'CORS enabled for external frontend development'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
