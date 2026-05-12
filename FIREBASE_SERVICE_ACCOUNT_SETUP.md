# Firebase Service Account Setup

## What You Need

The backend service (`telegram-alert-service.js`) requires a **Firebase Service Account Key** to authenticate with Firebase Admin SDK.

This key file is NOT the same as:
- Your web API key
- Your project ID  
- Your database URL

It's a **special admin credential** that gives full access to Firebase.

---

## Step-by-Step Setup

### Step 1: Open Firebase Console

1. Go to: https://console.firebase.google.com/
2. Select your project: **ems-iot-system**
3. You should see: "ems-iot-system – Overview" page

### Step 2: Navigate to Service Accounts

1. Click the **⚙️ Settings gear icon** in the top-right
2. From dropdown, select **Project Settings**
3. Click the **Service Accounts** tab

### Step 3: Generate New Private Key

1. In the "Service Accounts" section, you'll see:
   - "Firebase Admin SDK" 
   - Language dropdown (currently set to Node.js)
2. Click the button: **Generate New Private Key**
3. A dialog will appear: "Are you sure?"
4. Click **Generate Key**
5. A file will automatically download: `ems-iot-system-XXXXX.json`

### Step 4: Place File in Project

1. **Move the downloaded file** to: `d:\EMS\es\`
2. **Rename it** to: `firebase-service-account.json`

**Result**: You should now have:
```
d:\EMS\es\firebase-service-account.json
```

### Step 5: Verify File Contents

The file should look like this:

```json
{
  "type": "service_account",
  "project_id": "ems-iot-system",
  "private_key_id": "abc123def456...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIB...",
  "client_email": "firebase-adminsdk-xxxxx@ems-iot-system.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://accounts.google.com/o/oauth2/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

✅ If you see this structure, you're good!

### Step 6: Test the Setup

Run the backend service to verify:

```bash
cd d:\EMS\es
node telegram-alert-service.js
```

**If successful**, you'll see:
```
=== TELEGRAM ALERT SERVICE STARTING ===
Loading Firebase service account...
✓ Service account loaded
✓ Firebase Admin initialized
```

**If it fails**, you'll see:
```
✗ ERROR: firebase-service-account.json not found!
```

---

## ⚠️ Important Security Notes

### 🔐 This File is Highly Sensitive

- **Contains**: Complete admin access to your Firebase project
- **What it can do**: Read, write, delete all data
- **If compromised**: Anyone with this file can access everything

### ❌ DO NOT:

- ❌ Share this file with anyone
- ❌ Commit to GitHub (will be exposed publicly)
- ❌ Upload to cloud storage unencrypted
- ❌ Leave visible on shared computers
- ❌ Post screenshots containing this file

### ✅ DO:

- ✅ Keep it only on your server
- ✅ Restrict file permissions to your user only
- ✅ Backup securely if needed
- ✅ Regenerate if you suspect compromise
- ✅ Use environment variables in production

---

## How to Use It Safely

### On Windows Development Machine (Your PC)

Place at: `d:\EMS\es\firebase-service-account.json`

This is okay because it's your personal development environment.

### On a Remote/Production Server

**Option 1: Environment Variable** (Recommended)

```bash
# Set environment variable
set FIREBASE_SERVICE_ACCOUNT=C:\secure\firebase-service-account.json

# Modify telegram-alert-service.js to read from env var:
const filePath = process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json';
const serviceAccount = require(filePath);
```

**Option 2: Restricted File Permissions**

```bash
# After placing file on server, restrict permissions
icacls "firebase-service-account.json" /grant:r "%USERNAME%:F" /inheritance:r
```

---

## Troubleshooting

### Error: "firebase-service-account.json not found"

**Solution**:
1. Verify file is in `d:\EMS\es\` directory
2. Check filename is exactly: `firebase-service-account.json`
3. Check file extension is `.json` (not `.txt` or `.json.txt`)
4. Run from correct directory: `cd d:\EMS\es`

### Error: "Invalid service account"

**Solution**:
1. Download a fresh copy from Firebase console
2. Verify JSON format is valid (no missing characters)
3. Check the file wasn't modified after download
4. Compare with the structure shown above

### Error: "Cannot read property 'project_id'"

**Solution**:
1. File was downloaded but corrupted
2. Download fresh copy
3. Don't open/edit with programs that add BOM (Byte Order Mark)
4. Use Notepad++ or VS Code instead of Word

### Error: "Database URL not found"

**Solution**:
1. Service account file is valid but backend can't connect
2. Check internet connection
3. Verify Firebase database URL is correct
4. Check Firebase project is still active

---

## Regenerating If Compromised

If someone sees your service account key:

1. **Go to Firebase Console** → Project Settings → Service Accounts
2. **Click the trash icon** next to the compromised key
3. **Click "Generate New Private Key"**
4. **Download new key** as `firebase-service-account.json`
5. **Replace old file** with new one
6. **Delete old file** securely

---

## Additional Notes

### Key File Format

The service account is in **PEM format** (standard for cryptographic keys). It includes:
- Your Firebase project credentials
- A private key for authentication  
- Metadata about your project

### Automatic Credential Discovery

If you place the file in `./firebase-service-account.json`, the backend service automatically finds it:

```javascript
const serviceAccount = require('./firebase-service-account.json');
```

### Testing with Service Account

You can test if the credentials work:

```bash
node -e "
  const admin = require('firebase-admin');
  const sa = require('./firebase-service-account.json');
  console.log('Project ID:', sa.project_id);
  console.log('Service Account Email:', sa.client_email);
"
```

---

## Summary

✅ **After completing this guide, you should have**:

- [ ] Downloaded `firebase-service-account.json` from Firebase console
- [ ] Placed it in `d:\EMS\es\` directory  
- [ ] Verified the JSON file has correct structure
- [ ] Tested by running `node telegram-alert-service.js`
- [ ] Confirmed backend starts successfully

**Next step**: Start the backend service and test alert functionality!

---

**Questions?** Check the main setup guide: `TELEGRAM_ALERT_SETUP_GUIDE.md`
