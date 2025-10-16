# 📋 Using the Manifest File - Frontend Integration Guide

## What is the Manifest File?

The manifest file (`/game_data/manifest.json`) is a **central index** that lists all available game sessions with their metadata and file references. It solves the problem of confusing file names by providing a clear, structured way to discover and access game data.

## Why Use It?

**Before (Confusing):**
- Files: `0280a60bb37d72855932cd4d62daa201.json`, `session_abc123.json`
- No way to know what's inside without opening each file
- Hard to find which session belongs to which player

**After (Clear with Manifest):**
```json
{
  "sessions": [
    {
      "sessionId": "abc123...",
      "playerName": "Player1",
      "shortId": "abc123",
      "displayName": "Player1 - 2025-10-15 10:30:00",
      "lastUpdated": "2025-10-15T10:30:00.000Z",
      "isInitialized": true,
      "files": {
        "session": "session_abc123.json",
        "status": "status_abc123.json",
        "history": "history_abc123.json",
        "latest": "latest_abc123.json"
      }
    }
  ]
}
```

## How to Use

### Method 1: Via API Endpoint (Recommended)

```javascript
// Fetch the manifest
const response = await fetch('http://localhost:3000/api/game/manifest');
const manifest = await response.json();

console.log(`Found ${manifest.totalSessions} sessions`);

// List all sessions
manifest.sessions.forEach(session => {
  console.log(`${session.displayName} (${session.shortId})`);
  console.log(`Files: ${JSON.stringify(session.files)}`);
});

// Access a specific session's data
const firstSession = manifest.sessions[0];
const sessionData = await fetch(
  `http://localhost:3000/game_data/${firstSession.files.session}`
);
```

### Method 2: Direct File Access

```javascript
// Read manifest file directly
const response = await fetch('http://localhost:3000/game_data/manifest.json');
const manifest = await response.json();

// Access files
const session = manifest.sessions[0];
const statusResponse = await fetch(
  `http://localhost:3000/game_data/${session.files.status}`
);
const statusData = await statusResponse.json();
```

## Manifest Structure

```json
{
  "version": "1.0",
  "generatedAt": "2025-10-15T10:30:00.000Z",
  "totalSessions": 2,
  "description": "Manifest file listing all available game sessions",

  "usage": {
    "listAll": "Read this file to get all available sessions",
    "accessSession": "Use files.session, files.status, etc. to access specific data",
    "directAccess": "Files can be accessed at /game_data/<filename>"
  },

  "sessions": [
    {
      "sessionId": "abc123def456...",      // Full session ID
      "playerName": "Player1",              // Player's name
      "fileId": "game_001",                 // Associated game/PDF file
      "shortId": "abc123de",                // Short ID for display (8 chars)
      "displayName": "Player1 - 10/15/2025, 10:30:00 AM",

      "createdAt": "2025-10-15T10:00:00.000Z",
      "lastUpdated": "2025-10-15T10:30:00.000Z",
      "isInitialized": true,

      "files": {
        "session": "session_abc123def456.json",   // Session state
        "status": "status_abc123def456.json",     // Character status
        "history": "history_abc123def456.json",   // Game history
        "latest": "latest_abc123def456.json"      // Latest action
      }
    }
  ]
}
```

## Complete Example: Building a Session Selector

```html
<!DOCTYPE html>
<html>
<head>
    <title>Session Selector</title>
</head>
<body>
    <h1>Select a Game Session</h1>
    <div id="sessions"></div>

    <script>
        const API_BASE = 'http://localhost:3000';

        async function loadSessions() {
            try {
                // Step 1: Fetch manifest
                const response = await fetch(`${API_BASE}/api/game/manifest`);
                const manifest = await response.json();

                if (!manifest.success || manifest.sessions.length === 0) {
                    document.getElementById('sessions').innerHTML =
                        '<p>No sessions available</p>';
                    return;
                }

                // Step 2: Display sessions
                const container = document.getElementById('sessions');

                manifest.sessions.forEach(session => {
                    const div = document.createElement('div');
                    div.innerHTML = `
                        <h3>${session.displayName}</h3>
                        <p>Session ID: ${session.shortId}</p>
                        <p>Status: ${session.isInitialized ? 'Active' : 'Not Started'}</p>
                        <button onclick="loadSession('${session.sessionId}', '${JSON.stringify(session.files)}')">
                            Load Session
                        </button>
                    `;
                    container.appendChild(div);
                });

            } catch (error) {
                console.error('Error loading sessions:', error);
            }
        }

        async function loadSession(sessionId, filesJson) {
            const files = JSON.parse(filesJson);

            // Load all data for this session
            const [sessionData, statusData, historyData, latestData] = await Promise.all([
                fetch(`${API_BASE}/game_data/${files.session}`).then(r => r.json()),
                fetch(`${API_BASE}/game_data/${files.status}`).then(r => r.json()),
                fetch(`${API_BASE}/game_data/${files.history}`).then(r => r.json()),
                fetch(`${API_BASE}/game_data/${files.latest}`).then(r => r.json())
            ]);

            console.log('Session loaded:', {
                session: sessionData,
                status: statusData,
                history: historyData,
                latest: latestData
            });

            // Now you can display the game data in your UI
        }

        // Load sessions on page load
        loadSessions();
    </script>
</body>
</html>
```

## File Naming Convention

The manifest follows this clear naming pattern:

| File Type | Pattern | Example |
|-----------|---------|---------|
| Manifest | `manifest.json` | `manifest.json` |
| Session | `session_<sessionId>.json` | `session_abc123.json` |
| Status | `status_<sessionId>.json` | `status_abc123.json` |
| History | `history_<sessionId>.json` | `history_abc123.json` |
| Latest | `latest_<sessionId>.json` | `latest_abc123.json` |

## Auto-Updates

The manifest is **automatically updated** whenever:
- A new game session is created
- A player sends an action
- Session data is deleted

No manual refresh needed - just re-fetch the manifest to get the latest list.

## Polling Strategy

For real-time updates without SSE:

```javascript
// Poll manifest every 5 seconds
setInterval(async () => {
    const response = await fetch('http://localhost:3000/api/game/manifest');
    const manifest = await response.json();

    // Update UI with latest sessions
    updateSessionList(manifest.sessions);
}, 5000);
```

## Summary

1. **Read manifest first**: `GET /api/game/manifest`
2. **Find your session**: Look through `manifest.sessions[]`
3. **Access files**: Use `session.files.session`, `session.files.status`, etc.
4. **Display info**: Use `session.displayName`, `session.shortId` for UI

**No more confusing file names!** The manifest tells you exactly which files to read and what they contain.
