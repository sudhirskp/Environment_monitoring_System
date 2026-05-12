# Telegram Alert System - Quick Setup Checklist

## ✅ Pre-Flight Checklist

### 1. Telegram Bot Creation
- [ ] Created bot via @BotFather
- [ ] Have Bot Token: `___________________`
- [ ] Added bot to Telegram group/chat
- [ ] Have Chat ID: `___________________`
- [ ] Tested "Send Test Message" from dashboard ✓

### 2. Firebase Setup
- [ ] Confirmed thresholds are set in Firebase:
  - [ ] `/thresholds/aqi_limit`: `_____`
  - [ ] `/thresholds/gas_limit`: `_____`
- [ ] Telegram config saved to Firebase:
  - [ ] `/telegram/bot_token`: Set
  - [ ] `/telegram/chat_id`: Set

### 3. Backend Service Setup
- [ ] Node.js installed: `node --version` = `v_____`
- [ ] Dependencies installed: `npm install firebase-admin axios` ✓
- [ ] Firebase service account key downloaded from Firebase console
- [ ] Service account file placed at: `d:\EMS\es\firebase-service-account.json` ✓
- [ ] File verified: `dir firebase-service-account.json` ✓

### 4. Code Deployment
- [ ] `dashboard.js` updated with alert trigger logic ✓
- [ ] `telegram-alert-service.js` created ✓
- [ ] Dashboard is running and displaying sensor data ✓

---

## 🚀 Quick Start

### Step 1: Start Backend Service
```bash
cd d:\EMS\es
node telegram-alert-service.js
```

**Expected output**:
```
=== TELEGRAM ALERT SERVICE STARTING ===
✓ Service account loaded
✓ Firebase Admin initialized
✓ Telegram config loaded
✓ Service started. Listening for alerts...
Waiting for alerts from Firebase...
```

### Step 2: Verify Dashboard is Running
- Open dashboard in browser
- Check Console (F12) for logs
- Verify sensor data is updating

### Step 3: Trigger an Alert
- Adjust AQI or Gas threshold to a low value
- Wait for new sensor reading
- Check:
  - Dashboard console: `🚨 Threshold crossed` message
  - Backend console: `🔔 Processing alert` message
  - Telegram: Alert message received

### Step 4: Verify Firebase Updates
- Go to Firebase Console
- Check `/telegram/alerts/triggers/{ID}`:
  - Should have: `processed: true`, `backend_sent: true`
- Check `/telegram/alerts/history/{ID}`:
  - Alert should be archived here

---

## 📊 System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    ESP32 Sensors                         │
│           (DHT11, MQ135, MQ9 every ~30s)                 │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Firebase Realtime Database                   │
│     /environment_data → Latest sensor readings            │
│     /thresholds → AQI & Gas limits                        │
│     /telegram → Bot config                               │
│     /telegram/alerts/triggers → NEW ALERTS               │
│     /telegram/alerts/history → PROCESSED ALERTS          │
└─────────────────────────┬────────────────────────────────┘
                          │
            ┌─────────────┴──────────────┐
            │                            │
            ▼                            ▼
    ┌───────────────┐          ┌───────────────────┐
    │Web Dashboard  │          │Backend Service    │
    │(Frontend)     │          │(Node.js)          │
    │ • Display UI  │          │ • Listen to DB    │
    │ • Detect edge │          │ • Send Telegram   │
    │ • Write alert │          │ • Mark processed  │
    │   trigger     │          │ • Move to history │
    └───────────────┘          └─────────┬─────────┘
            │                            │
            └────────────────┬───────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │ Telegram Bot API │
                   │  (send message)  │
                   └────────┬─────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │  User's Phone   │
                    │  (Notification) │
                    └─────────────────┘
```

---

## 🔧 Configuration Files

### Frontend Files (Already Set Up)
- **`web/index.html`**: Firebase initialization
- **`web/firebase-config.js`**: Firebase credentials  
- **`web/dashboard.js`**: Alert trigger logic (✓ Updated with `checkAndTriggerAlerts`)
- **`web/dashboard.css`**: UI styling

### Backend Files (New)
- **`telegram-alert-service.js`**: Main backend service (✓ Created)
- **`firebase-service-account.json`**: Service credentials (⚠️ Download from Firebase)
- **`package.json`**: Already exists; add dependencies with `npm install`

---

## 🔍 Monitoring Logs

### Dashboard (F12 → Console)

**Start of system**:
```javascript
✓ Firebase initialized
✓ Charts initialized
Setting up data listeners...
Setting up Telegram listeners...
```

**When sensor data arrives**:
```javascript
Firebase callback triggered
Latest reading: reading_1 {...}
Updating display with valid reading
```

**When threshold is crossed** (if edge detected):
```javascript
🚨 AQI threshold crossed: 250 → 320
✓ AQI alert written to Firebase
```

### Backend (Terminal)

**Startup**:
```
=== TELEGRAM ALERT SERVICE STARTING ===
✓ Firebase Admin initialized
✓ Telegram config loaded
✓ Service started. Listening for alerts...
```

**When alert arrives**:
```
🔔 Processing AQI alert (ID: 1704067200000)
   Value: 320, Threshold: 300
✓ Message sent to Telegram (ID: 12345)
✓ Alert moved to history
✓ Trigger record updated
```

---

## ⚠️ Common Issues & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Backend won't start | Missing service account file | Download from Firebase console, save as `firebase-service-account.json` |
| No alerts sent | Backend not running | Start: `node telegram-alert-service.js` |
| Telegram error "403 Forbidden" | Chat ID is a bot account | Use personal account; click "Detect Chat ID" in dashboard |
| Same alert repeats | Cooldown not working | Wait 10 minutes, or check cooldown values |
| Alert never written | Threshold not crossed correctly | Need: `previous < threshold && current >= threshold` |
| Firebase read error | Incorrect database URL | Verify in `firebase-config.js` and backend config |

---

## 📝 Key Parameters

### Dashboard Alert State (`alertState` in dashboard.js)
```javascript
alertState = {
  previousAqi: null,              // Track previous value
  previousGas: null,              // Track previous value
  lastAqiAlertTime: 0,            // Last alert timestamp
  lastGasAlertTime: 0,            // Last alert timestamp
  alertCooldown: 10*60*1000       // 10 minutes
}
```

### Backend Config (`config` in telegram-alert-service.js)
```javascript
config = {
  alertCooldown: 10 * 60 * 1000,  // 10 minutes between alerts
  maxRetries: 3,                   // Retry failed sends
  retryDelay: 2000,                // 2 seconds between retries
  telegramApiTimeout: 10000        // 10 seconds timeout
}
```

### Firebase Paths
```
/telegram/bot_token              → Your Telegram bot token
/telegram/chat_id                → Your Telegram chat ID
/telegram/alerts/triggers        → NEW alerts (unprocessed)
/telegram/alerts/history         → Sent alerts (processed)
/thresholds/aqi_limit           → AQI threshold
/thresholds/gas_limit           → Gas threshold (ppm)
```

---

## 🧪 Test Scenarios

### Test 1: Send Test Message (Dashboard)
1. Open dashboard
2. Go to "Telegram Configuration"
3. Click "Send Test Message"
4. Check Telegram - should see message immediately

**Expected result**: ✓ Message received in <2 seconds

### Test 2: Automatic Alert Trigger
1. Set AQI threshold to 50 (very low)
2. Wait for sensor data to update
3. When AQI > 50, alert should trigger
4. Check Telegram for alert

**Expected result**: ✓ Alert received within 5 seconds

### Test 3: Cooldown Prevention
1. Trigger an alert (AQI > threshold)
2. Immediately lower threshold again
3. Trigger same alert type again
4. Check Telegram - should NOT receive message

**Expected result**: ✓ Message received only once (cooldown working)

---

## 📞 Support Commands

### Backend Diagnostics
```bash
# Check if service is running
tasklist | findstr "node"

# View Node version
node --version

# View npm version  
npm --version

# Check if dependencies installed
dir node_modules | findstr "firebase-admin\|axios"

# Test Firebase service account
node -e "console.log(require('./firebase-service-account.json'))"
```

### Firebase Console Checks
```
1. Go to: https://console.firebase.google.com/project/ems-iot-system/database
2. Check /telegram/bot_token exists
3. Check /telegram/chat_id exists  
4. Monitor /telegram/alerts/triggers for new entries
5. Check /telegram/alerts/history for completed alerts
```

### Telegram Bot Testing
```bash
# Get your bot updates (last 5 messages sent to bot)
curl "https://api.telegram.org/bot{TOKEN}/getUpdates"

# Send manual message (replace placeholders)
curl -X POST "https://api.telegram.org/bot{TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"{CHAT_ID}","text":"Test","parse_mode":"HTML"}'
```

---

## 🎯 Next Steps After Setup

1. **Verify everything works** using Test Scenarios above
2. **Monitor for 1-2 hours** to ensure stable operation
3. **Adjust thresholds** if needed for your environment
4. **Check logs regularly** for errors or warnings
5. **Consider backing up** `firebase-service-account.json` securely

---

**Backend service should now automatically send alerts to Telegram when thresholds are exceeded!** ✅
