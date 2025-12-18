# Interactive Fiction Backend

A comprehensive interactive fiction game backend that combines AI-powered storytelling, automatic image generation, and user authentication. Upload PDF/DOCX game scenarios and the system automatically extracts structured data, generates contextual images, and powers dynamic gameplay through Claude AI.

## Features

### Core Game Features
- **Intelligent Document Processing**: Upload PDF/DOCX files and automatically extract game data (lore, characters, items, scenes)
- **AI-Powered Storytelling**: Real-time narrative generation using Claude AI with streaming responses (SSE)
- **Automatic Image Generation**: AI-generated visuals for NPCs, scenes, buildings, world maps, and player portraits
- **Multi-Session Management**: Support for multiple concurrent game sessions with isolated states
- **Dynamic Status Tracking**: Automatic character stats, inventory, attributes, and relationship management
- **NPC Chat System**: Real-time conversations with NPCs using SSE streaming
- **Building Interactions**: Interactive features for shops, inns, guilds, temples, and more
- **Novel Generation**: Convert game sessions into formatted novels with multiple chapters
- **Progressive World Unlock**: Scene-based exploration with locked/unlocked areas
- **Music File Management**: Background music serving for enhanced atmosphere

### Authentication & User Management
- **JWT Authentication**: Secure login/register with access + refresh token system
- **Email Verification**: Send verification codes via email
- **Password Security**: Bcrypt password hashing
- **Role-Based Access**: User and admin roles with middleware protection
- **Redis Integration**: Token caching and rate limiting
- **MySQL Database**: Persistent user and game data storage

### Storage & Asset Management
- **MinIO Object Storage**: Scalable file storage for game assets
- **Session Persistence**: Automatic session recovery after server restart
- **Pre-processed Game Packages**: Support for ready-to-play game packages with assets

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MySQL database
- Redis server
- MinIO server (optional, for object storage)
- SMTP server (for email features)

### Setup Steps

1. Clone the repository:
```bash
git clone <repository-url>
cd Interactive-fiction-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root:
```env
# Server Configuration
PORT=3000
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760

# AI Services
CLAUDE_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
IMAGE_MODEL=dall-e-3

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_database_name

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email Configuration (nodemailer)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@example.com

# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
MINIO_BUCKET=game-assets
MINIO_USE_SSL=false
```

4. **Set up MySQL database**:
```sql
CREATE DATABASE your_database_name;
-- Run migration scripts from login/db/ directory
```

5. **Important**:
   - Get your Claude API key from [Anthropic Console](https://console.anthropic.com/)
   - Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/)
   - Configure your SMTP settings for email features

6. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will be available at `http://localhost:3000`

## API Endpoints

### Authentication API (`/api/auth`)

#### User Authentication
- `POST /api/auth/register` - Register new user (username, email, password)
- `POST /api/auth/login` - Login with username/password, returns JWT tokens
- `POST /api/auth/refresh` - Refresh both access and refresh tokens
- `POST /api/auth/refresh-access-token` - Refresh access token only

#### Email Services
- `POST /api/auth/email/send-verification-code` - Send 6-digit verification code (rate limited: 60s)
- `POST /api/auth/email/send` - Send custom email (HTML + text)
- `GET /api/auth/email/test-config` - Test email configuration

#### Games Management
- `POST /api/auth/games` - Create game record with file upload
- `GET /api/auth/games/user/:userId` - Get user's games
- `GET /api/auth/games/:fileId/files` - Get initialization files by fileId
- `POST /api/auth/games/session` - Complete game session (upload to MinIO)

#### Test & Admin Endpoints
- `GET /api/auth/test-token` - Verify JWT token (requires auth)
- `GET /api/auth/test-admin` - Admin-only test (requires admin role)

### Game Backend API (`/api/backend`)

#### Document Processing
```bash
# Upload and process PDF/DOCX game scenarios
POST /api/backend/pdf/upload-and-process
Content-Type: multipart/form-data
Body: { pdf: File }
```

**Response:**
```json
{
  "success": true,
  "fileId": "abc123def456",
  "message": "Document processed and game data generated successfully",
  "data": {
    "filename": "game.pdf",
    "size": 1048576,
    "textLength": 50000,
    "numPages": 100
  }
}
```

#### File Retrieval
```bash
# Get all game data files
GET /api/backend/files/:fileId

# Get specific file type (lore, player, items, scenes)
GET /api/backend/files/:fileId/:fileType

# Get game history
GET /api/backend/history/:sessionId

# Get saved game files
GET /api/backend/saves/:saveId/files
GET /api/backend/saves/:saveId/files/:fileType
```

**Response Example:**
```json
{
  "success": true,
  "identifier": "abc123def456",
  "type": "file",
  "files": {
    "lore": {
      "worldBackground": { "title": "World Setting", "content": [...] },
      "playerStory": { "title": "Character Background", "content": [...] },
      "keyEvents": [...],
      "gameTime": { "era": "Medieval", "period": "Spring" }
    },
    "player": {
      "profile": { "name": "Player", "age": 18, "gender": "male" },
      "stats": { "level": 1, "health": 100, "money": 100 },
      "inventory": { "equipment": {}, "items": [] }
    },
    "items": {},
    "scenes": {}
  },
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

#### Session Management
```bash
# Create new game session
POST /api/backend/game/session/create
Content-Type: application/json
Body: { fileId: "abc123", playerName: "John" }

# Get session state
GET /api/backend/game/session/:sessionId

# Update player name
PUT /api/backend/game/session/:sessionId/player/name
```

**Create Session Response:**
```json
{
  "success": true,
  "message": "Game session created successfully",
  "sessionId": "xyz789session",
  "fileId": "abc123def456",
  "playerName": "John",
  "gameState": {
    "currentLocation": "start",
    "inventory": [],
    "health": 100,
    "isInitialized": false
  },
  "files": { "lore": {}, "player": {}, "items": {}, "scenes": {} }
}
```

#### Gameplay Actions
```bash
# Start the game (streaming response)
POST /api/backend/game/session/:sessionId/stream/action-live
Content-Type: application/json
Body: { action: "开始游戏" }

# Continue gameplay (streaming response)
POST /api/backend/game/session/:sessionId/stream/action-live
Body: { action: "探索周围" }

# SSE stream connection
GET /api/backend/game/session/:sessionId/stream

# Use item from inventory
POST /api/backend/game/session/:sessionId/use-item
Body: { itemId: "sword_01" }

# Change scene/location
POST /api/backend/game/session/:sessionId/change-scene
Body: { sceneId: "forest_entrance" }
```

**Gameplay Response:**
```json
{
  "success": true,
  "response": "你醒来时发现自己身处一个神秘的森林...\n\n[ACTION: 探索周围环境]\n[ACTION: 查看背包]\n[ACTION: 呼唤同伴]",
  "actionOptions": [
    { "id": "action_1", "index": 1, "text": "探索周围环境" },
    { "id": "action_2", "index": 2, "text": "查看背包" },
    { "id": "action_3", "index": 3, "text": "呼唤同伴" }
  ],
  "gameState": { "currentLocation": "forest_entrance", "isInitialized": true },
  "characterStatus": { "health": 100, "level": 1 },
  "updatedFiles": { "player": {}, "scenes": {} }
}
```

#### NPC Chat System
```bash
# Chat with NPC (streaming SSE response)
POST /api/backend/npc-chat/:sessionId/:npcId/send
Body: { message: "Hello" }

# Get chat history
GET /api/backend/npc-chat/:sessionId/:npcId/history

# Clear chat history
DELETE /api/backend/npc-chat/:sessionId/:npcId/history
```

#### Building Interactions
```bash
# Interact with building features (shop, inn, guild, etc.)
POST /api/backend/game/session/:sessionId/building-feature/stream
Body: { sceneId: "town_01", buildingId: "shop_01", featureId: "buy", additionalContext: "..." }

# Get building features
GET /api/backend/game/session/:sessionId/scene/:sceneId/building/:buildingId/features

# Get scene buildings
GET /api/backend/game/session/:sessionId/scene/:sceneId/buildings
```

#### Novel Generation
```bash
# Generate novel from game session
POST /api/backend/novel/generate
Body: { sessionId: "xyz789", theme: "adventure", style: "literary" }

# Get complete novel
GET /api/backend/novel/:sessionId/:novelId

# Get specific chapter
GET /api/backend/novel/:sessionId/:novelId/chapter/:chapterNumber

# Delete novel
DELETE /api/backend/novel/:sessionId/:novelId
```

#### Image Management
```bash
# Generate all game images (NPCs, scenes, buildings, world map, player)
POST /api/backend/images/generate/:fileId

# Serve images
GET /api/backend/images/:fileId/world              # World map
GET /api/backend/images/:fileId/player             # Player portrait
GET /api/backend/images/:fileId/serve/scenes/:filename
GET /api/backend/images/:fileId/serve/icons/:filename
GET /api/backend/images/:fileId/serve/avatars/:filename

# Serve saved game images
GET /api/backend/saves/:saveId/scenes/:filename
GET /api/backend/saves/:saveId/icons/:filename
GET /api/backend/saves/:saveId/avatars/:filename
```

#### Music Files
```bash
# Get music file list
GET /api/backend/music/:identifier

# Stream music file
GET /api/backend/music/:identifier/:filename
```

#### Debug Endpoints
```bash
# Get active SSE connections
GET /api/backend/debug/connections

# Get active NPC chat connections
GET /api/backend/debug/npc-connections
```

### Health Check
- `GET /health` - Server health status
- `GET /` - API documentation and information

### Postman Collection
- [Test Collection](https://zhangznesta-786306.postman.co/workspace/ZHENG-ZHANG's-Workspace~d816af23-1908-4ff6-83f8-25fbc507b5e9/collection/49458710-aee8cfb4-89ec-4851-8f24-b9acb49196df?action=share&creator=49458710)

## Project Structure

```
Interactive-fiction-backend/
├── controllers/
│   ├── backendController.js          # Core game logic handlers
│   └── sseController.js              # SSE streaming for real-time gameplay
├── services/
│   ├── gameService.js                # Game session management & LLM integration
│   ├── gameInitializationService.js  # Document processing & data extraction
│   ├── statusService.js              # Player status tracking & updates
│   ├── imageGenerationService.js     # AI image generation (DALL-E)
│   ├── npcChatService.js            # NPC conversation system
│   ├── novelWritingService.js       # Novel generation from gameplay
│   ├── buildingInteractionService.js # Building feature interactions
│   ├── pdfService.js                # PDF document parsing
│   ├── docxService.js               # DOCX document parsing
│   └── utils.js                     # JSON file operations & utilities
├── routes/
│   └── backendRoutes.js             # Game API routes
├── middleware/
│   ├── upload.js                    # Multer file upload configuration
│   └── authMiddleware.js            # JWT authentication middleware
├── login/
│   ├── controllers/
│   │   ├── authController.js        # User authentication handlers
│   │   └── gamesController.js       # Games management handlers
│   ├── services/
│   │   ├── authService.js           # User CRUD operations (MySQL)
│   │   ├── gamesService.js          # Game records management
│   │   └── minioService.js          # MinIO object storage
│   └── db/                          # Database migrations & schema
├── public/
│   └── game_data/                   # Generated game data & sessions
│       ├── [fileId]/                # Original game files
│       │   ├── lore_[fileId].json
│       │   ├── player_[fileId].json
│       │   ├── items_[fileId].json
│       │   ├── scenes_[fileId].json
│       │   └── images/              # AI-generated images
│       └── [sessionId]/             # Active game sessions
│           ├── history_[sessionId].json
│           ├── player_[sessionId].json
│           └── [other session files]
├── game_saves/                      # Pre-processed game packages
│   └── [saveId]/                    # Complete game with assets
│       ├── [JSON files]
│       ├── avatars/
│       ├── scenes/
│       ├── icons/
│       └── music/
├── uploads/                         # Temporary uploaded files
├── server.js                        # Main Express server
├── package.json                     # Dependencies
├── .env                            # Environment configuration
└── README.md
```

## Technologies Used

### Backend Framework
- **Express.js** - Web application framework
- **CORS** - Cross-origin resource sharing
- **Multer** - File upload handling

### AI & LLM
- **Anthropic Claude AI** (@anthropic-ai/sdk) - Story generation & game logic
- **OpenAI API** - Image generation (DALL-E)

### Document Processing
- **pdf-parse** - PDF text extraction
- **mammoth** - DOCX to text conversion

### Database & Storage
- **MySQL** (mysql2) - User data & game records
- **PostgreSQL** (pg) - Additional data storage
- **Redis** - Caching & rate limiting
- **MinIO** - Object storage for game assets

### Authentication & Security
- **JSON Web Tokens** (jsonwebtoken) - JWT authentication
- **bcryptjs** - Password hashing
- **Zod** - Schema validation

### Email
- **Nodemailer** - Email sending (verification codes, notifications)

### Image Processing
- **Sharp** - Image resizing & optimization

### Development
- **Nodemon** - Auto-restart during development
- **dotenv** - Environment variable management

## Game Flow

### 1. Document Upload & Processing
1. Upload PDF/DOCX via `/api/backend/pdf/upload-and-process`
2. System extracts text from document
3. Claude AI analyzes and generates 4 JSON files:
   - **lore**: World background, player story, key events, game time
   - **player**: Character profile, stats, inventory
   - **items**: Item database (weapons, consumables, materials)
   - **scenes**: World map, NPCs, buildings, exits
4. Automatic image generation:
   - World map
   - Player portrait
   - NPC avatars (parallel generation)
   - Scene backgrounds (parallel generation)
   - Building icons (parallel generation)
5. Returns `fileId` for game initialization

### 2. Session Creation
1. Call `/api/backend/game/session/create` with `fileId` and `playerName`
2. System creates isolated session directory
3. Copies game files to session storage
4. Initializes player status from template
5. Returns `sessionId` and complete game data

### 3. Game Initialization
1. Send "开始游戏" (Start Game) action via streaming endpoint
2. Claude AI receives comprehensive game context
3. Generates opening narrative with action options
4. Response streamed in real-time (SSE)
5. System extracts actions and updates player status
6. Conversation history persisted to disk

### 4. Gameplay Loop
1. **Player Action** → User selects action or types custom input
2. **LLM Processing** → Claude receives:
   - Full game lore and world data
   - Current player status
   - Unlocked scenes (progressive exploration)
   - Recent conversation history
3. **Story Generation** → Claude generates narrative with:
   - Story continuation
   - Action options marked with `[ACTION: ...]`
   - Implicit status changes
4. **Status Update** → System automatically:
   - Extracts attribute changes
   - Updates inventory (add/remove items)
   - Modifies character stats
   - Unlocks new scenes with `[UNLOCK_SCENE: id]`
   - Updates NPC memories
5. **Persistence** → All changes saved to session files
6. Loop continues until game conclusion

### 5. Additional Features
- **NPC Chat**: Real-time conversations with context-aware NPCs
- **Building Interactions**: Shop purchases, inn stays, guild quests
- **Item Usage**: Direct item consumption from inventory
- **Scene Navigation**: Move between unlocked locations
- **Novel Generation**: Convert gameplay into formatted novels
- **Session Recovery**: Automatic recovery after server restart

## Image Generation

The system automatically generates contextual images based on game lore:

### Process
1. **Context Extraction**: Reads `lore_[fileId].json` to understand:
   - Historical era and time period
   - Cultural and geographical setting
   - Key events and atmosphere
2. **Contextual Prompts**: Generates era-appropriate prompts:
   ```
   "A detailed portrait of [NPC name], a [age]-year-old [gender] [job]
   in [era] during [time period], wearing period-accurate clothing..."
   ```
3. **Parallel Generation**: All images generated concurrently for performance
4. **Image Processing**:
   - Downloads from DALL-E API
   - Resizes using Sharp:
     - Avatars: 300px
     - Scenes: 1000px
     - Icons: 300px
     - World/Player: 500px
5. **Storage**: Saved to `public/game_data/images/[fileId]/`
6. **JSON Updates**: Image URLs written back to `scenes_[fileId].json`

### Image Types
- **World Map**: Bird's-eye view of game world
- **Player Portrait**: Character portrait based on profile
- **NPC Avatars**: Individual portraits for each character
- **Scene Backgrounds**: Landscape images for locations
- **Building Icons**: Interior scenes for structures

## Session Management

### Session Storage
- **In-Memory**: Active sessions stored in Map during runtime
- **Persistent**: JSON files on disk for durability
- **Recovery**: Automatic recovery from disk after server restart

### Session Data
Each session tracks:
- Unique `sessionId` (32-character hex)
- Source `fileId` (original game)
- Player name and profile
- Game state (location, inventory, health, flags)
- Character status (stats, attributes, relationships)
- Conversation history (last 20 messages)
- Complete action history
- Token usage statistics

### Features
- **Progressive World Unlock**: Track locked/unlocked scenes
- **Relationship System**: Monitor player-NPC relationships
- **Achievement Tracking**: Record completed achievements
- **Flag System**: Track story choices and branches
- **Session Isolation**: Each session has independent state
- **Pre-processed Games**: Support for packaged games with assets

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Specify your license here]

## Support

For issues or questions, please open an issue on the GitHub repository.

