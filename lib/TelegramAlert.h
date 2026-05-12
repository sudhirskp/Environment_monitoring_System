// ==================== TELEGRAM ALERT HANDLER ====================
// Firmware-side alert scheduler with 10-minute cooling period.
// This module queues alert events into Firebase:
// - /telegram/alerts/triggers/{alert_id}  (for backend sender)
// - /telegram/alerts/history/{alert_id}   (for dashboard visibility)

#ifndef TELEGRAM_ALERT_H
#define TELEGRAM_ALERT_H

#include <Arduino.h>
#include <Firebase_ESP_Client.h>

// Cooling period: 10 minutes
const unsigned long ALERT_COOLING_PERIOD_MS = 600000;

struct AlertState {
	bool aqiAlertActive = false;
	bool gasAlertActive = false;
	unsigned long lastAqiAlertTime = 0;
	unsigned long lastGasAlertTime = 0;
	bool aqiAlertsEnabled = true;
	bool gasAlertsEnabled = true;
};

static AlertState g_alertState;

void fetchTelegramAlertSettings(FirebaseData &fbdo) {
	if (!Firebase.ready()) {
		return;
	}

	// Optional flags. If nodes are missing, defaults remain true.
	if (Firebase.RTDB.getBool(&fbdo, "/telegram/alerts/aqi_enabled") && fbdo.dataType() == "boolean") {
		g_alertState.aqiAlertsEnabled = fbdo.boolData();
	}

	if (Firebase.RTDB.getBool(&fbdo, "/telegram/alerts/gas_enabled") && fbdo.dataType() == "boolean") {
		g_alertState.gasAlertsEnabled = fbdo.boolData();
	}

}

bool queueTelegramAlert(FirebaseData &fbdo,
												const String &alertType,
												float currentValue,
												float threshold,
												const String &category = "") {
	if (!Firebase.ready()) {
		Serial.println("   [Telegram] ⚠ Firebase not ready, skipping alert queue");
		return false;
	}

	String alertKey = "alert_" + String(millis());

	FirebaseJson alertJson;
	alertJson.set("type", alertType);
	alertJson.set("current_value", currentValue);
	alertJson.set("threshold", threshold);
	alertJson.set("category", category);
	alertJson.set("processed", false);
	alertJson.set("direct_sent", false);
	alertJson.set("source", "esp32");
	alertJson.set("timestamp/.sv", "timestamp");

	String historyPath = "/telegram/alerts/history/" + alertKey;
	bool historyOk = Firebase.RTDB.setJSON(&fbdo, historyPath.c_str(), &alertJson);

	String triggerPath = "/telegram/alerts/triggers/" + alertKey;
	bool triggerOk = Firebase.RTDB.setJSON(&fbdo, triggerPath.c_str(), &alertJson);

	if (triggerOk && historyOk) {
		Serial.print("   [Telegram] ✓ Alert queued: ");
		Serial.println(alertType);
		return true;
	}

	Serial.print("   [Telegram] ✗ Queue failed: ");
	Serial.println(fbdo.errorReason());
	return false;
}

void checkAQIAlert(FirebaseData &fbdo, int currentAQI, int aqiLimit, const String &aqiCategory) {
	if (!g_alertState.aqiAlertsEnabled) {
		return;
	}

	unsigned long now = millis();

	if (currentAQI >= aqiLimit) {
		if (!g_alertState.aqiAlertActive) {
			g_alertState.aqiAlertActive = true;
			g_alertState.lastAqiAlertTime = now;
			queueTelegramAlert(fbdo, "AQI", (float)currentAQI, (float)aqiLimit, aqiCategory);
		} else if (now - g_alertState.lastAqiAlertTime >= ALERT_COOLING_PERIOD_MS) {
			g_alertState.lastAqiAlertTime = now;
			queueTelegramAlert(fbdo, "AQI", (float)currentAQI, (float)aqiLimit, aqiCategory);
		}
	} else if (g_alertState.aqiAlertActive) {
		g_alertState.aqiAlertActive = false;
		Serial.println("   [Telegram] AQI back under threshold, alert state cleared");
	}
}

void checkGasAlert(FirebaseData &fbdo, float currentGas, int gasLimit) {
	if (!g_alertState.gasAlertsEnabled) {
		return;
	}

	unsigned long now = millis();

	if (currentGas > gasLimit) {
		if (!g_alertState.gasAlertActive) {
			g_alertState.gasAlertActive = true;
			g_alertState.lastGasAlertTime = now;
			queueTelegramAlert(fbdo, "GAS", currentGas, (float)gasLimit);
		} else if (now - g_alertState.lastGasAlertTime >= ALERT_COOLING_PERIOD_MS) {
			g_alertState.lastGasAlertTime = now;
			queueTelegramAlert(fbdo, "GAS", currentGas, (float)gasLimit);
		}
	} else if (g_alertState.gasAlertActive) {
		g_alertState.gasAlertActive = false;
		Serial.println("   [Telegram] Gas back under threshold, alert state cleared");
	}
}

#endif
