# Telegram Alert System - Complete Implementation Guide

## System Architecture

```
ESP32 (Sensors)
    ↓
Firebase Realtime Database
    ↓
Web Dashboard (Detects Threshold Crossing)
    ↓
Firebase: /telegram/alerts/triggers
    ↓
Backend Service (Node.js)
    ↓
Telegram Bot API
    ↓
User Phone
```

---

## PART 1: Firebase Structure

The system uses the following Firebase Realtime Database structure:

```
firebase/
├── environment_data/
│   ├── reading_1/
│   │   ├── temperature: number
│   │   ├── humidity: number
│   │   ├── aqi: number
│   │   ├── mq9_gas: number
│   │   └── timestamp: number
│   └── reading_2/ ...
├── thresholds/
│   ├── aqi_limit: number (e.g., 300)
│   └── gas_limit: number (e.g., 2500)
├── telegram/
│   ├── bot_token: "YOUR_BOT_TOKEN"
│   ├── chat_id: "YOUR_CHAT_ID"
│   ├── alerts/
│   │   ├── triggers/
│   │   │   ├── 1704067200000/
│   │   │   │   ├── type: "AQI" or "GAS"
│   │   │   │   ├── current_value: number
│   │   │   │   ├── threshold: number
│   │   │   │   ├── processed: false
│   │   │   │   ├── created_at: number
│   │   │   │   └── backend_sent: boolean (after processing)
│   │   │   └── ...
│   │   └── history/
│   │       ├── 1704067200000/
│   │       │   ├── type: "AQI" or "GAS"
│   │       │   ├── current_value: number
│   │       │   ├── threshold: number
│   │       │   ├── sent_at: number
│   │       │   ├── processed: true
│   │       │   └── created_at: number
│   │       └── ...
```

---

## PART 2: Setup Steps

### Step 2.1: Create Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Send `/start`** to BotFather
3. **Send `/newbot`** and follow the prompts
4. **Copy the Bot Token** (format: `123456789:ABCDefGHIJKlmnoPQRstUvwxyz1234567890`)
5. **Save this token** - you'll need it in Step 2.4

### Step 2.2: Get Your Telegram Chat ID

1. **Create a group or use existing chat** where you want alerts
2. **Add your bot to the group** by username (from BotFather)
3. **Send any message in the group**
4. **In Dashboard**, go to Telegram Configuration section
5. **Paste your Bot Token** in the "Bot Token" field
6. **Click "Detect Chat ID"** - it will automatically find your chat ID
7. **Click "Save Chat ID"**
8. **Click "Send Test Message"** to verify it works

### Step 2.3: Firebase Configuration (Web Dashboard)

The dashboard automatically initializes Firebase when it loads. The following scripts handle Firebase:

- **index.html**: Inline module script that imports Firebase SDK
- **firebase-config.js**: Firebase configuration (already set up)
- **dashboard.js**: Uses Firebase globals to read/write data

**No additional Firebase setup needed** - your existing setup is used.

### Step 2.4: Backend Node.js Service Setup

1. **Ensure you have Node.js installed**:
   ```bash
   node --version  # Should be v14 or higher
   ```

2. **Navigate to project directory**:
   ```bash
   cd d:\EMS\es
   ```

3. **Install dependencies**:
   ```bash
   npm install firebase-admin axios
   ```

   This installs:
   - `firebase-admin`: Firebase backend SDK
   - `axios`: HTTP client for Telegram API

4. **Get Firebase Service Account Key**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to **Project Settings** (gear icon)
   - Click **Service Accounts** tab
   - Click **Generate New Private Key**
   - Save the JSON file as `firebase-service-account.json` in `d:\EMS\es\`

   **Important**: This file contains sensitive credentials. **Never commit to GitHub!**

5. **Verify the service account file exists**:
   ```bash
   dir firebase-service-account.json
   ```

---

## PART 3: How It Works

### Dashboard (Frontend):

1. **Listens to sensor data** from Firebase `/environment_data`
2. **Receives latest readings**: AQI, Gas, Temperature, Humidity
3. **On each new reading**, calls `checkAndTriggerAlerts()` function
4. **Detects threshold crossing** using edge detection:
   - AQI: `previous < threshold` AND `current >= threshold`
   - Gas: `previous < threshold` AND `current >= threshold`
5. **Prevents spam** with 10-minute cooldown per alert type
6. **Writes alert trigger** to Firebase at `/telegram/alerts/triggers/{timestamp}`

### Backend Service (Node.js):

1. **Listens to** Firebase `/telegram/alerts/triggers` in real-time
2. **On new alert**, checks if cooldown period has passed
3. **Formats message** based on alert type:
   - **AQI Alert**: Shows value, threshold, time, and excess amount
   - **Gas Alert**: Shows ppm, threshold, and excess ppm
4. **Sends message** to Telegram via Bot API
5. **Updates Firebase** when message is sent:
   - Sets `processed: true`
   - Sets `backend_sent: true`
   - Sets `sent_at: timestamp`
   - Moves to history for archival
6. **Handles failures** with retry logic (3 attempts with 2-second delays)
7. **Prevents duplicate alerts** with cooldown tracking

---

## PART 4: Running the System

### Option 1: Run in Command Prompt (stays on while monitoring)

```bash
cd d:\EMS\es
node telegram-alert-service.js
```

**Expected output**:
```
=== TELEGRAM ALERT SERVICE STARTING ===
Loading Firebase service account...
✓ Service account loaded
✓ Firebase Admin initialized
Setting up Firebase alert listener...
✓ Telegram config loaded
   Bot Token: 123456789:...
   Chat ID: -1001234567890
✓ Service started. Listening for alerts...
Waiting for alerts from Firebase...
```

### Option 2: Run in Background (Windows)

**Create a batch file** `START_TELEGRAM_SERVICE.bat` in `d:\EMS\es\`:

```batch
@echo off
title Telegram Alert Service
echo Starting Telegram Alert Service...
cd /d d:\EMS\es
node telegram-alert-service.js
pause
```

Then **double-click** the file.

### Option 3: Run as Windows Service (Advanced)

Install `nssm` (Non-Sucking Service Manager):

```bash
# Install globally
npm install -g nssm

# Create service
nssm install TelegramAlertService "node" "d:\EMS\es\telegram-alert-service.js"

# Start service
nssm start TelegramAlertService

# View status
nssm status TelegramAlertService

# Stop service
nssm stop TelegramAlertService
```

---

## PART 5: Testing the System

### Test 1: Verify Dashboard is Detecting Thresholds

1. **Open Dashboard** in browser (http://localhost:3000 or your server)
2. **Open DevTools** (F12 → Console tab)
3. **Lower the AQI threshold** to something low (e.g., 50)
4. **Wait for sensor data** to arrive
5. **Look in console** for:
   ```
   🚨 AQI threshold crossed: 45 → 51
   ✓ AQI alert written to Firebase
   ```

### Test 2: Verify Alert is Written to Firebase

1. **Go to Firebase Console** → Realtime Database
2. **Navigate to** `/telegram/alerts/triggers`
3. **You should see** a new entry with:
   - `type: "AQI"` or `"GAS"`
   - `current_value: <number>`
   - `threshold: <number>`
   - `processed: false`
   - `created_at: <timestamp>`

### Test 3: Verify Backend Service Processes Alert

1. **Start backend service**:
   ```bash
   node telegram-alert-service.js
   ```

2. **Watch the console output** for:
   ```
   🔔 Processing AQI alert (ID: 1704067200000)
      Value: 51, Threshold: 50
   ✓ Message sent to Telegram (ID: 12345)
   ✓ Alert moved to history
   ✓ Trigger record updated
   ```

3. **Check Firebase** `/telegram/alerts/triggers/{ID}`:
   - Should now have: `processed: true`, `backend_sent: true`, `sent_at: <timestamp>`

4. **Check your Telegram** - you should receive the alert message!

### Test 4: Send Manual Test Message

1. **Open Dashboard**
2. **Go to Telegram Configuration** section
3. **Click "Send Test Message"**
4. **Check your Telegram** - you should see the test message immediately

---

## PART 6: Debug Checklist

| Issue | Solution |
|-------|----------|
| **Service won't start** | Check `firebase-service-account.json` exists in `d:\EMS\es\` |
| **"Service account loaded" but fails after** | Verify Firebase credentials are valid and project URL matches |
| **Alerts not triggering** | Check console (F12) for edge detection logs; verify thresholds are set in Firebase |
| **Alert written to Firebase but not sent** | Ensure backend service is running; check if Telegram bot token is correct |
| **Backend gets error "bots can't send to bots"** | Send message from your personal account to bot; use "Detect Chat ID" feature |
| **Backend gets error "ENOTFOUND"** | Check internet connection and Telegram API server status |
| **Duplicate alerts** | Cooldown may not be working; check both dashboard and backend timestamp logic |
| **No alerts even when threshold exceeded** | Verify `previousAqi` is not null (needs 2 readings); check cooldown isn't active |
| **Telegram message format looks weird** | Ensure bot token and chat ID are correct; check HTML parsing mode is enabled |

---

## PART 7: Logs and Monitoring

### Dashboard Console Logs (F12 → Console)

```
✓ Firebase initialized
listenToSensorData()
✓ Charts initialized
Settings up data listeners...
Setting up Telegram listeners...
📊 Sensor data received
🚨 AQI threshold crossed
✓ AQI alert written to Firebase
```

### Backend Service Console Logs

```
✓ Firebase Admin initialized
Setting up Firebase alert listener...
✓ Telegram config loaded
🔔 Processing AQI alert
✓ Message sent to Telegram
✓ Alert moved to history
ℹ Telegram config updated
```

### Error Logs (if something fails)

**Backend Service**:
- `✗ Error loading Telegram config` → Check Firebase path
- `✗ Error sending message` → Check bot token and chat ID
- `✗ Telegram API error` → Check Telegram API status
- `⏱ Alert cooldown active` → Normal; alert skipped within cooldown period

**Dashboard**:
- `✗ Failed to write alert to Firebase` → Check Firebase permissions
- `✗ Error checking thresholds` → Check Firebase read permissions

---

## PART 8: Monitoring Commands

### Check if Backend Service is Running

```bash
# Windows
tasklist | findstr "node"

# If running, you'll see:
# node.exe                     1234                    2000 KB
```

### View Real-time Alerts in Firebase

Open Firebase Console and navigate to:
- `/telegram/alerts/triggers` - Active (unprocessed) alerts
- `/telegram/alerts/history` - Sent alerts archive

### Test Telegram Bot API Directly

```bash
# Replace with your actual bot token and chat ID
curl -X POST "https://api.telegram.org/bot123456789:TOKEN/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"YOUR_CHAT_ID","text":"Test message","parse_mode":"HTML"}'
```

---

## PART 9: Troubleshooting Workflows

### Workflow 1: Alert Not Sending to Telegram

**Step 1: Check if alert is being written to Firebase**
```
Dashboard Console (F12):
  Look for: "✓ AQI alert written to Firebase"
  If NOT present: Threshold not crossed yet, or cooldown active
```

**Step 2: Check if backend is processing**
```
Backend Console:
  Look for: "🔔 Processing AQI alert"
  If NOT present: Backend not running or not listening
```

**Step 3: Check Telegram configuration**
```
Firebase Console → /telegram:
  bot_token: Should be 10+ characters
  chat_id: Should be a number
```

**Step 4: Test Telegram directly**
```
Dashboard → Telegram Configuration → Send Test Message
  If fails: Bot token or chat ID is wrong
```

### Workflow 2: Backend Service Crashes

**Check error message**:
```bash
# If you see:
"Cannot find module 'firebase-admin'"
  → Run: npm install firebase-admin axios

# If you see:
"firebase-service-account.json not found"
  → Get service account key from Firebase console
  → Save as: d:\EMS\es\firebase-service-account.json

# If you see:
"ENOTFOUND api.telegram.org"
  → Check internet connection
  → Verify Telegram servers are accessible
```

**Restart the service**:
```bash
# Press Ctrl+C to stop
# Then restart with:
node telegram-alert-service.js
```

### Workflow 3: Too Many or Too Few Alerts

**Too many alerts**:
```
Reduce alertCooldown in:
  Dashboard (dashboard.js): alertState.alertCooldown
  Backend (telegram-alert-service.js): config.alertCooldown
```

**Too few alerts**:
```
Check:
  1. Edge detection logic (previous < threshold AND current >= threshold)
  2. Cooldown period (default 10 minutes)
  3. Sensor data is actually updating
```

---

## PART 10: Quick Reference Commands

```bash
# Install dependencies
npm install firebase-admin axios

# Run backend service
node telegram-alert-service.js

# Stop backend service
Ctrl+C (in terminal)

# Check Node.js version
node --version

# Check npm version
npm --version

# View Firebase data
# Open: https://console.firebase.google.com/project/ems-iot-system/database

# View backend logs
# Check console output from "node telegram-alert-service.js" command
```

---

## PART 11: Security Notes

⚠️ **Important Security Considerations**:

1. **Firebase Service Account Key**
   - Contains sensitive credentials
   - **NEVER** commit to GitHub
   - **NEVER** share with anyone
   - Store securely on your server

2. **Telegram Bot Token**
   - Anyone with this token can send messages as your bot
   - **NEVER** share publicly
   - If compromised, regenerate via BotFather

3. **Firebase Rules**
   - Current setup allows anyone to read/write
   - Consider adding authentication rules in production
   - Especially for `/telegram` configuration

4. **Backend Service**
   - Should run on a secure server
   - Restrict network access if possible
   - Monitor for unusual activity

---

## PART 12: Next Steps

✅ **You now have**:
- Automatic threshold crossing detection
- Alert writing to Firebase
- Backend service that sends to Telegram
- 10-minute cooldown to prevent spam
- Retry logic for failed messages
- Alert history tracking

🔄 **Future enhancements** (optional):
- Multiple alert recipients
- Severity levels (warning vs. critical)
- Scheduled alert summaries
- Email notifications
- Dashboard notifications (in-browser)

---

**Need help?** Check the debug checklist or review console logs (F12 in dashboard, terminal for backend).
