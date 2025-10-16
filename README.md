# Interactive Fiction Backend

An interactive fiction game backend that processes PDF game settings and uses LLM for dynamic storytelling.

## 🚀 Quick Deploy to Vercel

Deploy your entire app (frontend + backend) to Vercel in minutes:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

📖 **[Complete Vercel Deployment Guide →](VERCEL_DEPLOYMENT.md)**

**Or use the web interface**: https://vercel.com/new

---

## Features

- 📄 **PDF Upload & Processing**: Upload PDF files or select from `pdf_data` directory
- 🌏 **Chinese Language Support**: Full support for Chinese PDF content
- 🔄 **Real-time Progress with SSE**: Server-Sent Events for live processing updates
- 🎮 **Interactive Game with Claude**: Play interactive fiction powered by Claude API
- 🤖 **Claude AI Integration**: Uses Claude 3.5 Sonnet for intelligent game narration
- 📊 **Game Settings Extraction**: Automatic extraction of characters, locations, items, and rules from PDFs
- 🎯 **Action Options Extraction**: Extract predefined action options from PDFs using `**!! option !!**` markers
- 💬 **Dual Language Support**: Start game with "start game" or "开始游戏"
- ⚡ **Character Status System**: Real-time tracking of attributes, health, inventory, and location
- 📈 **Smart Attribute Tracking**: Distinguishes between absolute values and deltas (50 vs +2)
- 💾 **Persistent Saves**: Automatic game saves stored in JSON files
- 📝 **Live Status Updates**: Claude AI can modify character stats during gameplay

## Tech Stack

- **Node.js** with ES Modules
- **Express.js** for the server
- **Multer** for file uploads
- **pdf-parse** for PDF text extraction
- **@anthropic-ai/sdk** for Claude AI integration
- **Server-Sent Events (SSE)** for real-time updates
- **JSON File Storage** for game saves
- **Vanilla JavaScript** for frontend

## Installation

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
```
PORT=3000
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
CLAUDE_API_KEY=your_claude_api_key_here
```

4. **Important**: Get your Claude API key from [Anthropic Console](https://console.anthropic.com/) and add it to `.env`

5. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### PDF Processing

#### Upload PDF
```http
POST /api/pdf/upload
Content-Type: multipart/form-data

Body: pdf (file)
```

**Response:**
```json
{
  "success": true,
  "fileId": "abc123...",
  "message": "File uploaded successfully",
  "file": {
    "fileId": "abc123...",
    "filename": "game-settings.pdf",
    "size": 524288,
    "uploadedAt": "2025-10-14T10:30:00.000Z"
  }
}
```

#### Process PDF with SSE
```http
GET /api/pdf/process/:fileId
```

**SSE Events:**
```javascript
// Progress updates
data: {"stage":"reading","progress":10,"message":"Reading PDF file..."}
data: {"stage":"extracting","progress":40,"message":"Extracting text content..."}
data: {"stage":"analyzing","progress":60,"message":"Analyzing game settings..."}
data: {"stage":"complete","progress":100,"message":"Processing complete","data":{...}}

// Completion event
event: complete
data: {"success":true,"fileId":"abc123...","gameSettings":{...}}
```

#### Get PDF Status
```http
GET /api/pdf/status/:fileId
```

### Game Management

#### Start Game Session
```http
POST /api/game/start
Content-Type: application/json

{
  "fileId": "abc123...",
  "playerName": "Hero"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "xyz789...",
  "gameState": {
    "currentLocation": "start",
    "inventory": [],
    "health": 100
  }
}
```

#### Send Player Action
```http
POST /api/game/action
Content-Type: application/json

{
  "sessionId": "xyz789...",
  "action": "look around"
}
```

**Response:**
```json
{
  "success": true,
  "response": "You look around and see...",
  "gameState": {
    "currentLocation": "start",
    "inventory": []
  }
}
```

#### Get Game State
```http
GET /api/game/state/:sessionId
```

## How to Use

1. **Start the server**:
```bash
npm start
```

2. **Access the application** at `http://localhost:3000`

3. **Process a PDF**:
   - **Option A**: Upload a new PDF file (drag & drop or click to browse)
   - **Option B**: Select from existing PDFs in `pdf_data` directory
   - Watch real-time processing progress via SSE
   - View extracted game settings

4. **Start Playing**:
   - Click the "🎮 Start Game with Claude" button
   - Type `start game` or `开始游戏` to initialize the game
   - Claude will create an immersive game experience based on your PDF
   - Continue playing by entering your actions

### PDF Format for Best Results

Place your game setting PDFs in the `pdf_data` directory with content like:

```
Game Title: Your Adventure Name

Description: Brief overview of the game world

Characters:
- Character Name: Description and backstory
- Another Character: Their description

Locations:
- Location Name: Description of the place
- Another Location: Its description

Items:
- Item Name: Description and properties

Rules:
1. Game mechanics and rules
2. How the game progresses
3. Win/lose conditions

Full Narrative:
[Your detailed game narrative and setting information...]
```

## Project Structure

```
Interactive-fiction-backend/
├── controllers/
│   ├── pdfController.js      # PDF upload and processing logic
│   └── gameController.js      # Game session management
├── services/
│   ├── pdfService.js          # PDF parsing and extraction
│   ├── gameSettingsService.js # Game settings extraction
│   └── gameService.js         # Game logic and LLM integration
├── routes/
│   ├── pdfRoutes.js           # PDF-related routes
│   └── gameRoutes.js          # Game-related routes
├── middleware/
│   └── upload.js              # Multer file upload configuration
├── public/
│   ├── index.html             # Frontend UI
│   └── app.js                 # Frontend JavaScript
├── uploads/                    # Uploaded PDF files
├── server.js                  # Main server file
├── package.json
├── .env.example
└── README.md
```

## PDF Format Guidelines

For best results, structure your PDF game settings with clear sections:

```
Game Title

Description: Brief overview of the game world and story

Characters:
- Character Name: Description and backstory
- Character Name: Description and backstory

Locations:
- Location Name: Description of the place
- Location Name: Description of the place

Items:
- Item Name: Description and properties
- Item Name: Description and properties

Rules:
1. Game rule or mechanic
2. Game rule or mechanic

Action Options (Optional):
Use **!! option text !!** markers to define predefined action options:
**!! Study magic spells !!**
**!! Train combat skills !!**
**!! Explore the dungeon !!**

Note: Action options marked with **!! !!** will be automatically extracted 
and provided to the AI as suggested actions players can take.

Narrative:
Your full game narrative and story content...
```

## Claude API Integration

This project uses **Claude 3.5 Sonnet** for intelligent game narration. The integration is already complete!

### How It Works

1. **PDF Processing**: The system extracts game settings from your PDF
2. **Game Initialization**: When you type "start game" or "开始游戏", Claude:
   - Reads all the PDF content and settings
   - Creates an immersive opening scene
   - Sets up the game world based on PDF specifications
   - Provides initial game state and options

3. **Interactive Gameplay**: As you play:
   - Your actions are sent to Claude with full game context
   - Claude maintains conversation history for continuity
   - Responses follow PDF rules and settings
   - Supports both Chinese and English interactions

### API Configuration

The system uses:
- **Model**: `claude-3-5-sonnet-20241022`
- **Max Tokens**: 4096 per response
- **Context**: Full PDF content + conversation history (last 20 messages) + character status
- **Language**: Bilingual (Chinese/English)
- **Status Updates**: Claude can modify character stats using special markers

### Status Update Format

Claude can update character status by including markers in responses:

```
{{STATUS_UPDATE: {"character": {"health": 85}, "location": "Dark Cave"}}}
```

**Example:**
```
你进入了黑暗的洞穴，遭遇了怪物！
{{STATUS_UPDATE: {"character": {"health": 85, "money": 10}, "location": "黑暗洞穴"}}}
你获得了 10 金币。
```

See `STATUS_SYSTEM.md` for complete documentation.

### Smart Attribute Tracking

The system now intelligently handles attribute changes:

**How it works:**
1. **Absolute Values**: When the LLM shows "力量: 50" or "力量：50/100", it stores 50 as the absolute value
2. **Delta Values**: When the LLM shows "力量+2" or "获得经验：力量+2", it adds 2 to the current value
3. **Combined Format**: When the LLM shows "力量:52(+2)", it stores 52 as the absolute value and recognizes +2 as the change

**Example:**
```
Initial state: 直播技巧 = 0
After action 1: "获得经验：直播技巧+2" → 直播技巧 = 2
After action 2: "获得经验：直播技巧+3" → 直播技巧 = 5 (not 3!)
After action 3: "直播技巧：8/100" → 直播技巧 = 8 (absolute value)
```

**Benefits:**
- ✅ Cumulative progression tracking
- ✅ Proper experience and skill growth
- ✅ Supports both absolute and incremental updates
- ✅ Works with any attribute format in Chinese or English

All attributes are stored in JSON files at `game_saves/{sessionId}.json` and automatically updated after each game action.

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

## Security Considerations

- File uploads are restricted to PDF files only
- File size is limited (default 10MB)
- Uploaded files are stored with random names
- Add authentication/authorization for production use
- Implement rate limiting for API endpoints
- Sanitize user inputs before processing

## Production Deployment

1. Use a production-ready database (PostgreSQL, MongoDB) instead of in-memory storage
2. Implement Redis for session management
3. Add authentication and authorization
4. Set up proper logging (Winston, Morgan)
5. Configure HTTPS
6. Use environment-specific configurations
7. Implement file cleanup for old uploads
8. Add monitoring and error tracking

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

