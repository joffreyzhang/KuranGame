// API URL - works for both local development and Vercel deployment
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'  // Local development
  : '/api';  // Production (Vercel) - uses relative path

let sessionId = null;
let fileId = null;
let isProcessing = false;

// DOM Elements
const chatArea = document.getElementById('chatArea');
const playerInput = document.getElementById('playerInput');
const sendBtn = document.getElementById('sendBtn');
const startGameBtn = document.getElementById('startGameBtn');

// Get fileId from URL parameters
const urlParams = new URLSearchParams(window.location.search);
fileId = urlParams.get('fileId');

// Initialize
if (!fileId) {
    addMessage('system', 'No game file selected. Please go back and process a PDF first.');
    playerInput.disabled = true;
    sendBtn.disabled = true;
} else {
    initializeGame();
}

async function initializeGame() {
    try {
        addMessage('system', 'Creating game session...');
        
        const response = await fetch(`${API_BASE_URL}/game/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileId: fileId,
                playerName: 'Player'
            })
        });

        const data = await response.json();

        if (data.success) {
            sessionId = data.sessionId;
            addMessage('system', 'Game session created! Click "开始游戏" button to start.');
            removeHint();
            
            // Load initial character status
            await loadCharacterStatus();
        } else {
            throw new Error(data.error || 'Failed to create game session');
        }
    } catch (error) {
        console.error('Error initializing game:', error);
        addErrorMessage(`Failed to initialize game: ${error.message}`);
        playerInput.disabled = true;
        sendBtn.disabled = true;
    }
}

async function loadCharacterStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/game/status/${sessionId}`);
        const data = await response.json();
        
        if (data.success) {
            updateStatusDisplay(data.status);
        }
    } catch (error) {
        console.error('Error loading character status:', error);
    }
}

function removeHint() {
    const hint = chatArea.querySelector('.hint');
    if (hint) {
        hint.remove();
    }
}

function addMessage(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    if (type === 'system') {
        messageDiv.textContent = text;
    } else {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = text;
        messageDiv.appendChild(bubble);
    }
    
    chatArea.appendChild(messageDiv);
    scrollToBottom();
}

// Render action buttons below the last game message
function renderActionButtons(options) {
  // Remove previous buttons if any
  const prev = document.getElementById('action-buttons');
  if (prev) prev.remove();

  const container = document.createElement('div');
  container.id = 'action-buttons';
  container.style.margin = '10px 0 20px 0';

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '10px';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = `${opt.index ? opt.index + '. ' : ''}${opt.text}`;
    btn.style.background = 'linear-gradient(135deg, #20c997 0%, #17a2b8 100%)';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.padding = '10px 14px';
    btn.style.borderRadius = '20px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '600';
    btn.onclick = () => {
      // Send the option value or index as user's action
      playerInput.value = (opt.value || opt.index || opt.text).toString();
      sendAction();
    };
    wrap.appendChild(btn);
  });

  container.appendChild(wrap);
  chatArea.appendChild(container);
  scrollToBottom();
}

function addLoadingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message game';
    messageDiv.id = 'loading-indicator';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = '<div class="loading"></div>';
    messageDiv.appendChild(bubble);
    
    chatArea.appendChild(messageDiv);
    scrollToBottom();
}

function removeLoadingIndicator() {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        loading.remove();
    }
}

function addErrorMessage(text) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = text;
    chatArea.appendChild(errorDiv);
    scrollToBottom();
}

function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !isProcessing) {
        sendAction();
    }
}

async function startGameWithButton() {
    if (isProcessing || !sessionId) return;

    // Hide the start button after clicking
    startGameBtn.classList.add('hidden');
    
    // Send the start game command
    playerInput.value = '开始游戏';
    await sendAction();
}

async function sendAction() {
    const action = playerInput.value.trim();
    
    if (!action || isProcessing || !sessionId) {
        return;
    }

    // Add player message
    addMessage('player', action);
    
    // Clear input
    playerInput.value = '';
    
    // Disable input while processing
    isProcessing = true;
    playerInput.disabled = true;
    sendBtn.disabled = true;
    
    // Show loading indicator
    addLoadingIndicator();

    try {
        const response = await fetch(`${API_BASE_URL}/game/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: sessionId,
                action: action
            })
        });

        const data = await response.json();

        // Remove loading indicator
        removeLoadingIndicator();

        if (data.success) {
            console.log('✅ Action response received:', {
                hasResponse: !!data.response,
                hasCharacterStatus: !!data.characterStatus,
                hasActionOptions: !!data.actionOptions,
                actionOptionsCount: data.actionOptions ? data.actionOptions.length : 0,
                actionOptions: data.actionOptions
            });

            addMessage('game', data.response);

            // Update character status if provided
            if (data.characterStatus) {
                updateStatusDisplay(data.characterStatus);
            }

            // Render action option buttons if provided
            if (Array.isArray(data.actionOptions) && data.actionOptions.length > 0) {
                console.log('🎯 Rendering action buttons:', data.actionOptions);
                renderActionButtons(data.actionOptions);
            } else {
                console.log('⚠️ No action options to render');
            }

            // Hide start button after game starts
            if (startGameBtn) {
                startGameBtn.classList.add('hidden');
            }

            // Remove hint after first successful action
            removeHint();
        } else {
            throw new Error(data.error || 'Failed to process action');
        }
    } catch (error) {
        console.error('Error sending action:', error);
        removeLoadingIndicator();
        addErrorMessage(`Error: ${error.message}`);
    } finally {
        // Re-enable input
        isProcessing = false;
        playerInput.disabled = false;
        sendBtn.disabled = false;
        playerInput.focus();
    }
}

// Update status display
function updateStatusDisplay(status) {
    if (!status) return;
    
    // Update character info
    if (status.character) {
        const char = status.character;
        document.getElementById('charName').textContent = char.name || 'Player';
        document.getElementById('charLevel').textContent = char.level || 1;
        document.getElementById('charHealth').textContent = `${char.health || 0}/${char.maxHealth || 100}`;
        document.getElementById('charEnergy').textContent = `${char.energy || 0}/${char.maxEnergy || 100}`;
        document.getElementById('charMoney').textContent = char.money || 0;
        
        // Update health bar
        const healthPercent = (char.health / char.maxHealth) * 100;
        document.getElementById('healthFill').style.width = `${healthPercent}%`;
        
        // Update energy bar
        const energyPercent = (char.energy / char.maxEnergy) * 100;
        document.getElementById('energyFill').style.width = `${energyPercent}%`;
    }
    
    // Update attributes dynamically
    if (status.attributes) {
        const attributeGrid = document.getElementById('attributeGrid');
        const attrs = status.attributes;
        
        // Get attribute keys
        const attrKeys = Object.keys(attrs);
        
        if (attrKeys.length === 0) {
            attributeGrid.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center; grid-column: 1 / -1;">No attributes defined</p>';
        } else {
            // Build attribute HTML dynamically
            attributeGrid.innerHTML = attrKeys.map(key => `
                <div class="attribute-item">
                    <div class="attribute-name">${key}</div>
                    <div class="attribute-value">${attrs[key]}</div>
                </div>
            `).join('');
        }
    }
    
    // Update inventory
    if (status.inventory) {
        const inventoryList = document.getElementById('inventoryList');
        const inventoryCount = document.getElementById('inventoryCount');
        
        inventoryCount.textContent = status.inventory.length;
        
        if (status.inventory.length === 0) {
            inventoryList.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center;">Empty</p>';
        } else {
            inventoryList.innerHTML = status.inventory.map(item => {
                const itemId = item.id || item.name || item;
                const itemName = item.name || item;
                const quantity = item.quantity > 1 ? ` x${item.quantity}` : '';
                
                return `
                <div class="inventory-item" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>${itemName}${quantity}</span>
                    <button onclick="useItemFromInventory('${itemId}')" 
                            style="background: #667eea; color: white; border: none; 
                                   padding: 3px 8px; border-radius: 10px; cursor: pointer; 
                                   font-size: 0.75em;">
                        使用
                    </button>
                </div>
                `;
            }).join('');
        }
    }
    
    // Update location
    if (status.location) {
        document.getElementById('charLocation').textContent = status.location;
    }
}

// Use item from inventory
async function useItemFromInventory(itemId) {
    if (!sessionId) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/game/use-item/${sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ itemId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addMessage('system', `已使用: ${data.usedItem.name}`);
            updateStatusDisplay(data.status);
        } else {
            addErrorMessage(`无法使用物品: ${data.message}`);
        }
    } catch (error) {
        console.error('Error using item:', error);
        addErrorMessage(`使用物品失败: ${error.message}`);
    }
}

// Make function available globally
window.useItemFromInventory = useItemFromInventory;

// Focus input on load
playerInput.focus();

