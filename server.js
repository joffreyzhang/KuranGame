import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import pdfRouter from './routes/pdfRoutes.js';
import gameRouter from './routes/gameRoutes.js';

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

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5500',
      /\.onrender\.com$/,  // Allow all Render domains
      /\.github\.io$/      // GitHub Pages support
    ];

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
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(join(__dirname, uploadDir)));
app.use(express.static(join(__dirname, 'public')));

// Routes
app.use('/api/pdf', pdfRouter);
app.use('/api/game', gameRouter);

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
    endpoints: {
      health: '/health',
      pdf: '/api/pdf/*',
      game: '/api/game/*',
      manifest: '/api/game/manifest',
      frontend: '/index.html'
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
  console.log(`Upload directory: ${uploadDir}`);
});
