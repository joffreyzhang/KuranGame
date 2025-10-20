// API URL - works for both local development and Vercel deployment
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'  // Local development
    : '/api';  // Production (Vercel) - uses relative path

let sessionId = null;
let fileId = null;
let isProcessing = false;

// SSE related variables
let eventSource = null;
let isSSEConnected = false;
let currentStreamingMessage = null;

// Debug variables
let debugInfo = {
    totalChunks: 0,
    receivedChunks: 0,
    startTime: null,
    endTime: null,
    fullText: ''
};

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

            // Establish SSE connection immediately after session creation
            connectSSE();

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

        // Clean backend markers from game messages
        let cleanedText = text;
        if (type === 'game') {
            cleanedText = cleanResponseText(text);
        }

        // 对游戏消息使用Markdown渲染（如果marked库可用）
        if (type === 'game' && typeof marked !== 'undefined') {
            const markdownHtml = marked.parse(cleanedText);
            bubble.innerHTML = markdownHtml;
        } else {
            bubble.textContent = cleanedText;
        }

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
        // Send to true streaming SSE endpoint
        const response = await fetch(`${API_BASE_URL}/game/stream/${sessionId}/action/true`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to send action');
        }

        // Note: No longer processing data.response here, as response will come through SSE events

    } catch (error) {
        console.error('Error sending action:', error);
        removeLoadingIndicator();
        addErrorMessage(`Error: ${error.message}`);
        enableInput();
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
            inventoryList.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center;">空的</p>';
        } else {
            inventoryList.innerHTML = status.inventory.map(item => {
                const itemId = item.id || item.name || item;
                const itemName = item.name || item;
                const quantity = item.quantity > 1 ? ` x${item.quantity}` : '';

                return `
                <div class="inventory-item" style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="flex: 1; min-width: 0; margin-right: 8px;">${itemName}${quantity}</span>
                    <button onclick="useItemAndCloseSidebar('${itemId}')" 
                        style="background: #667eea; color: white; border: none; 
                        padding: 3px 8px; border-radius: 10px; cursor: pointer; 
                        font-size: 0.75em; width: 50px; flex-shrink: 0;">
                        使用
                    </button>
                </div>
            `;
            }).join('');
        }
    }

    // Use item and close sidebar (only if sidebar is open on mobile)
    async function useItemAndCloseSidebar(itemId) {
        const sidebar = document.getElementById('statusPanel');

        // 只有在移动端且侧边栏处于打开状态时才关闭
        if (sidebar.classList.contains('active')) {
            const overlay = document.getElementById('overlay');
            const menuToggle = document.getElementById('menuToggle');

            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            menuToggle.textContent = '☰';
        }

        // 然后使用物品
        await useItemFromInventory(itemId);
    }

    // Make function available globally
    window.useItemAndCloseSidebar = useItemAndCloseSidebar;

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

// ========== SSE Functions ==========

/**
 * Connect to SSE stream for real-time game updates
 */
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    console.log('🔗 Connecting to SSE stream...');
    eventSource = new EventSource(`${API_BASE_URL}/game/stream/${sessionId}`);

    eventSource.onopen = () => {
        isSSEConnected = true;
        updateConnectionStatus(true);
        console.log('✅ SSE connected');
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleSSEEvent(data);
        } catch (error) {
            console.error('Error parsing SSE data:', error);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        isSSEConnected = false;
        updateConnectionStatus(false);
    };
}

/**
 * Update connection status display
 */
function updateConnectionStatus(connected) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    if (statusIndicator && statusText) {
        if (connected) {
            statusIndicator.textContent = '🟢';
            statusText.textContent = 'Connected';
        } else {
            statusIndicator.textContent = '🔴';
            statusText.textContent = 'Disconnected';
        }
    }
}

/**
 * Handle SSE events from the server
 */
function handleSSEEvent(data) {
    // Only log important events, not every chunk
    if (data.type !== 'response_chunk') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] SSE Event:`, data.type, data);
    }

    // Collect debug info silently (no console output)
    if (data.type === 'response_chunk') {
        debugInfo.receivedChunks++;
        debugInfo.fullText += data.chunk;

        if (data.index === 0) {
            debugInfo.startTime = new Date();
            debugInfo.totalChunks = data.total;
        }
    }

    switch (data.type) {
        case 'connected':
            updateConnectionStatus(true);
            break;

        case 'action_received':
            // Action received, can show processing status
            console.log('Action received:', data.action);
            break;

        case 'processing':
            // Start streaming display and remove loading indicator
            resetDebugInfo();
            removeLoadingIndicator();
            startStreamingMessage();
            break;

        case 'response_chunk':
            // Stream text chunks (replaces addMessage('game', data.response))
            appendStreamingText(data.chunk);
            break;

        case 'state_update':
            // Update game state (replaces updateStatusDisplay)
            if (data.characterStatus) {
                updateStatusDisplay(data.characterStatus);
            }
            break;

        case 'action_options':
            // Display action options (replaces renderActionButtons)
            if (Array.isArray(data.options) && data.options.length > 0) {
                console.log('🎯 Rendering action buttons:', data.options);
                renderActionButtons(data.options);
            }
            break;

        case 'complete':
            // Complete processing (replaces finally block)
            debugInfo.endTime = new Date();
            const duration = debugInfo.endTime - debugInfo.startTime;

            console.log('🎉 Streaming Complete!', {
                totalChunks: debugInfo.totalChunks,
                receivedChunks: debugInfo.receivedChunks,
                duration: `${duration}ms`,
                fullTextLength: debugInfo.fullText.length,
                fullText: debugInfo.fullText,
                hasNewlines: debugInfo.fullText.includes('\n'),
                newlineCount: (debugInfo.fullText.match(/\n/g) || []).length
            });

            finalizeStreamingMessage();
            enableInput();

            // Hide start button after game starts
            if (startGameBtn) {
                startGameBtn.classList.add('hidden');
            }
            removeHint();
            break;

        case 'error':
            // Error handling (replaces catch block)
            addErrorMessage(data.error);
            removeLoadingIndicator();
            enableInput();
            break;

        default:
            console.warn('Unknown SSE event type:', data.type);
    }
}

/**
 * Start a new streaming message
 */
function startStreamingMessage() {
    currentStreamingMessage = document.createElement('div');
    currentStreamingMessage.className = 'message game streaming';
    currentStreamingMessage.innerHTML = `
        <div class="message-bubble">
            <span class="streaming-content"></span>
            <span class="typing-cursor">|</span>
        </div>
    `;

    // 添加属性来存储累积的原始文本
    currentStreamingMessage.rawText = '';

    chatArea.appendChild(currentStreamingMessage);
    chatArea.scrollTop = chatArea.scrollHeight;
}

/**
 * Append text chunk to streaming message
 */
function appendStreamingText(chunk) {
    if (currentStreamingMessage) {
        const content = currentStreamingMessage.querySelector('.streaming-content');

        // 累积原始文本
        currentStreamingMessage.rawText += chunk;

        // 温和的文本清理：只移除回车符，保留Markdown结构所需的换行符
        let processedText = currentStreamingMessage.rawText
            .replace(/[\r]+/g, '') // 移除回车符
            .replace(/ {2,}/g, ' '); // 将多个空格替换为单个空格

        // Clean backend markers from the text
        processedText = cleanResponseText(processedText);

        if (typeof marked !== 'undefined') {
            // 对累积的完整文本进行一次性Markdown渲染
            const markdownHtml = marked.parse(processedText);
            // 替换而不是追加内容
            content.innerHTML = markdownHtml;
        } else {
            // 降级处理：转义HTML
            const escapedText = escapeHtml(processedText);
            content.innerHTML = escapedText;
        }

        chatArea.scrollTop = chatArea.scrollHeight;
    }
}

/**
 * Finalize streaming message (remove cursor, etc.)
 */
function finalizeStreamingMessage() {
    if (currentStreamingMessage) {
        // Remove typing cursor
        const cursor = currentStreamingMessage.querySelector('.typing-cursor');
        if (cursor) cursor.remove();

        // Remove streaming class
        currentStreamingMessage.classList.remove('streaming');
        currentStreamingMessage = null;
    }
}

/**
 * Enable input after processing
 */
function enableInput() {
    isProcessing = false;
    playerInput.disabled = false;
    sendBtn.disabled = false;
}

/**
 * Clean response text by removing backend markers
 * Removes {{STATUS_UPDATE: ...}} and [ACTION: ...] markers
 */
function cleanResponseText(text) {
    if (!text) return '';

    let cleaned = text;

    // Remove STATUS_UPDATE markers like {{STATUS_UPDATE: {"character": {...}}}}
    cleaned = cleaned.replace(/\{\{STATUS_UPDATE:\s*\{[\s\S]*?\}\}\}/g, '');

    // Remove ACTION markers like [ACTION: text]
    cleaned = cleaned.replace(/\[ACTION:\s*[^\]]+\]/g, '');

    // Remove extra blank lines that may result from removing markers
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Trim leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Reset debug info for new action
 */
function resetDebugInfo() {
    debugInfo = {
        totalChunks: 0,
        receivedChunks: 0,
        startTime: null,
        endTime: null,
        fullText: ''
    };
}

// Make functions available globally
window.startGameWithButton = startGameWithButton;
window.sendAction = sendAction;
window.handleKeyPress = handleKeyPress;

// Wait for DOM and marked library to be ready
document.addEventListener('DOMContentLoaded', function () {
    // Check if marked is available
    if (typeof marked === 'undefined') {
        console.warn('Marked library not loaded, falling back to plain text rendering');
    } else {
        // 配置marked选项，禁用可能导致换行的功能
        marked.setOptions({
            breaks: false,        // 禁用单行换行符转换为<br>
            gfm: true,           // 启用GitHub风格Markdown
            pedantic: false,     // 禁用严格模式
            sanitize: false,     // 不禁用HTML（我们手动转义）
            smartLists: true,    // 启用智能列表
            smartypants: false   // 禁用智能引号
        });
    }

    // Focus input on load
    if (playerInput) {
        playerInput.focus();
    }
});


