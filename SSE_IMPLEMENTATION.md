# Server-Sent Events (SSE) and JSON Export Implementation

## Overview

This implementation adds **Server-Sent Events (SSE)** for real-time game streaming and **JSON export** functionality for external frontend access, while maintaining full backward compatibility with the existing REST API.

## What's New

### 1. Server-Sent Events (SSE) Interface
- Real-time streaming of game events
- Progressive rendering of Claude responses
- Live game state updates
- **Endpoint:** `GET /api/game/stream/:sessionId`
- **Demo:** `http://localhost:3000/sse-demo.html`

### 2. JSON Export System
- Automatic export of game data to JSON files
- Files stored in `public/game_data/` directory
- Accessible via direct HTTP or API endpoints
- Auto-updates after every game action
- **Viewer:** `http://localhost:3000/json-viewer.html`

### 3. Backward Compatibility
- All existing REST API endpoints continue to work
- Your existing frontend (`index.html`, `game.html`) remains fully functional
- No breaking changes

## File Structure

```
Interactive-fiction-backend/
├── controllers/
│   ├── gameController.js       (Updated: Added JSON export)
│   └── sseController.js         (New: SSE handlers)
├── services/
│   ├── exportService.js         (New: JSON export logic)
│   ├── gameService.js
│   └── statusService.js
├── routes/
│   └── gameRoutes.js            (Updated: Added SSE & export routes)
├── public/
│   ├── game_data/               (New: Auto-generated JSON files)
│   ├── index.html               (Existing: Upload page)
│   ├── game.html                (Existing: Game page)
│   ├── sse-demo.html            (New: SSE demo)
│   └── json-viewer.html         (New: JSON viewer for colleague)
├── API_DOCUMENTATION.md         (New: Complete API docs)
└── SSE_IMPLEMENTATION.md        (This file)
```

## How It Works

### For Your Frontend (Existing + SSE Option)

**Option 1: Keep using REST API (No changes needed)**
```javascript
// Your existing code continues to work
fetch('/api/game/action', {
  method: 'POST',
  body: JSON.stringify({ sessionId, action })
});
```

**Option 2: Use SSE for real-time streaming**
```javascript
// Connect to SSE stream
const eventSource = new EventSource(`/api/game/stream/${sessionId}`);

// Listen for events
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle different event types: connected, response_chunk, state_update, etc.
};

// Send action
fetch(`/api/game/stream/${sessionId}/action`, {
  method: 'POST',
  body: JSON.stringify({ action })
});
```

### For Colleague's Frontend (Read-Only Access)

**Option 1: Use the Manifest (Recommended)**
```javascript
// Step 1: Get the manifest to discover all sessions
const response = await fetch('/api/game/manifest');
const manifest = await response.json();

// Step 2: Pick a session and access its files
const session = manifest.sessions[0];
const sessionData = await fetch(`/game_data/${session.files.session}`);
```

**Option 2: Direct JSON file access**
```javascript
// Fetch JSON files directly (if you know the session ID)
const response = await fetch('/game_data/session_abc123.json');
const data = await response.json();
```

**Option 3: Use export API endpoints**
```javascript
// Get all game data for a session
const response = await fetch('/api/game/export/abc123');
const { data } = await response.json();
// data contains: session, status, history, latest
```

## Available Endpoints

### SSE Endpoints
- `GET /api/game/stream/:sessionId` - Connect to SSE stream
- `POST /api/game/stream/:sessionId/action` - Send action with SSE response
- `GET /api/game/stream/debug/connections` - View active connections

### Export Endpoints
- `GET /api/game/manifest` - Get manifest (index of all sessions) **← Start here!**
- `GET /api/game/export/:sessionId` - Get all exported data for session
- `GET /api/game/export` - List all available sessions

### JSON Files (Direct Access)
- `/game_data/manifest.json` - **Master index of all sessions**
- `/game_data/session_<sessionId>.json` - Session state
- `/game_data/status_<sessionId>.json` - Character status
- `/game_data/history_<sessionId>.json` - Game history
- `/game_data/latest_<sessionId>.json` - Latest action/response

## Demo Pages

1. **SSE Demo** (`/sse-demo.html`)
   - Real-time game streaming demo
   - Shows SSE event flow
   - Interactive game interface with live updates

2. **JSON Viewer** (`/json-viewer.html`)
   - Designed for colleague's frontend
   - Read-only data viewer
   - Auto-refreshes every 5 seconds
   - Lists all available sessions

## Testing

### Test SSE Functionality

1. Start the server:
   ```bash
   npm start
   ```

2. Create a game session:
   - Visit `http://localhost:3000/index.html`
   - Upload a PDF and start a game
   - Note the session ID

3. Test SSE streaming:
   - Visit `http://localhost:3000/sse-demo.html`
   - Enter the session ID
   - Connect and send actions
   - Watch real-time streaming

### Test JSON Export

1. Create some game activity (upload PDF, start game, send actions)

2. Check JSON files:
   - Visit `http://localhost:3000/json-viewer.html`
   - Select a session
   - View all exported data

3. Direct file access:
   - Navigate to `http://localhost:3000/game_data/`
   - Access JSON files directly

## Key Features

### Automatic Export
- Every game action automatically exports data to JSON
- No manual triggers needed
- Files always up-to-date

### Real-time Streaming
- SSE provides progressive text rendering
- Live game state updates
- Heartbeat keeps connection alive

### Multiple Access Methods
- REST API (traditional)
- SSE (real-time streaming)
- JSON files (direct access)
- Export API (programmatic access)

## For Your Colleague

Your colleague can build their frontend using:

1. **Manifest file (Recommended)** - Read `/api/game/manifest` to discover all sessions
2. **Polling JSON files** - Simple, no backend connection needed
3. **Export API** - More structured, uses REST endpoints
4. **SSE (Read-only)** - Can listen to game events in real-time

All content is accessible through the exported JSON files:
- Game narrative
- Character status
- Inventory
- Location
- Action options
- Full history

**See `MANIFEST_GUIDE.md` for detailed instructions on using the manifest file.**

## Migration Guide

### No Migration Needed!

Your existing frontend works as-is. If you want to add SSE:

1. Add EventSource connection
2. Listen for events
3. Update UI progressively
4. Keep REST API as fallback

See `sse-demo.html` for a complete implementation example.

## API Documentation

For complete API documentation, see `API_DOCUMENTATION.md`.

## Architecture Diagram

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────────┐
│  Your Frontend  │────────>│  Express Server  │────────>│   Claude API       │
│  (index.html,   │<────────│                  │<────────│                    │
│   game.html)    │  REST   │  - REST API      │         └────────────────────┘
└─────────────────┘         │  - SSE Stream    │
                            │  - JSON Export   │
┌─────────────────┐         │                  │         ┌────────────────────┐
│  SSE Frontend   │<========│                  │────────>│  public/game_data/ │
│  (sse-demo.html)│   SSE   │                  │ Export  │  *.json files      │
└─────────────────┘         └──────────────────┘         └────────────────────┘
                                                                     ^
┌─────────────────────────────────────────────────────────────────┘
│  Colleague's Frontend (json-viewer.html)
│  - Direct file access
│  - Export API
│  - Read-only
└─────────────────────────────────────────────────────────────────
```

## Summary

- ✅ SSE implemented for real-time streaming
- ✅ JSON export system for external access
- ✅ Backward compatibility maintained
- ✅ Demo pages created
- ✅ Full API documentation provided
- ✅ Your existing frontend still works
- ✅ Colleague can access all game content via JSON

Enjoy your enhanced interactive fiction backend!
