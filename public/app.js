// API URL - works for both local development and Vercel deployment
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'  // Local development
  : '/api';  // Production (Vercel) - uses relative path

let selectedFile = null;
let currentFileId = null;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const uploadBtn = document.getElementById('uploadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressStatus = document.getElementById('progressStatus');
const logContainer = document.getElementById('logContainer');
const resultContainer = document.getElementById('resultContainer');
const gameSettings = document.getElementById('gameSettings');
const uploadSection = document.getElementById('uploadSection');
const selectSection = document.getElementById('selectSection');
const pdfList = document.getElementById('pdfList');
const uploadTab = document.getElementById('uploadTab');
const selectTab = document.getElementById('selectTab');

// Event Listeners
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
uploadBtn.addEventListener('click', uploadAndProcess);

// Initialize
loadPDFDataFiles();

// Drag and drop handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        fileInput.files = files;
        handleFileSelect({ target: fileInput });
    } else {
        alert('Please drop a PDF file');
    }
});

function handleFileSelect(e) {
    const file = e.target.files[0];
    
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
    }
    
    selectedFile = file;
    displayFileInfo(file);
    uploadBtn.style.display = 'block';
}

function displayFileInfo(file) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    fileInfo.style.display = 'block';
    fileInfo.innerHTML = `
        <p><strong>File:</strong> ${file.name}</p>
        <p><strong>Size:</strong> ${sizeInMB} MB</p>
        <p><strong>Type:</strong> ${file.type}</p>
    `;
}

async function uploadAndProcess() {
    if (!selectedFile) return;
    
    uploadBtn.disabled = true;
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    logContainer.innerHTML = '';
    
    try {
        // Step 1: Upload file
        addLog('Uploading file...', 'info');
        const uploadResult = await uploadFile(selectedFile);
        currentFileId = uploadResult.fileId;
        addLog(`File uploaded successfully! ID: ${currentFileId}`, 'success');
        
        // Step 2: Process with SSE
        addLog('Starting PDF processing with SSE...', 'info');
        await processWithSSE(currentFileId);
        
    } catch (error) {
        console.error('Error:', error);
        addLog(`Error: ${error.message}`, 'error');
        uploadBtn.disabled = false;
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('pdf', file);
    
    const response = await fetch(`${API_BASE_URL}/pdf/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        throw new Error('Upload failed');
    }
    
    return await response.json();
}

function processWithSSE(fileId) {
    return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${API_BASE_URL}/pdf/process/${fileId}`);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    addLog(`Error: ${data.error}`, 'error');
                    eventSource.close();
                    reject(new Error(data.error));
                    return;
                }
                
                // Update progress
                if (data.progress !== undefined) {
                    updateProgress(data.progress, data.message);
                }
                
                if (data.stage) {
                    addLog(`[${data.stage.toUpperCase()}] ${data.message}`, 'info');
                }
                
                // Handle completion
                if (data.stage === 'complete' && data.data) {
                    displayResults(data.data);
                }
                
            } catch (error) {
                console.error('Error parsing SSE data:', error);
            }
        };
        
        eventSource.addEventListener('complete', (event) => {
            try {
                const data = JSON.parse(event.data);
                addLog('Processing completed successfully!', 'success');
                eventSource.close();
                resolve(data);
            } catch (error) {
                console.error('Error parsing completion data:', error);
                eventSource.close();
                reject(error);
            }
        });
        
        eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            addLog('Connection error occurred', 'error');
            eventSource.close();
            uploadBtn.disabled = false;
            reject(error);
        };
    });
}

function updateProgress(progress, message) {
    const roundedProgress = Math.round(progress);
    progressFill.style.width = `${roundedProgress}%`;
    progressFill.textContent = `${roundedProgress}%`;
    progressStatus.textContent = message || `Processing... ${roundedProgress}%`;
}

function addLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function displayResults(data) {
    resultContainer.style.display = 'block';
    uploadBtn.disabled = false;
    
    const { pdfData, gameSettings: settings, fileId: dataFileId } = data;
    const displayFileId = dataFileId || currentFileId;
    
    let html = '<h3>📄 PDF Information</h3>';
    html += `<p><strong>Pages:</strong> ${pdfData.numPages}</p>`;
    html += `<p><strong>Text Length:</strong> ${pdfData.textLength} characters</p>`;
    
    if (settings) {
        html += '<h3>🎮 Game Settings</h3>';
        html += `<p><strong>Title:</strong> ${settings.title}</p>`;
        html += `<p><strong>Description:</strong> ${settings.description}</p>`;
        
        if (settings.characters && settings.characters.length > 0) {
            html += '<h3>👥 Characters</h3>';
            html += '<ul>';
            settings.characters.forEach(char => {
                html += `<li><strong>${char.name}:</strong> ${char.description}</li>`;
            });
            html += '</ul>';
        }
        
        if (settings.locations && settings.locations.length > 0) {
            html += '<h3>📍 Locations</h3>';
            html += '<ul>';
            settings.locations.forEach(loc => {
                html += `<li><strong>${loc.name}:</strong> ${loc.description}</li>`;
            });
            html += '</ul>';
        }
        
        if (settings.items && settings.items.length > 0) {
            html += '<h3>🎒 Items</h3>';
            html += '<ul>';
            settings.items.forEach(item => {
                html += `<li><strong>${item.name}:</strong> ${item.description}</li>`;
            });
            html += '</ul>';
        }
    }
    
    // Add Start Game button
    if (displayFileId) {
        html += `<div style="margin-top: 20px; text-align: center;">
            <button onclick="startGameWithFile('${displayFileId}')" 
                    style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                           color: white; border: none; padding: 15px 40px; 
                           border-radius: 25px; cursor: pointer; font-size: 1.1em;
                           font-weight: 600; transition: transform 0.2s;">
                🎮 使用Claude开始游戏
            </button>
        </div>`;
    }
    
    gameSettings.innerHTML = html;
}

function startGameWithFile(fileId) {
    window.location.href = `game.html?fileId=${fileId}`;
}

// Tab switching
function switchTab(tab) {
    if (tab === 'upload') {
        uploadSection.style.display = 'block';
        selectSection.style.display = 'none';
        uploadTab.classList.add('active');
        selectTab.classList.remove('active');
    } else {
        uploadSection.style.display = 'none';
        selectSection.style.display = 'block';
        uploadTab.classList.remove('active');
        selectTab.classList.add('active');
        loadPDFDataFiles();
    }
    
    // Reset states
    progressContainer.style.display = 'none';
    resultContainer.style.display = 'none';
}

// Load PDF files from pdf_data directory
async function loadPDFDataFiles() {
    try {
        pdfList.innerHTML = '<p style="text-align: center; color: #999;">Loading PDF files...</p>';
        
        const response = await fetch(`${API_BASE_URL}/pdf/data/list`);
        const data = await response.json();
        
        if (!data.files || data.files.length === 0) {
            pdfList.innerHTML = '<p style="text-align: center; color: #999;">No PDF files found in pdf_data directory</p>';
            return;
        }
        
        pdfList.innerHTML = '';
        data.files.forEach(file => {
            const item = createPDFListItem(file);
            pdfList.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading PDF files:', error);
        pdfList.innerHTML = '<p style="text-align: center; color: #dc3545;">Error loading files</p>';
    }
}

// Create PDF list item element
function createPDFListItem(file) {
    const item = document.createElement('div');
    item.className = 'pdf-item';
    
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const modifiedDate = new Date(file.modified).toLocaleDateString();
    
    item.innerHTML = `
        <div class="pdf-item-info">
            <div class="pdf-item-name">📄 ${file.filename}</div>
            <div class="pdf-item-meta">${sizeInMB} MB • Modified: ${modifiedDate}</div>
        </div>
        <button class="pdf-item-process" onclick="processPDFDataFile('${encodeURIComponent(file.filename)}')">
            Process
        </button>
    `;
    
    return item;
}

// Process PDF from pdf_data directory
async function processPDFDataFile(filename) {
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    logContainer.innerHTML = '';
    
    try {
        addLog(`Processing ${decodeURIComponent(filename)}...`, 'info');
        await processDataFileWithSSE(filename);
    } catch (error) {
        console.error('Error:', error);
        addLog(`Error: ${error.message}`, 'error');
    }
}

// Process pdf_data file with SSE
function processDataFileWithSSE(filename) {
    return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${API_BASE_URL}/pdf/data/process/${filename}`);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    addLog(`Error: ${data.error}`, 'error');
                    eventSource.close();
                    reject(new Error(data.error));
                    return;
                }
                
                // Update progress
                if (data.progress !== undefined) {
                    updateProgress(data.progress, data.message);
                }
                
                if (data.stage) {
                    addLog(`[${data.stage.toUpperCase()}] ${data.message}`, 'info');
                }
                
                // Store fileId if provided
                if (data.fileId) {
                    currentFileId = data.fileId;
                }
                
                // Handle completion
                if (data.stage === 'complete' && data.data) {
                    displayResults(data.data);
                }
                
            } catch (error) {
                console.error('Error parsing SSE data:', error);
            }
        };
        
        eventSource.addEventListener('complete', (event) => {
            try {
                const data = JSON.parse(event.data);
                addLog('Processing completed successfully!', 'success');
                eventSource.close();
                resolve(data);
            } catch (error) {
                console.error('Error parsing completion data:', error);
                eventSource.close();
                reject(error);
            }
        });
        
        eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            addLog('Connection error occurred', 'error');
            eventSource.close();
            reject(error);
        };
    });
}

// Make functions available globally
window.switchTab = switchTab;
window.processPDFDataFile = processPDFDataFile;
window.startGameWithFile = startGameWithFile;

