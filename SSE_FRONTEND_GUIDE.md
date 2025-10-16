# 🎮 SSE Frontend Development Guide

## Essential Guide for Building a Frontend with Server-Sent Events

This guide covers the key SSE functions and events your colleague needs to implement for the interactive fiction game.

---



---

## 2. Event Types to Handle

Your colleague must handle these **7 critical event types**:

### Event 1: `connected` ✅
**Purpose:** Confirms SSE connection is established

```javascript
{
  "type": "connected",
  "sessionId": "abc123...",
  "timestamp": "2025-10-15T10:00:00.000Z"
}
```

**Action:** Display connection status, enable UI

---

### Event 2: `action_received` 📨
**Purpose:** Server acknowledges player's action

```javascript
{
  "type": "action_received",
  "action": "探索森林",
  "timestamp": "2025-10-15T10:00:01.000Z"
}
```

**Action:** Show loading indicator, display player's action in chat

---

### Event 3: `processing` ⚙️
**Purpose:** Server is processing the action (calling Claude AI)

```javascript
{
  "type": "processing",
  "message": "Processing your action...",
  "timestamp": "2025-10-15T10:00:01.100Z"
}
```

**Action:** Show "AI is thinking..." indicator

---

### Event 4: `response_chunk` 📝 (CRITICAL - Multiple events)
**Purpose:** Streaming response text in chunks for progressive rendering

```javascript
{
  "type": "response_chunk",
  "chunk": "你走进了神秘的森林，",  // Text chunk
  "index": 0,                        // Current chunk number
  "total": 5,                        // Total chunks
  "timestamp": "2025-10-15T10:00:02.000Z"
}
```

**Action:**
- Append `chunk` to display in real-time
- Create typing animation effect
- Show progress (index/total)

**Example Implementation:**
```javascript
let currentResponse = '';

function handleResponseChunk(data) {
  currentResponse += data.chunk;
  updateGameTextDisplay(currentResponse);

  // Optional: Show progress
  const progress = ((data.index + 1) / data.total * 100).toFixed(0);
  updateProgressBar(progress);
}
```

---

### Event 5: `state_update` 🎯 (CRITICAL)
**Purpose:** Game state and character status have changed

```javascript
{
  "type": "state_update",
  "gameState": {
    "currentLocation": "Forest",
    "inventory": [...],
    "health": 95,
    "isInitialized": true
  },
  "characterStatus": {
    "character": {
      "name": "Player1",
      "level": 1,
      "health": 95,
      "maxHealth": 100,
      "energy": 80,
      "maxEnergy": 100
    },
    "location": "Forest",
    "inventory": [
      {
        "id": "item_123",
        "name": "Sword",
        "description": "A sharp sword",
        "quantity": 1
      }
    ],
    "flags": {}
  },
  "timestamp": "2025-10-15T10:00:03.000Z"
}
```

**Action:**
- Update character stats panel (health, energy, level)
- Update inventory UI
- Update location display
- Store state for later use

**Example Implementation:**
```javascript
function handleStateUpdate(data) {
  const status = data.characterStatus;

  // Update character info
  document.getElementById('charName').textContent = status.character.name;
  document.getElementById('charLevel').textContent = status.character.level;
  document.getElementById('charHealth').textContent =
    `${status.character.health}/${status.character.maxHealth}`;

  // Update health bar
  const healthPercent = (status.character.health / status.character.maxHealth) * 100;
  document.getElementById('healthBar').style.width = `${healthPercent}%`;

  // Update location
  document.getElementById('location').textContent = status.location;

  // Update inventory
  renderInventory(status.inventory);
}
```

---

### Event 6: `action_options` 🎲
**Purpose:** Available action choices for the player

```javascript
{
  "type": "action_options",
  "options": [
    "探索森林深处",
    "与村长交谈",
    "在旅馆休息"
  ],
  "timestamp": "2025-10-15T10:00:03.100Z"
}
```

**Action:**
- Display as clickable buttons
- Allow player to select next action

**Example Implementation:**
```javascript
function handleActionOptions(data) {
  const container = document.getElementById('actionButtons');
  container.innerHTML = '';

  data.options.forEach(option => {
    const button = document.createElement('button');
    button.textContent = option;
    button.onclick = () => sendAction(option);
    container.appendChild(button);
  });
}
```

---

### Event 7: `complete` ✅
**Purpose:** Action processing finished

```javascript
{
  "type": "complete",
  "timestamp": "2025-10-15T10:00:03.200Z"
}
```

**Action:**
- Hide loading indicators
- Re-enable input field
- Finalize UI updates

---

### Event 8: `error` ❌
**Purpose:** An error occurred

```javascript
{
  "type": "error",
  "error": "Failed to process action",
  "timestamp": "2025-10-15T10:00:03.300Z"
}
```

**Action:**
- Display error message to user
- Re-enable input
- Allow retry

---

## 3. Sending Actions via SSE

After establishing SSE connection, send actions like this:

```javascript
async function sendAction(action) {
  // Disable input while processing
  disableInput();

  // Send action to SSE endpoint
  const response = await fetch(
    `http://localhost:3000/api/game/stream/${sessionId}/action`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    }
  );

  const result = await response.json();
  if (!result.success) {
    showError('Failed to send action');
    enableInput();
  }

  // Response will come through SSE events
}
```

---

## 4. Complete Event Handler

```javascript
function handleGameEvent(data) {
  switch(data.type) {
    case 'connected':
      console.log('Connected to game stream');
      showConnectionStatus(true);
      break;

    case 'action_received':
      showPlayerMessage(data.action);
      break;

    case 'processing':
      showLoadingIndicator(true);
      break;

    case 'response_chunk':
      appendResponseChunk(data.chunk);
      updateProgress(data.index, data.total);
      break;

    case 'state_update':
      updateGameState(data.gameState);
      updateCharacterStatus(data.characterStatus);
      break;

    case 'action_options':
      displayActionButtons(data.options);
      break;

    case 'complete':
      showLoadingIndicator(false);
      enableInput();
      finalizeResponse();
      break;

    case 'error':
      showError(data.error);
      enableInput();
      break;

    default:
      console.warn('Unknown event type:', data.type);
  }
}
```

---

## 5. UI Components to Implement

### Required UI Elements:

1. **Connection Status Indicator**
   ```html
   <div id="connectionStatus">⚫ Disconnected</div>
   ```

2. **Character Status Panel**
   ```html
   <div id="characterPanel">
     <div>Name: <span id="charName"></span></div>
     <div>Level: <span id="charLevel"></span></div>
     <div>Health: <span id="charHealth"></span></div>
     <div class="health-bar">
       <div id="healthBar" style="width: 100%"></div>
     </div>
     <div>Location: <span id="location"></span></div>
   </div>
   ```

3. **Game Text Area** (streaming response)
   ```html
   <div id="gameText"></div>
   ```

4. **Action Options** (dynamic buttons)
   ```html
   <div id="actionButtons"></div>
   ```

5. **Input Area**
   ```html
   <input id="actionInput" type="text" placeholder="Enter action...">
   <button onclick="sendAction()">Send</button>
   ```

6. **Inventory Display**
   ```html
   <div id="inventory"></div>
   ```

---

## 6. Critical Data Structures

### Character Status Structure
```javascript
{
  character: {
    name: string,
    level: number,
    health: number,
    maxHealth: number,
    energy: number,
    maxEnergy: number,
    money: number
  },
  location: string,
  inventory: [
    {
      id: string,
      name: string,
      description: string,
      quantity: number
    }
  ],
  flags: object  // Game-specific flags
}
```

### Game State Structure
```javascript
{
  currentLocation: string,
  inventory: array,
  health: number,
  createdAt: string (ISO date),
  isInitialized: boolean,
  lastAction: string (ISO date)
}
```

---

## 7. Connection Management

### Heartbeat Handling
The server sends heartbeats every 30 seconds. You don't need to handle these, but you can use them for connection monitoring:

```javascript
let lastHeartbeat = Date.now();

eventSource.addEventListener('message', (event) => {
  if (event.data.startsWith(':heartbeat')) {
    lastHeartbeat = Date.now();
    return;
  }
  // Handle normal messages
});

// Check connection health
setInterval(() => {
  const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
  if (timeSinceLastHeartbeat > 45000) {
    // Connection may be dead, show warning
    showConnectionWarning();
  }
}, 10000);
```

### Reconnection Logic
```javascript
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

eventSource.onerror = (error) => {
  eventSource.close();

  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    setTimeout(() => {
      console.log(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
      connectToSSE();
    }, 2000 * reconnectAttempts);  // Exponential backoff
  } else {
    showError('Connection lost. Please refresh the page.');
  }
};
```

---

## 8. Flow Diagram

```
User Action Flow:
1. User types action or clicks button
2. Frontend sends POST to /api/game/stream/:sessionId/action
3. SSE events stream back:

   action_received → processing → response_chunk (x N) → state_update → action_options → complete

4. Frontend updates UI progressively
5. User sees next action options
```

---

## 9. Example: Complete Minimal Implementation

```html
<!DOCTYPE html>
<html>
<head>
    <title>SSE Game</title>
</head>
<body>
    <div id="status">Disconnected</div>
    <div id="gameText"></div>
    <div id="actionButtons"></div>
    <input id="input" type="text" />
    <button onclick="send()">Send</button>

    <script>
        const sessionId = 'YOUR_SESSION_ID';
        let eventSource;
        let currentText = '';

        function connect() {
            eventSource = new EventSource(
                `http://localhost:3000/api/game/stream/${sessionId}`
            );

            eventSource.onmessage = (e) => {
                const data = JSON.parse(e.data);

                if (data.type === 'connected') {
                    document.getElementById('status').textContent = 'Connected';
                }
                else if (data.type === 'response_chunk') {
                    currentText += data.chunk;
                    document.getElementById('gameText').textContent = currentText;
                }
                else if (data.type === 'action_options') {
                    const container = document.getElementById('actionButtons');
                    container.innerHTML = '';
                    data.options.forEach(opt => {
                        const btn = document.createElement('button');
                        btn.textContent = opt;
                        btn.onclick = () => send(opt);
                        container.appendChild(btn);
                    });
                }
                else if (data.type === 'complete') {
                    currentText = '';
                }
            };
        }

        async function send(action) {
            action = action || document.getElementById('input').value;
            await fetch(`http://localhost:3000/api/game/stream/${sessionId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            document.getElementById('input').value = '';
        }

        connect();
    </script>
</body>
</html>
```

---

## 10. Key Takeaways

**Most Important Events:**
1. ✅ `response_chunk` - Progressive text rendering (handle multiple events)
2. ✅ `state_update` - Update character stats and inventory
3. ✅ `action_options` - Display available actions

**Must-Have Features:**
- Progressive text rendering (chunks)
- Character status panel (health, level, location)
- Inventory display
- Action buttons
- Connection status indicator

**Testing:**
- Use `/sse-demo.html` as reference
- Start a game session first
- Test with different action types
- Monitor console for event logs

---

## Reference

- Live Demo: `http://localhost:3000/sse-demo.html`
- API Docs: `API_DOCUMENTATION.md`
- Full Implementation: `SSE_IMPLEMENTATION.md`
