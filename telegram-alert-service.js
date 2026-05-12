// ==================== TELEGRAM ALERT SERVICE ====================
// Node.js backend service that listens to Firebase and sends Telegram alerts
// Processes alert triggers from the dashboard and sends them to Telegram Bot
// 
// Setup:
// 1. Install dependencies: npm install firebase-admin axios
// 2. Place Firebase service account key in: ./firebase-service-account.json
// 3. Run: node telegram-alert-service.js

// ==================== DEPENDENCIES ====================
const admin = require('firebase-admin');
const axios = require('axios');

// ==================== FIREBASE INITIALIZATION ====================
console.log("=== TELEGRAM ALERT SERVICE STARTING ===");
console.log("Loading Firebase service account...");

let serviceAccount;
try {
    serviceAccount = require('./firebase-service-account.json');
    console.log("✓ Service account loaded");
} catch (error) {
    console.error("✗ ERROR: firebase-service-account.json not found!");
    console.error("Place your Firebase service account key in the root directory.");
    process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://your.firebasedatabase.app"
});

const db = admin.database();
console.log("✓ Firebase Admin initialized");

// ==================== CONFIGURATION ====================
const config = {
    alertCooldown: 10 * 60 * 1000, // 10 minutes between same alert type
    maxRetries: 3,
    retryDelay: 2000,
    telegramApiTimeout: 10000,
    schedulePollInterval: 5000 // Check scheduled alerts every 5 seconds
};

//by me - commented out cooldown tracking in memory to use firebase for consistency across multiple instances
// Track alert cooldowns to prevent spam
// const alertCooldowns = {
//     AQI: 0,
//     GAS: 0
// };

// ==================== LOAD TELEGRAM CONFIG ====================
let telegramConfigCache = null;

async function loadTelegramConfig() {
    try {
        const snapshot = await db.ref('telegram').once('value');
        
        if (!snapshot.exists()) {
            console.warn("⚠ No Telegram config found in Firebase at /telegram");
            console.warn("Set up bot_token and chat_id in Firebase first.");
            return null;
        }
        
        const config = snapshot.val();
        
        if (!config.bot_token || !config.chat_id) {
            console.warn("⚠ Telegram config incomplete. Missing bot_token or chat_id");
            return null;
        }
        
        console.log("✓ Telegram config loaded");
        telegramConfigCache = config;
        return config;
    } catch (error) {
        console.error("✗ Error loading Telegram config:", error.message);
        return null;
    }
}

// ==================== LATEST READING CACHE ====================
let latestReading = null;
let scheduleLoopRunning = false;

function updateLatestReading(reading) {
    if (!reading || typeof reading.timestamp !== 'number') {
        return;
    }

    if (!latestReading || reading.timestamp > latestReading.timestamp) {
        latestReading = reading;
    }
}

async function getLatestReading(forceRefresh = false) {
    if (latestReading && !forceRefresh) {
        return latestReading;
    }

    const snapshot = await db.ref('environment_data').orderByChild('timestamp').limitToLast(1).once('value');
    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.val();
    const reading = Object.values(data)[0] || null;
    updateLatestReading(reading);
    return reading;
}

async function loadThresholds() {
    const snapshot = await db.ref('thresholds').once('value');
    const data = snapshot.val() || {};

    return {
        aqi: typeof data.aqi_limit === 'number' ? data.aqi_limit : 300,
        gas: typeof data.gas_limit === 'number' ? data.gas_limit : 2500
    };
}

function getReadingValueForType(alertType, reading) {
    if (!reading) {
        return null;
    }

    if (alertType === 'AQI') {
        return typeof reading.aqi === 'number' ? reading.aqi : null;
    }

    if (alertType === 'GAS') {
        return typeof reading.mq9_gas === 'number' ? reading.mq9_gas : null;
    }

    return null;
}

function getThresholdForType(alertType, thresholds, fallback) {
    if (alertType === 'AQI') {
        return typeof thresholds.aqi === 'number' ? thresholds.aqi : fallback;
    }

    if (alertType === 'GAS') {
        return typeof thresholds.gas === 'number' ? thresholds.gas : fallback;
    }

    return fallback;
}

// ==================== FORMAT TELEGRAM MESSAGE ====================
function formatTelegramMessage(alert) {
    // Format timestamp safely - handle both numeric and string timestamps
    let timestamp = 'Unknown Time';
    
    try {
        // If created_at is a number (milliseconds), use it directly
        const timestampValue = typeof alert.created_at === 'number' 
            ? alert.created_at 
            : parseInt(alert.created_at);
        
        if (!isNaN(timestampValue)) {
            const date = new Date(timestampValue);
            // Verify date is valid
            if (date instanceof Date && !isNaN(date)) {
                timestamp = date.toLocaleString();
            }
        }
    } catch (error) {
        console.warn('Failed to format timestamp:', error.message);
        timestamp = new Date().toLocaleString();
    }
    
    if (alert.type === 'AQI') {
        return [
            '<b>⚠️ AIR QUALITY ALERT</b>',
            '',
            `<b>AQI:</b> <code>${Math.round(alert.current_value)}</code>`,
            `<b>Threshold:</b> <code>${alert.threshold}</code>`,
            `<b>Status:</b> Exceeded by ${Math.round(alert.current_value - alert.threshold)} points`,
            '',
            `<b>Time:</b> <code>${timestamp}</code>`,
            '⏱️ <i>Next alert in: 10 minutes</i>'
        ].join('\n');
    } else if (alert.type === 'GAS') {
        return [
            '<b>⚠️ GAS ALERT</b>',
            '',
            `<b>Gas Level:</b> <code>${Math.round(alert.current_value)} ppm</code>`,
            `<b>Threshold:</b> <code>${alert.threshold} ppm</code>`,
            `<b>Excess:</b> ${Math.round(alert.current_value - alert.threshold)} ppm`,
            '',
            `<b>Time:</b> <code>${timestamp}</code>`,
            '⏱️ <i>Next alert in: 10 minutes</i>'
        ].join('\n');
    }
    
    return `Alert: ${alert.type} threshold exceeded at ${timestamp}`;
}

// ==================== SEND TELEGRAM MESSAGE ====================
async function sendTelegramMessage(botToken, chatId, message, retryCount = 0) {
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        
        const response = await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        }, {
            timeout: config.telegramApiTimeout
        });
        
        if (response.data.ok) {
            console.log(`✓ Message sent to Telegram (ID: ${response.data.result.message_id})`);
            return true;
        } else {
            console.error(`✗ Telegram API error: ${response.data.description}`);
            return false;
        }
    } catch (error) {
        console.error(`✗ Error sending message (attempt ${retryCount + 1}/${config.maxRetries}):`, error.message);
        
        // Retry logic for transient failures
        if (retryCount < config.maxRetries - 1 && error.code !== 'ENOTFOUND') {
            console.log(`⏱ Retrying in ${config.retryDelay}ms...`);
            await sleep(config.retryDelay);
            return sendTelegramMessage(botToken, chatId, message, retryCount + 1);
        }
        
        return false;
    }
}

// ==================== SCHEDULED ALERTS ====================
async function getScheduleState(alertType) {
    const snapshot = await db.ref(`telegram/alerts/schedule/${alertType}`).once('value');
    return snapshot.val() || {};
}

async function updateScheduleState(alertType, updates) {
    await db.ref(`telegram/alerts/schedule/${alertType}`).update({
        ...updates,
        updated_at: Date.now()
    });
}

async function clearScheduleState(alertType, reason) {
    await updateScheduleState(alertType, {
        active: false,
        cleared_at: Date.now(),
        cleared_reason: reason
    });
}

async function sendScheduledAlert(alertType, currentValue, threshold, telegramConfig) {
    const message = formatTelegramMessage({
        type: alertType,
        current_value: currentValue,
        threshold,
        created_at: Date.now()
    });

    const sent = await sendTelegramMessage(
        telegramConfig.bot_token,
        telegramConfig.chat_id,
        message
    );

    if (sent) {
        await db.ref(`telegram/cooldowns/${alertType}`).set(Date.now());

        const historyRef = db.ref('telegram/alerts/history').push();
        await historyRef.set({
            type: alertType,
            current_value: currentValue,
            threshold,
            processed: true,
            sent_at: Date.now(),
            source: 'scheduled',
            history_id: historyRef.key
        });
    }

    return sent;
}

async function runScheduleLoop() {
    if (scheduleLoopRunning) {
        return;
    }

    scheduleLoopRunning = true;

    try {
        const alertTypes = ['AQI', 'GAS'];
        const thresholds = await loadThresholds();
        const reading = await getLatestReading(true);

        for (const alertType of alertTypes) {
            const schedule = await getScheduleState(alertType);

            if (!schedule.active || !schedule.next_send_at) {
                continue;
            }

            const now = Date.now();
            if (now < schedule.next_send_at) {
                continue;
            }

            const currentValue = getReadingValueForType(alertType, reading);
            const threshold = getThresholdForType(alertType, thresholds, schedule.threshold);

            if (currentValue === null || threshold === null) {
                continue;
            }

            if (currentValue < threshold) {
                await clearScheduleState(alertType, 'value_below_threshold');
                continue;
            }

            if (!telegramConfigCache) {
                telegramConfigCache = await loadTelegramConfig();
            }

            if (!telegramConfigCache) {
                continue;
            }

            const sent = await sendScheduledAlert(alertType, currentValue, threshold, telegramConfigCache);
            if (sent) {
                await updateScheduleState(alertType, {
                    active: true,
                    last_sent_at: now,
                    next_send_at: now + config.alertCooldown,
                    threshold
                });
            } else {
                await updateScheduleState(alertType, {
                    active: true,
                    next_send_at: now + config.retryDelay,
                    threshold
                });
            }
        }
    } catch (error) {
        console.error('✗ Schedule loop error:', error.message);
    } finally {
        scheduleLoopRunning = false;
    }
}

function startLatestReadingListener() {
    const envRef = db.ref('environment_data');
    envRef.on('child_added', (snapshot) => {
        updateLatestReading(snapshot.val());
    });
}

// ==================== PROCESS ALERT ====================
async function processAlert(alertId, alert, telegramConfig) {
    try {
        const alertType = alert.type;
        const now = Date.now();
        const thresholds = await loadThresholds();
        const reading = await getLatestReading();
        const currentValue = getReadingValueForType(alertType, reading);
        const threshold = getThresholdForType(alertType, thresholds, alert.threshold);
        const valueToCheck = currentValue !== null ? currentValue : alert.current_value;

        if (valueToCheck === null || threshold === null) {
            await db.ref(`telegram/alerts/triggers/${alertId}`).update({
                processed: true,
                skipped_reason: 'missing_data',
                updated_at: Date.now()
            });
            return;
        }

        if (valueToCheck < threshold) {
            await clearScheduleState(alertType, 'value_below_threshold');
            await db.ref(`telegram/alerts/triggers/${alertId}`).update({
                processed: true,
                skipped_reason: 'below_threshold',
                updated_at: Date.now()
            });
            return;
        }

        const schedule = await getScheduleState(alertType);
        if (schedule.next_send_at && now < schedule.next_send_at) {
            const remaining = Math.ceil((schedule.next_send_at - now) / 1000);
            console.log(`Cooldown active for ${alertType}. ${remaining}s remaining`);
            await updateScheduleState(alertType, {
                active: true,
                threshold,
                next_send_at: schedule.next_send_at
            });
            await db.ref(`telegram/alerts/triggers/${alertId}`).update({
                processed: true,
                skipped_reason: 'cooldown',
                updated_at: Date.now()
            });
            return;
        }

        console.log(`\n🔔 Processing ${alertType} alert (ID: ${alertId})`);
        console.log(`   Value: ${alert.current_value}, Threshold: ${alert.threshold}`);
        
        // Format and send message
        const message = formatTelegramMessage({
            ...alert,
            current_value: valueToCheck,
            threshold,
            created_at: Date.now()
        });
        const sent = await sendTelegramMessage(
            telegramConfig.bot_token,
            telegramConfig.chat_id,
            message
        );
        
        // Update Firebase with result
        const updateData = {
            processed: true,
            updated_at: Date.now(),
            backend_sent: sent
        };
        
        if (sent) {
            updateData.sent_at = Date.now();
            updateData.status = 'sent';
            
            // Update cooldown schedule for repeated alerts while value stays high
            await db.ref(`telegram/cooldowns/${alertType}`).set(now);
            await updateScheduleState(alertType, {
                active: true,
                last_sent_at: now,
                next_send_at: now + config.alertCooldown,
                threshold
            });
            
            // Move to history
            const historyRef = db.ref('telegram/alerts/history').push();
            await historyRef.set({
                ...alert,
                current_value: valueToCheck,
                threshold,
                processed: true,
                sent_at: Date.now(),
                history_id: historyRef.key
            });
            
            console.log(`✓ Alert moved to history`);
        } else {
            updateData.status = 'failed';
            updateData.backend_error = 'Failed to send message';
            await updateScheduleState(alertType, {
                active: true,
                next_send_at: now + config.retryDelay,
                threshold
            });
        }
        
        // Update trigger record
        await db.ref(`telegram/alerts/triggers/${alertId}`).update(updateData);
        console.log(`✓ Trigger record updated`);
        
    } catch (error) {
        console.error(`✗ Error processing alert ${alertId}:`, error.message);
        
        // Mark as processed with error
        try {
            await db.ref(`telegram/alerts/triggers/${alertId}`).update({
                processed: true,
                backend_error: error.message,
                updated_at: Date.now()
            });
        } catch (updateError) {
            console.error(`✗ Failed to update alert error status:`, updateError.message);
        }
    }
}

// ==================== SETUP ALERT LISTENER ====================
//by me
const serviceStartTime = Date.now();

async function setupAlertListener() {
    console.log("\nSetting up Firebase alert listener...");
    startLatestReadingListener();
    setInterval(runScheduleLoop, config.schedulePollInterval);
    
    // Load initial config
    let telegramConfig = await loadTelegramConfig();
    telegramConfigCache = telegramConfig;
    
    if (!telegramConfig) {
        console.warn("⚠ Starting without Telegram config. Will check on each alert...");
    } else {
        console.log(`✓ Service started. Listening for alerts...`);
        console.log(`   Bot Token: ${telegramConfig.bot_token.substring(0, 10)}...`);
        console.log(`   Chat ID: ${telegramConfig.chat_id}`);
    }
    
    // Listen to new alerts
    const triggersRef = db.ref('telegram/alerts/triggers');
    
    triggersRef.on('child_added', async (snapshot) => {
        const alertId = snapshot.key;
        const alert = snapshot.val();

        if (alert.created_at && alert.created_at < serviceStartTime) {
            // Mark stale triggers as processed silently
            if (!alert.processed) {
                await db.ref(`telegram/alerts/triggers/${alertId}`).update({ processed: true, skipped_reason: 'stale_on_startup' });
            }
            return;
        }
        
        // Skip if already processed
        if (alert.processed) {
            return;
        }
        
        // Reload config in case it changed
        if (!telegramConfig || !telegramConfig.bot_token) {
            telegramConfig = await loadTelegramConfig();
            telegramConfigCache = telegramConfig;
        }
        
        if (!telegramConfig) {
            console.warn("⚠ Telegram config not available. Skipping alert.");
            return;
        }
        
        // Process the alert
        await processAlert(alertId, alert, telegramConfig);
    });
    
    // Also listen for config changes
    db.ref('telegram').on('value', (snapshot) => {
        if (snapshot.exists()) {
            telegramConfig = snapshot.val();
            telegramConfigCache = telegramConfig;
            console.log("ℹ Telegram config updated");
        }
    });
}

// ==================== CLEANUP ====================
async function cleanup() {
    console.log("\n=== SHUTTING DOWN ===");
    db.goOffline();
    console.log("✓ Firebase connection closed");
    process.exit(0);
}

// Handle signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// ==================== UTILITIES ====================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== START SERVICE ====================
(async () => {
    try {
        await setupAlertListener();
        console.log("\n✓ Telegram Alert Service ready");
        console.log("Waiting for alerts from Firebase...\n");
    } catch (error) {
        console.error("✗ Failed to start service:", error.message);
        process.exit(1);
    }
})();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error("✗ Uncaught exception:", error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error("✗ Unhandled rejection at:", promise, "reason:", reason);
});
