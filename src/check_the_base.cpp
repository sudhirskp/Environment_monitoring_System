#include "DHT.h"
#include <Arduino.h>
#include <WiFi.h>  // WiFi connectivity library
#include <Firebase_ESP_Client.h>  // Firebase library
#include "addons/TokenHelper.h"   // Firebase token generation helper
#include "addons/RTDBHelper.h"    // Firebase RTDB helper functions
#include "secrets.h"              // SENSITIVE: WiFi & Firebase credentials

// -------------------- FORWARD DECLARATIONS --------------------
void connectWiFi();
void checkWiFiConnection();
void initFirebase();
void uploadToFirebase(float temperature, float humidity, int aqi, float mq9_value, String gasStatus, String aqiCategory);
void fetchThresholds();
void setup();
void loop();

// -------------------- DHT11 SETTINGS --------------------
#define DHTPIN 4          // DHT11 DATA connected to GPIO4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// -------------------- MQ SENSOR PINS --------------------
int mq135_pin = 34;       // MQ-135 AO -> GPIO34
int mq9_pin = 35;         // MQ-9 AO -> GPIO35

// -------------------- BUZZER SETTINGS --------------------
#define BUZZER_PIN 5      // Buzzer I/O connected to GPIO5

// -------------------- THRESHOLD SETTINGS (Dynamic from Firebase) --------------------
int aqi_limit = 300;      // Default AQI threshold (fetched from Firebase)
int gas_limit = 2500;     // Default gas threshold (fetched from Firebase)
unsigned long lastThresholdCheck = 0;
const unsigned long thresholdCheckInterval = 60000; // Refresh thresholds every 60 seconds

// -------------------- WiFi SETTINGS --------------------
// WiFi credentials are now loaded from secrets.h
// Replace WIFI_SSID and WIFI_PASSWORD in src/secrets.h with your credentials
unsigned long lastWiFiCheck = 0;
const unsigned long wifiCheckInterval = 30000; // Check WiFi every 30 seconds

// -------------------- FIREBASE SETTINGS --------------------
// Firebase credentials are now loaded from secrets.h
// Replace the credentials in src/secrets.h with your actual values
// Location: https://console.firebase.google.com/project/YOUR_PROJECT/settings/general

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

bool firebaseReady = false;
unsigned long firebaseDataCount = 0;

// -------------------- VARIABLES -------------------------
float mq135_value = 0;
float mq9_value = 0;
unsigned long readingCount = 0;
unsigned long startTime = 0;

// -------------------- AQI CALCULATION -------------------
int calculateAQI(float sensorValue) {
  // Convert raw sensor value (0-4095) to AQI (0-500)
  // Calibrated for MQ-135 sensor
  int aqi;
  
  if (sensorValue < 400) {
    // Good (0-50)
    aqi = map(sensorValue, 0, 400, 0, 50);
  } else if (sensorValue < 800) {
    // Moderate (51-100)
    aqi = map(sensorValue, 400, 800, 51, 100);
  } else if (sensorValue < 1200) {
    // Unhealthy for Sensitive Groups (101-150)
    aqi = map(sensorValue, 800, 1200, 101, 150);
  } else if (sensorValue < 1600) {
    // Unhealthy (151-200)
    aqi = map(sensorValue, 1200, 1600, 151, 200);
  } else if (sensorValue < 2000) {
    // Very Unhealthy (201-300)
    aqi = map(sensorValue, 1600, 2000, 201, 300);
  } else {
    // Hazardous (301-500)
    aqi = map(sensorValue, 2000, 4095, 301, 500);
    if (aqi > 500) aqi = 500;
  }
  
  return aqi;
}

String getAQICategory(int aqi) {
  if (aqi <= 50) return "Good";
  else if (aqi <= 100) return "Moderate";
  else if (aqi <= 150) return "Unhealthy for Sensitive";
  else if (aqi <= 200) return "Unhealthy";
  else if (aqi <= 300) return "Very Unhealthy";
  else return "Hazardous";
}

String getAQIColor(int aqi) {
  if (aqi <= 50) return "Green";
  else if (aqi <= 100) return "Yellow";
  else if (aqi <= 150) return "Orange";
  else if (aqi <= 200) return "Red";
  else if (aqi <= 300) return "Purple";
  else return "Maroon";
}

// -------------------- WiFi CONNECTION FUNCTIONS --------------------
void connectWiFi() {
  Serial.println();
  Serial.println("════════════════════════════════════════════════════════════");
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  Serial.println("════════════════════════════════════════════════════════════");
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✓ WiFi Connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
    
    // ========== NEW: FIREBASE INITIALIZATION ==========
    // Initialize Firebase after WiFi connection
    initFirebase();
    
    // ========== NEW: FETCH THRESHOLDS FROM FIREBASE (STEP 3) ==========
    // Fetch initial threshold values from Firebase
    if (firebaseReady) {
      fetchThresholds();
    }
    // ===================================================================
  } else {
    Serial.println("✗ WiFi Connection Failed!");
    Serial.println("⚠ Skipping Firebase initialization (no WiFi)");
  }
  Serial.println("════════════════════════════════════════════════════════════");
  Serial.println();
}

// -------------------- WIFI STATUS CHECK --------------------
void checkWiFiConnection() {
  // Non-blocking WiFi status check
  unsigned long currentMillis = millis();
  
  if (currentMillis - lastWiFiCheck >= wifiCheckInterval) {
    lastWiFiCheck = currentMillis;
    
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println();
      Serial.println("⚠ WiFi disconnected! Attempting to reconnect...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      
      int attempts = 0;
      while (WiFi.status() != WL_CONNECTED && attempts < 10) {
        delay(500);
        Serial.print(".");
        attempts++;
      }
      
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("✓ WiFi Reconnected!");
        Serial.print("   IP Address: ");
        Serial.println(WiFi.localIP());
      } else {
        Serial.println();
        Serial.println("✗ Reconnection failed. Will retry in 30 seconds.");
      }
      Serial.println();
    }
  }
}
void initFirebase() {
  Serial.println();
  Serial.println("════════════════════════════════════════════════════════════");
  Serial.println("Initializing Firebase...");
  Serial.println("════════════════════════════════════════════════════════════");
  
  // Configure Firebase
  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_DATABASE_URL;
  
  // Sign in with user credentials
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  
  // Assign callback function for token generation
  config.token_status_callback = tokenStatusCallback;
  
  // Initialize Firebase
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  // Wait for token generation
  Serial.print("Waiting for Firebase authentication");
  int attempts = 0;
  while (!Firebase.ready() && attempts < 30) {
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  Serial.println();
  
  if (Firebase.ready()) {
    firebaseReady = true;
    Serial.println("✓ Firebase Connected Successfully!");
    Serial.print("   Database URL: ");
    Serial.println(FIREBASE_DATABASE_URL);
    Serial.println("   Ready to upload sensor data");
  } else {
    firebaseReady = false;
    Serial.println("✗ Firebase Connection Failed!");
    Serial.println("   System will continue without cloud upload.");
    Serial.println("   Check API key, database URL, and credentials.");
  }
  Serial.println("════════════════════════════════════════════════════════════");
  Serial.println();
}

void uploadToFirebase(float temperature, float humidity, int aqi, float mq9_value, String gasStatus, String aqiCategory) {
  // Only upload if Firebase is ready and WiFi is connected
  if (!firebaseReady || WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  firebaseDataCount++;
  
  // Create unique path for this reading: environment_data/reading_XXXXX
  String path = "/environment_data/reading_" + String(firebaseDataCount);
  
  // Create JSON object with all sensor data
  FirebaseJson json;
  json.set("temperature", temperature);
  json.set("humidity", humidity);
  json.set("aqi", aqi);
  json.set("aqi_category", aqiCategory);
  json.set("mq9_gas", mq9_value);
  json.set("gas_status", gasStatus);
  json.set("timestamp/.sv", "timestamp");  // Firebase server timestamp
  
  // Upload to Firebase
  if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json)) {
    Serial.print("   [Firebase] ✓ Data uploaded to: ");
    Serial.println(path);
  } else {
    Serial.print("   [Firebase] ✗ Upload failed: ");
    Serial.println(fbdo.errorReason());
  }
}

// -------------------- FETCH THRESHOLDS FROM FIREBASE --------------------
void fetchThresholds() {
  // Only fetch if Firebase is ready and WiFi is connected
  if (!firebaseReady || WiFi.status() != WL_CONNECTED) {
    Serial.println("   [Thresholds] ⚠ Skipping fetch (Firebase not ready or no WiFi)");
    return;
  }
  
  Serial.println("   [Thresholds] Fetching from Firebase...");
  
  // Fetch AQI threshold
  if (Firebase.RTDB.getInt(&fbdo, "/thresholds/aqi_limit")) {
    if (fbdo.dataType() == "int") {
      aqi_limit = fbdo.intData();
      Serial.print("   [Thresholds] ✓ AQI Limit updated: ");
      Serial.println(aqi_limit);
    }
  } else {
    Serial.print("   [Thresholds] ⚠ Failed to fetch AQI limit: ");
    Serial.println(fbdo.errorReason());
  }
  
  // Fetch Gas threshold
  if (Firebase.RTDB.getInt(&fbdo, "/thresholds/gas_limit")) {
    if (fbdo.dataType() == "int") {
      gas_limit = fbdo.intData();
      Serial.print("   [Thresholds] ✓ Gas Limit updated: ");
      Serial.println(gas_limit);
    }
  } else {
    Serial.print("   [Thresholds] ⚠ Failed to fetch Gas limit: ");
    Serial.println(fbdo.errorReason());
  }
}


void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗");
  Serial.println("║                           ESP32 ENVIRONMENT MONITORING SYSTEM - RESEARCH DATA MODE                                        ║");
  Serial.println("╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝");
  Serial.println();
  Serial.println("Location: [Your Location Name]");
  Serial.println("Coordinates: [Latitude, Longitude]");
  Serial.println("Date: November 16, 2025");
  Serial.println();
  Serial.println("PARAMETER DESCRIPTION:");
  Serial.println("- No.: Reading sequence number");
  Serial.println("- Time (sec): Elapsed time since system start");
  Serial.println("- Temp (°C): Temperature measured by DHT11 sensor in Celsius");
  Serial.println("- Humid (%): Relative humidity measured by DHT11 sensor in percentage");
  Serial.println("- AQI Value: Air Quality Index calculated from MQ-135 sensor (0-500 scale)");
  Serial.println("- AQI Category: Air quality classification (Good/Moderate/Unhealthy etc.)");
  Serial.println("- MQ-9 (ppm): Gas concentration from MQ-9 sensor (CO/LPG/Methane) in parts per million");
  Serial.println("- Gas Status: Gas level alert status (Normal/WARNING/HIGH ALERT)");
  Serial.println();
  Serial.println("┌───────────────────────────┬──────┬──────────┬──────────────┬──────────┬─────────────┬─────────────────────────┬──────────────┬──────────────┐");
  Serial.println("│     MEASUREMENT           │ No.  │   Time   │  Temp (°C)   │ Humid(%) │  AQI Value  │      AQI Category       │  MQ-9 (ppm)  │   Gas Status │");
  Serial.println("│                           │      │  (sec)   │   (DHT11)    │ (DHT11)  │  (MQ-135)   │                         │    (MQ-9)    │              │");
  Serial.println("├───────────────────────────┼──────┼──────────┼──────────────┼──────────┼─────────────┼─────────────────────────┼──────────────┼──────────────┤");

  dht.begin();
  analogReadResolution(12);
  
  // Initialize buzzer pin
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Buzzer off initially
  
  // Startup beep - confirm system is working
  delay(500);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);
  delay(100);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);
  delay(100);
  
  // ========== NEW: WiFi INITIALIZATION ==========
  // Connect to WiFi network before sensor initialization
  connectWiFi();
  // =================================================
  
  startTime = millis();
}

void loop() {
  // ========== NEW: REFRESH THRESHOLDS PERIODICALLY (STEP 3) ==========
  // Update threshold values from Firebase every 60 seconds
  unsigned long currentMillis = millis();
  if (currentMillis - lastThresholdCheck >= thresholdCheckInterval) {
    lastThresholdCheck = currentMillis;
    if (firebaseReady && WiFi.status() == WL_CONNECTED) {
      fetchThresholds();
    }
  }
  // ===================================================================
  
  // ========== NEW: Check WiFi connection ==========
  // Periodically check and reconnect WiFi if disconnected (non-blocking)
  checkWiFiConnection();
  // ================================================
  
  readingCount++;
  unsigned long elapsedTime = (millis() - startTime) / 1000; // seconds

  // ------------ READ DHT11 --------------
  float h = dht.readHumidity();
  float t = dht.readTemperature(); // Celsius
  
  // Check if sensor read failed
  if (isnan(h) || isnan(t)) {
    Serial.println("│ ERROR: Failed to read DHT11 sensor! Check connections.                                                                │");
    delay(2000);
    return; // Skip this reading and try again
  }

  // ------------ READ MQ-135 & CALCULATE AQI --------------
  mq135_value = analogRead(mq135_pin);
  int aqi = calculateAQI(mq135_value);
  String aqiCategory = getAQICategory(aqi);

  // ------------ READ MQ-9 --------------
  mq9_value = analogRead(mq9_pin);
  
  // Determine gas status based on MQ-9 value (using dynamic threshold from Firebase)
  String gasStatus;
  if (mq9_value > gas_limit * 2) {  // High alert at 2x gas_limit
    gasStatus = "HIGH ALERT";
  } else if (mq9_value > gas_limit) {  // Warning at gas_limit
    gasStatus = "WARNING";
  } else {
    gasStatus = "Normal";
  }

  // ------------ BUZZER ALERT SYSTEM (Dynamic Thresholds from Firebase) --------------
  // Activate buzzer based on Firebase thresholds: aqi_limit and gas_limit
  if (aqi >= aqi_limit || mq9_value > gas_limit) {
    // Buzzer ON - Quick beep pattern for alerts (non-blocking)
    digitalWrite(BUZZER_PIN, HIGH);
    delay(50);
    digitalWrite(BUZZER_PIN, LOW);
    delay(50);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(50);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    // Buzzer OFF - Air quality is acceptable
    digitalWrite(BUZZER_PIN, LOW);
  }

  // ------------ PRINT TABLE ROW --------------
  // Print measurement label
  Serial.print("│ Reading #");
  Serial.print(readingCount);
  int labelLen = 9 + String(readingCount).length();
  for (int i = labelLen; i < 25; i++) Serial.print(" ");
    
  // Print row number (pad to 4 chars)
  Serial.print(" │ ");
  if (readingCount < 10) Serial.print("   ");
  else if (readingCount < 100) Serial.print("  ");
  else if (readingCount < 1000) Serial.print(" ");
  Serial.print(readingCount);
  
  // Print elapsed time (pad to 8 chars)
  Serial.print(" │ ");
  if (elapsedTime < 10) Serial.print("      ");
  else if (elapsedTime < 100) Serial.print("     ");
  else if (elapsedTime < 1000) Serial.print("    ");
  else if (elapsedTime < 10000) Serial.print("   ");
  Serial.print(elapsedTime);
  
  // Print temperature (pad to 12 chars)
  Serial.print(" │    ");
  Serial.print(t, 2);
  if (t < 10) Serial.print("  ");
  else if (t < 100) Serial.print(" ");
  
  // Print humidity (pad to 8 chars)
  Serial.print(" │   ");
  Serial.print(h, 1);
  if (h < 10) Serial.print("  ");
  else if (h < 100) Serial.print(" ");
  
  // Print AQI (pad to 11 chars)
  Serial.print(" │     ");
  if (aqi < 10) Serial.print("  ");
  else if (aqi < 100) Serial.print(" ");
  Serial.print(aqi);
  
  // Print category (pad to 23 chars)
  Serial.print(" │ ");
  Serial.print(aqiCategory);
  int catLen = aqiCategory.length();
  for (int i = catLen; i < 23; i++) Serial.print(" ");
  
  // Print MQ-9 value (pad to 12 chars)
  Serial.print(" │    ");
  Serial.print(mq9_value, 0);
  if (mq9_value < 10) Serial.print("   ");
  else if (mq9_value < 100) Serial.print("  ");
  else if (mq9_value < 1000) Serial.print(" ");
  
  // Print gas status (pad to 12 chars)
  Serial.print(" │ ");
  Serial.print(gasStatus);
  // ========== NEW: FIREBASE UPLOAD ==========
  // Upload sensor data to Firebase Realtime Database
  uploadToFirebase(t, h, aqi, mq9_value, gasStatus, aqiCategory);
  // ===========================================

  int statLen = gasStatus.length();
  for (int i = statLen; i < 12; i++) Serial.print(" ");
  Serial.println(" │");
  
  // Print separator every 10 readings
  if (readingCount % 10 == 0) {
    Serial.println("├───────────────────────────┼──────┼──────────┼──────────────┼──────────┼─────────────┼─────────────────────────┼──────────────┼──────────────┤");
  }

  delay(2000);   // Read every 2 seconds
}
