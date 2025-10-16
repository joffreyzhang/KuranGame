# Interactive Fiction Backend API Documentation

## Overview

This backend provides three ways to interact with the game:

1. **Traditional REST API** - For standard request/response interactions (your existing frontend)
2. **Server-Sent Events (SSE)** - For real-time streaming of game events
3. **JSON Export** - Static JSON files for colleague's frontend to consume

---

## 1. Traditional REST API Endpoints

### Start a New Game Session

**POST** `/api/game/start`

```json
{
  "fileId": "abc123",
  "playerName": "Player1"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "def456",
  "gameState": { ... },
  "characterStatus": { ... },
  "message": "Game session created successfully"
}
```

### Send Player Action

**POST** `/api/game/action`

```json
{
  "sessionId": "def456",
  "action": "探索森林"
}
```

**Response:**
```json
{
  "success": true,
  "response": "你走进了神秘的森林...",
  "gameState": { ... },
  "characterStatus": { ... },
  "actionOptions": ["继续前进", "返回村庄"]
}
```

### Get Game State

**GET** `/api/game/state/:sessionId`

**Response:**
```json
{
  "success": true,
  "gameState": { ... },
  "history": [ ... ],
  "characterStatus": { ... }
}
```

### Get Character Status

**GET** `/api/game/status/:sessionId`

**Response:**
```json
{
  "success": true,
  "status": {
    "character": { ... },
    "inventory": [ ... ],
    "location": "Forest"
  }
}
```

---

## 2. Server-Sent Events (SSE) API

SSE allows real-time streaming of game events. Perfect for progressive rendering of game responses.

### Connect to SSE Stream

**GET** `/api/game/stream/:sessionId`

This establishes a persistent SSE connection. The connection will receive various event types:

**Event Types:**

1. **connected** - Initial connection confirmation
```json
{
  "type": "connected",
  "sessionId": "def456",
  "timestamp": "2025-10-15T10:00:00.000Z"
}
```

2. **action_received** - Action has been received
```json
{
  "type": "action_received",
  "action": "探索森林",
  "timestamp": "2025-10-15T10:00:01.000Z"
}
```

3. **processing** - Action is being processed
```json
{
  "type": "processing",
  "message": "Processing your action...",
  "timestamp": "2025-10-15T10:00:01.100Z"
}
```

4. **response_chunk** - Streaming response text (multiple events)
```json
{
  "type": "response_chunk",
  "chunk": "你走进了神秘的森林，",
  "index": 0,
  "total": 5,
  "timestamp": "2025-10-15T10:00:02.000Z"
}
```

5. **state_update** - Game state has been updated
```json
{
  "type": "state_update",
  "gameState": { ... },
  "characterStatus": { ... },
  "timestamp": "2025-10-15T10:00:03.000Z"
}
```

6. **action_options** - Available action options
```json
{
  "type": "action_options",
  "options": ["继续前进", "返回村庄"],
  "timestamp": "2025-10-15T10:00:03.100Z"
}
```

7. **complete** - Action processing complete
```json
{
  "type": "complete",
  "timestamp": "2025-10-15T10:00:03.200Z"
}
```

8. **error** - An error occurred
```json
{
  "type": "error",
  "error": "Error message",
  "timestamp": "2025-10-15T10:00:03.300Z"
}
```

### Send Action to SSE Stream

**POST** `/api/game/stream/:sessionId/action`

```json
{
  "action": "探索森林"
}
```

This will process the action and stream the response through the SSE connection.

**Response:**
```json
{
  "success": true,
  "message": "Action processed and streamed to SSE connection"
}
```

### JavaScript Example

```javascript
// Connect to SSE stream
const sessionId = 'your-session-id';
const eventSource = new EventSource(`http://localhost:3000/api/game/stream/${sessionId}`);

// Listen for messages
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch(data.type) {
    case 'connected':
      console.log('Connected to game stream');
      break;

    case 'response_chunk':
      // Append chunk to display
      appendText(data.chunk);
      break;

    case 'state_update':
      // Update UI with new state
      updateGameState(data.gameState, data.characterStatus);
      break;

    case 'action_options':
      // Display available options
      displayOptions(data.options);
      break;

    case 'complete':
      console.log('Action processing complete');
      break;

    case 'error':
      console.error('Error:', data.error);
      break;
  }
};

// Send action
async function sendAction(action) {
  const response = await fetch(`http://localhost:3000/api/game/stream/${sessionId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  const result = await response.json();
  console.log(result);
}
```

---

## 3. JSON Export API (For Colleague's Frontend)

All game data is automatically exported to `public/game_data/` directory as JSON files. These files can be accessed directly by your colleague's frontend.

### File Structure

For each session, the following files are generated:

1. **session_<sessionId>.json** - Full session state
2. **status_<sessionId>.json** - Character status
3. **history_<sessionId>.json** - Game history
4. **latest_<sessionId>.json** - Latest action/response

### Get Exported Game Data

**GET** `/api/game/export/:sessionId`

Returns all exported data for a session:

```json
{
  "success": true,
  "data": {
    "session": { ... },
    "status": { ... },
    "history": { ... },
    "latest": { ... }
  }
}
```

### List All Exported Sessions

**GET** `/api/game/export`

Returns a list of all available sessions:

```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "def456",
      "playerName": "Player1",
      "fileId": "abc123",
      "lastUpdated": "2025-10-15T10:00:00.000Z",
      "isInitialized": true
    }
  ],
  "count": 1
}
```

### Direct File Access

Your colleague's frontend can also access the JSON files directly via HTTP:

- `http://localhost:3000/game_data/session_def456.json`
- `http://localhost:3000/game_data/status_def456.json`
- `http://localhost:3000/game_data/history_def456.json`
- `http://localhost:3000/game_data/latest_def456.json`

### Example: Fetch JSON File Directly

```javascript
async function loadGameData(sessionId) {
  const response = await fetch(`http://localhost:3000/game_data/session_${sessionId}.json`);
  const data = await response.json();
  console.log(data);
}
```

---

## Additional Endpoints

### Get Active SSE Connections (Debug)

**GET** `/api/game/stream/debug/connections`

```json
{
  "success": true,
  "activeConnections": 2,
  "sessions": ["def456", "xyz789"]
}
```

### Export Game Save

**GET** `/api/game/save/:sessionId`

### List All Game Saves

**GET** `/api/game/saves`

### Use Item from Inventory

**POST** `/api/game/use-item/:sessionId`

```json
{
  "itemId": "item_123"
}
```

---

## Summary

- **Your Frontend**: Can continue using REST API (`/api/game/action`) OR switch to SSE for real-time streaming (`/api/game/stream/:sessionId`)
- **Colleague's Frontend**: Can read JSON files from `/game_data/` directory or use the export API endpoints
- **All endpoints**: Game data is automatically exported to JSON files after every action

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

## CORS

The API supports CORS for local development. Adjust CORS settings in `server.js` as needed.
