// ==================== GLOBAL VARIABLES ====================
let tempChart, humidChart, aqiChart, gasChart;
let dataPoints = {
    temperature: [],
    humidity: [],
    aqi: [],
    gas: [],
    timestamps: []
};
const MAX_DATA_POINTS = 30; // Show last 30 readings

// ==================== ALERT TRIGGER SYSTEM ====================
// Tracks previous values for edge detection
const alertState = {
    previousAqi: null,
    previousGas: null,
    lastAqiAlertTime: 0,
    lastGasAlertTime: 0,
    alertCooldown: 10 * 60 * 1000 // 10 minutes
};

// ==================== WAIT FOR FIREBASE TO LOAD ====================
function waitForFirebase() {
    return new Promise((resolve) => {
        const checkFirebase = setInterval(() => {
            if (window.firebaseDB && window.firebaseRef) {
                clearInterval(checkFirebase);
                resolve();
            }
        }, 100);
    });
}

// ==================== INITIALIZE CHARTS ====================
function initializeCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                display: true,
                grid: {
                    display: false
                }
            },
            y: {
                beginAtZero: false,
                grid: {
                    color: '#e5e7eb'
                }
            }
        },
        animation: {
            duration: 750
        }
    };
    
    // Temperature Chart
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: commonOptions
    });
    
    // Humidity Chart
    const humidCtx = document.getElementById('humidChart').getContext('2d');
    humidChart = new Chart(humidCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Humidity (%)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: commonOptions
    });
    
    // AQI Chart
    const aqiCtx = document.getElementById('aqiChart').getContext('2d');
    aqiChart = new Chart(aqiCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'AQI',
                data: [],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: commonOptions
    });
    
    // Gas Chart
    const gasCtx = document.getElementById('gasChart').getContext('2d');
    gasChart = new Chart(gasCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Gas (ppm)',
                data: [],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: commonOptions
    });
    
    console.log("✓ Charts initialized");
}

// ==================== UPDATE CHART DATA ====================
function updateChart(chart, newData, newLabel) {
    chart.data.labels.push(newLabel);
    chart.data.datasets[0].data.push(newData);
    
    // Keep only last MAX_DATA_POINTS
    if (chart.data.labels.length > MAX_DATA_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    
    chart.update();
}

// ==================== FORMAT TIMESTAMP ====================
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// ==================== GET AQI STATUS CLASS ====================
function getAQIStatusClass(aqi) {
    if (aqi <= 50) return { class: 'status-good', text: 'Good' };
    else if (aqi <= 100) return { class: 'status-moderate', text: 'Moderate' };
    else if (aqi <= 150) return { class: 'status-unhealthy', text: 'Unhealthy for Sensitive' };
    else if (aqi <= 200) return { class: 'status-unhealthy', text: 'Unhealthy' };
    else if (aqi <= 300) return { class: 'status-hazardous', text: 'Very Unhealthy' };
    else return { class: 'status-hazardous', text: 'Hazardous' };
}

// ==================== GET GAS STATUS CLASS ====================
function getGasStatusClass(gasValue, gasLimit) {
    if (gasValue > gasLimit * 2) return { class: 'status-alert', text: 'HIGH ALERT' };
    else if (gasValue > gasLimit) return { class: 'status-warning', text: 'WARNING' };
    else return { class: 'status-normal', text: 'Normal' };
}

// ==================== LISTEN TO SENSOR DATA ====================
async function listenToSensorData() {
    await waitForFirebase();
    
    console.log("Setting up Firebase listener for sensor data...");
    const envDataRef = window.firebaseRef(window.firebaseDB, '/environment_data');

    window.firebaseOnValue(envDataRef, (snapshot) => {
        console.log("Firebase callback triggered");
        
        if (!snapshot.exists()) {
            console.log("No data exists in Firebase at /environment_data");
            return;
        }

        const data = snapshot.val();
        console.log("Firebase data received:", Object.keys(data));

        // Filter only reading nodes
        const readings = Object.entries(data)
            .filter(([key]) => key.startsWith("reading_"))
            .map(([key, value]) => ({ ...value, key }));

        console.log(`Found ${readings.length} readings`);
        
        if (readings.length === 0) {
            console.log("No readings found with 'reading_' prefix");
            return;
        }

        // Get latest reading by timestamp
        const latestReading = readings.reduce((latest, current) => {
            return (current.timestamp > latest.timestamp) ? current : latest;
        });
        
        console.log("Latest reading:", latestReading.key, latestReading);

        updateDisplay(latestReading);

        document.getElementById('connectionStatus').className = 'status connected';
        document.getElementById('connectionStatus').textContent = '✓ Connected';

    });
}

// ==================== UPDATE DISPLAY ====================
function updateDisplay(reading) {
    console.log("updateDisplay called with:", reading);

    // Prevent crash if reading is invalid
    if (!reading || reading.temperature === undefined) {
        console.log("Invalid reading received:", reading);
        return;
    }

    console.log("Updating display with valid reading");

    // Update current values
    document.getElementById('tempValue').textContent =
        Number(reading.temperature).toFixed(1);

    document.getElementById('humidValue').textContent =
        Number(reading.humidity).toFixed(1);

    document.getElementById('aqiValue').textContent =
        Math.round(reading.aqi || 0);

    document.getElementById('gasValue').textContent =
        Math.round(reading.mq9_gas || 0);

    console.log("Values updated - Temp:", reading.temperature, "Humidity:", reading.humidity);


    // AQI status
    const aqiStatus = getAQIStatusClass(reading.aqi);
    const aqiStatusEl = document.getElementById('aqiStatus');
    aqiStatusEl.className = `card-status ${aqiStatus.class}`;
    aqiStatusEl.textContent = aqiStatus.text;


    // Gas status (uses threshold from Firebase)
    window.firebaseGet(
        window.firebaseRef(window.firebaseDB, 'thresholds/gas_limit')
    ).then((snapshot) => {

        const gasLimit = snapshot.val() || 2500;

        const gasStatus = getGasStatusClass(reading.mq9_gas, gasLimit);
        const gasStatusEl = document.getElementById('gasStatus');

        gasStatusEl.className = `card-status ${gasStatus.class}`;
        gasStatusEl.textContent = gasStatus.text;
    });


    // Temperature status
    const tempStatusEl = document.getElementById('tempStatus');

    if (reading.temperature < 18) {
        tempStatusEl.className = 'card-status status-unhealthy';
        tempStatusEl.textContent = 'Too Cold';

    } else if (reading.temperature > 28) {
        tempStatusEl.className = 'card-status status-unhealthy';
        tempStatusEl.textContent = 'Too Hot';

    } else {
        tempStatusEl.className = 'card-status status-good';
        tempStatusEl.textContent = 'Comfortable';
    }


    // Humidity status
    const humidStatusEl = document.getElementById('humidStatus');

    if (reading.humidity < 30) {
        humidStatusEl.className = 'card-status status-unhealthy';
        humidStatusEl.textContent = 'Too Dry';

    } else if (reading.humidity > 70) {
        humidStatusEl.className = 'card-status status-unhealthy';
        humidStatusEl.textContent = 'Too Humid';

    } else {
        humidStatusEl.className = 'card-status status-good';
        humidStatusEl.textContent = 'Optimal';
    }


    // Update charts
    const timestamp = reading.timestamp || Date.now();
    const timeLabel = formatTime(timestamp);

    updateChart(tempChart, reading.temperature, timeLabel);
    updateChart(humidChart, reading.humidity, timeLabel);
    updateChart(aqiChart, reading.aqi, timeLabel);
    updateChart(gasChart, reading.mq9_gas, timeLabel);


    // Update last update time
    const now = new Date();
    document.getElementById('lastUpdateTime').textContent =
        now.toLocaleString();
    document.getElementById('latestReadingTime').textContent =
        new Date(timestamp).toLocaleString();
    
}

// ==================== LISTEN TO THRESHOLDS ====================
async function listenToThresholds() {
    await waitForFirebase();
    
    // Listen to AQI threshold
    const aqiThresholdRef = window.firebaseRef(window.firebaseDB, 'thresholds/aqi_limit');
    window.firebaseOnValue(aqiThresholdRef, (snapshot) => {
        if (snapshot.exists()) {
            const value = snapshot.val();
            document.getElementById('aqiThresholdInput').value = value;
            document.getElementById('aqiThresholdCurrent').textContent = value;
        }
    });
    
    // Listen to Gas threshold
    const gasThresholdRef = window.firebaseRef(window.firebaseDB, 'thresholds/gas_limit');
    window.firebaseOnValue(gasThresholdRef, (snapshot) => {
        if (snapshot.exists()) {
            const value = snapshot.val();
            document.getElementById('gasThresholdInput').value = value;
            document.getElementById('gasThresholdCurrent').textContent = value + ' ppm';
        }
    });
}

// ==================== UPDATE AQI THRESHOLD ====================
async function updateAQIThreshold() {
    await waitForFirebase();
    
    const newValue = parseInt(document.getElementById('aqiThresholdInput').value);
    
    if (newValue < 0 || newValue > 500) {
        alert('AQI threshold must be between 0 and 500');
        return;
    }
    
    const thresholdRef = window.firebaseRef(window.firebaseDB, 'thresholds/aqi_limit');
    
    window.firebaseSet(thresholdRef, newValue)
        .then(() => {
            alert(`✓ AQI threshold updated to ${newValue}`);
            console.log(`AQI threshold updated: ${newValue}`);
        })
        .catch((error) => {
            alert('✗ Failed to update AQI threshold: ' + error.message);
            console.error('Error updating AQI threshold:', error);
        });
}

// ==================== UPDATE GAS THRESHOLD ====================
async function updateGasThreshold() {
    await waitForFirebase();
    
    const newValue = parseInt(document.getElementById('gasThresholdInput').value);
    
    if (newValue < 0 || newValue > 10000) {
        alert('Gas threshold must be between 0 and 10000 ppm');
        return;
    }
    
    const thresholdRef = window.firebaseRef(window.firebaseDB, 'thresholds/gas_limit');
    
    window.firebaseSet(thresholdRef, newValue)
        .then(() => {
            alert(`✓ Gas threshold updated to ${newValue} ppm`);
            console.log(`Gas threshold updated: ${newValue}`);
        })
        .catch((error) => {
            alert('✗ Failed to update Gas threshold: ' + error.message);
            console.error('Error updating Gas threshold:', error);
        });
}

// ==================== TELEGRAM ALERT FUNCTIONS (STEP 5) ====================

// Listen to Telegram configuration
async function listenToTelegramConfig() {
    await waitForFirebase();
    
    const telegramRef = window.firebaseRef(window.firebaseDB, 'telegram');
    
    window.firebaseOnValue(telegramRef, (snapshot) => {
        if (snapshot.exists()) {
            const config = snapshot.val();
            console.log('Telegram config loaded:', config);
            
            // Load credentials if they exist
            if (config.bot_token && config.chat_id) {
                document.getElementById('botTokenInput').value = config.bot_token;
                document.getElementById('chatIdInput').value = config.chat_id;
                updateTelegramStatus(true);
            } else {
                updateTelegramStatus(false);
            }
            
            // Load alert settings
            if (config.alerts) {
                document.getElementById('aqiAlertEnable').checked = config.alerts.aqi_enabled !== false;
                document.getElementById('gasAlertEnable').checked = config.alerts.gas_enabled !== false;
            }
        }
    });
}

// Update Telegram status indicator
function updateTelegramStatus(configured) {
    const statusEl = document.getElementById('telegramStatus');
    if (configured) {
        statusEl.innerHTML = '🟢 Configured and Ready';
        statusEl.className = 'telegram-status connected';
    } else {
        statusEl.innerHTML = '🔴 Not configured';
        statusEl.className = 'telegram-status disconnected';
    }
}

// Update Bot Token
async function updateBotToken() {
    await waitForFirebase();
    
    const botToken = document.getElementById('botTokenInput').value.trim();
    
    if (!botToken) {
        alert('Please enter a bot token');
        return;
    }
    
    if (botToken.length < 10) {
        alert('Bot token appears to be invalid');
        return;
    }
    
    const tokenRef = window.firebaseRef(window.firebaseDB, 'telegram/bot_token');
    
    window.firebaseSet(tokenRef, botToken)
        .then(() => {
            alert('✓ Bot token saved successfully');
            console.log('Bot token saved');
        })
        .catch((error) => {
            alert('✗ Failed to save bot token: ' + error.message);
            console.error('Error saving bot token:', error);
        });
}

// Update Chat ID
async function updateChatId() {
    await waitForFirebase();
    
    const chatId = document.getElementById('chatIdInput').value.trim();
    
    if (!chatId) {
        alert('Please enter your chat ID');
        return;
    }
    
    const chatIdRef = window.firebaseRef(window.firebaseDB, 'telegram/chat_id');
    
    window.firebaseSet(chatIdRef, chatId)
        .then(() => {
            alert('✓ Chat ID saved successfully');
            console.log('Chat ID saved');
        })
        .catch((error) => {
            alert('✗ Failed to save chat ID: ' + error.message);
            console.error('Error saving chat ID:', error);
        });
}

// Fetch latest valid chat ID from Telegram getUpdates
async function fetchChatIdFromUpdates() {
    const botToken = document.getElementById('botTokenInput').value.trim();

    if (!botToken) {
        alert('Please enter Bot Token first');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert('✗ Failed to fetch updates: ' + (data.description || 'Unknown error'));
            return;
        }

        if (!Array.isArray(data.result) || data.result.length === 0) {
            alert('No chats found yet. Send a message to your bot first, then try again.');
            return;
        }

        // Try to find the newest user/group chat from different update shapes.
        const updates = [...data.result].reverse();
        let chosenChat = null;

        for (const update of updates) {
            const msg = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
            if (msg && msg.chat && typeof msg.chat.id !== 'undefined') {
                // Prefer non-bot sender for direct messages.
                if (!msg.from || msg.from.is_bot !== true) {
                    chosenChat = msg.chat;
                    break;
                }
            }

            if (update.callback_query && update.callback_query.message && update.callback_query.message.chat) {
                chosenChat = update.callback_query.message.chat;
                break;
            }
        }

        if (!chosenChat) {
            alert('Could not find a valid chat. Send a normal message to the bot (not from another bot), then retry.');
            return;
        }

        document.getElementById('chatIdInput').value = String(chosenChat.id);
        alert(`✓ Chat ID detected: ${chosenChat.id}`);
    } catch (error) {
        alert('✗ Error fetching chat ID: ' + error.message);
        console.error('Error fetching chat ID:', error);
    }
}

// Send test message to Telegram
async function sendTestTelegramMessage() {
    await waitForFirebase();
    
    const botToken = document.getElementById('botTokenInput').value.trim();
    const chatId = document.getElementById('chatIdInput').value.trim();
    
    if (!botToken || !chatId) {
        alert('Please configure Bot Token and Chat ID first');
        return;
    }
    
    const testMessage = `
<b>✅ TEST MESSAGE</b>

Telegram bot connection is working!
You can now receive alerts from the EMS system.

Time: ${new Date().toLocaleString()}
⏱️ Cooling Period: 10 minutes
    `.trim();
    
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: testMessage,
                parse_mode: 'HTML'
            })
        });
        
        if (response.ok) {
            alert('✓ Test message sent successfully!');
            console.log('Test message sent');
        } else {
            const error = await response.json();
            if (error.error_code === 403 && error.description && error.description.includes("bots can't send messages to bots")) {
                alert(
                    '✗ Telegram rejected this Chat ID: bots cannot send messages to bots.\n\n' +
                    'Fix:\n' +
                    '1) Open Telegram and send a normal message from your personal account to your bot\n' +
                    '2) Click "Detect Chat ID"\n' +
                    '3) Save Chat ID and test again'
                );
            } else {
                alert('✗ Failed to send test message: ' + error.description);
            }
            console.error('Telegram error:', error);
        }
    } catch (error) {
        alert('✗ Error sending test message: ' + error.message);
        console.error('Error:', error);
    }
}

// Load alert history
async function loadAlertHistory() {
    await waitForFirebase();
    
    const historyRef = window.firebaseRef(window.firebaseDB, 'telegram/alerts/history');
    
    window.firebaseOnValue(historyRef, (snapshot) => {
        const historyList = document.getElementById('alertHistoryList');
        
        if (!snapshot.exists()) {
            historyList.innerHTML = '<p class="no-alerts">No alerts yet</p>';
            return;
        }
        
        const alerts = snapshot.val();
        const alertArray = Object.entries(alerts)
            .map(([key, value]) => ({ ...value, key }))
            // Show only alerts that were actually sent by the backend
            .filter((alert) => alert.sent_at || alert.status === 'sent' || alert.backend_sent === true || alert.source === 'scheduled')
            .sort((a, b) => (b.sent_at || b.timestamp || 0) - (a.sent_at || a.timestamp || 0))
            .slice(0, 10); // Show last 10 sent alerts
        
        if (alertArray.length === 0) {
            historyList.innerHTML = '<p class="no-alerts">No alerts yet</p>';
            return;
        }
        
        historyList.innerHTML = alertArray.map(alert => `
            <div class="alert-item alert-${alert.type.toLowerCase()}">
                <div class="alert-header">
                    <span class="alert-type">⚠️ ${alert.type}</span>
                    <span class="alert-time">${formatTime(alert.sent_at || alert.timestamp || Date.now())}</span>
                </div>
                <div class="alert-details">
                    <p><strong>Value:</strong> ${alert.current_value.toFixed(1)} ${alert.type === 'GAS' ? 'ppm' : ''}</p>
                    <p><strong>Threshold:</strong> ${alert.threshold.toFixed(1)} ${alert.type === 'GAS' ? 'ppm' : ''}</p>
                    ${alert.category ? `<p><strong>Category:</strong> ${alert.category}</p>` : ''}
                    <p><strong>Status:</strong> ✓ Sent</p>
                </div>
            </div>
        `).join('');
    });
}

// Make functions global for onclick handlers
window.updateAQIThreshold = updateAQIThreshold;
window.updateGasThreshold = updateGasThreshold;
window.updateBotToken = updateBotToken;
window.updateChatId = updateChatId;
window.fetchChatIdFromUpdates = fetchChatIdFromUpdates;
window.sendTestTelegramMessage = sendTestTelegramMessage;

// ==================== INITIALIZE DASHBOARD ====================
async function initializeDashboard() {
    console.log("=== DASHBOARD INITIALIZATION STARTED ===");
    
    // Wait for Firebase to be ready
    console.log("Waiting for Firebase...");
    await waitForFirebase();
    console.log("✓ Firebase is ready!", {
        DB: !!window.firebaseDB,
        Ref: !!window.firebaseRef,
        OnValue: !!window.firebaseOnValue,
        Set: !!window.firebaseSet,
        Get: !!window.firebaseGet
    });
    
    // Initialize charts
    console.log("Initializing charts...");
    initializeCharts();
    console.log("✓ Charts initialized");
    
    // Start listening to data
    console.log("Setting up data listeners...");
    listenToSensorData();
    listenToThresholds();
    
    // ========== NEW: Setup Telegram alert listeners (STEP 5) ==========
    console.log("Setting up Telegram listeners...");
    listenToTelegramConfig();
    loadAlertHistory();
    // ==================================================================
    
    console.log("=== ✓ DASHBOARD FULLY INITIALIZED ===");
}

// Start dashboard when page loads
window.addEventListener('load', () => {
    console.log("Window loaded, starting dashboard initialization...");
    initializeDashboard();
});
