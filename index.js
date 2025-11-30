import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import admin from "firebase-admin";

const app = express();
app.use(bodyParser.json());

const THINGSBOARD_HOST = "demo.thingsboard.io";
const deviceIds = [
  "cc518ae0-cb9f-11f0-aedf-65a2559b1d36",
  "4c1cbb90-cba1-11f0-aedf-65a2559b1d36",
];
const JWT_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJtaW5obGFtdnU2MkBnbWFpbC5jb20iLCJ1c2VySWQiOiJlNWU5MTVjMC1jYjljLTExZjAtYWVkZi02NWEyNTU5YjFkMzYiLCJzY29wZXMiOlsiVEVOQU5UX0FETUlOIl0sInNlc3Npb25JZCI6IjY3NWY4MzllLWY3OTgtNDNkZi1iODI5LTg2MmZiODI3ODlhMyIsImV4cCI6MTc2NjA1MzUyNywiaXNzIjoidGhpbmdzYm9hcmQuaW8iLCJpYXQiOjE3NjQyNTM1MjcsImZpcnN0TmFtZSI6Im1pbmggbGFtIiwibGFzdE5hbWUiOiJ2dSIsImVuYWJsZWQiOnRydWUsInByaXZhY3lQb2xpY3lBY2NlcHRlZCI6dHJ1ZSwiaXNQdWJsaWMiOmZhbHNlLCJ0ZW5hbnRJZCI6ImU1Y2JhMmIwLWNiOWMtMTFmMC1hZWRmLTY1YTI1NTliMWQzNiIsImN1c3RvbWVySWQiOiIxMzgxNDAwMC0xZGQyLTExYjItODA4MC04MDgwODA4MDgwODAifQ.ktgQC287NQX-9vWhM3oLUXT0e7IDOCQdVK1JKP8QhCSPhskTuktUGX80iybhw4k17aMl_Hr6CWl_Zcu0ahWQIA";

const firebaseKey = {
  type: process.env.TYPE,
  project_id: process.env.PROJECT_ID,
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.CLIENT_EMAIL,
  client_id: process.env.CLIENT_ID,
  auth_uri: process.env.AUTH_URI,
  token_uri: process.env.TOKEN_URI,
  auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.CLIENT_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(firebaseKey),
});

async function fetchTelemetryData(deviceId) {
  const currentTime = new Date();
  const twel = new Date(currentTime.getTime() - 3 * 60 * 1000);
  const startTimestamp = twel.getTime();
  const endTimestamp = currentTime.getTime();
  try {
    const response = await fetch(
      `https://${THINGSBOARD_HOST}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=heart_rate,temperature,spo2&startTs=${startTimestamp}&endTs=${endTimestamp}&interval=60000&limit=100&agg=AVG`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      console.error(`Failed to fetch telemetry data for device ${deviceId}`);
    }
  } catch (error) {
    console.error(`Error fetching telemetry data for device ${deviceId}:`, error);
  }
  return null;
}

async function checkAndNotify() {
  for (const deviceId of deviceIds) {
    const data = await fetchTelemetryData(deviceId);

    if (data) {
      console.log(`Telemetry data for device ${deviceId}:`, data);

      if (data.temperature && data.temperature[0]?.value > 37.2) {
        sendNotification(
          "Bệnh nhân bất thường",
          `Nhiệt độ: ${data.temperature[0].value}°C, vượt ngưỡng!`
        );
      } else if (
        data.heart_rate &&
        (data.heart_rate[0]?.value > 130 || data.heart_rate[0]?.value < 60)
      ) {
        sendNotification(
          "Bệnh nhân bất thường",
          `Nhịp tim: ${data.heart_rate[0].value} bpm, không bình thường!`
        );
      } else if (data.spo2 && data.spo2[0]?.value < 95) {
        sendNotification(
          "Chỉ số SpO2 bất thường",
          `SpO2: ${data.spo2[0].value}%, quá thấp!`
        );
      }
    }
  }
}

function sendNotification(title, body) {
  const message = {
    notification: {
      title,
      body,
    },
    topic: "alerts",
  };

  admin
    .messaging()
    .send(message)
    .then((response) => {
      console.log("Notification sent successfully:", response);
    })
    .catch((error) => {
      console.error("Error sending notification:", error.message);
    });
}

app.get("/check-telemetry", async (req, res) => {
  try {
    await checkAndNotify();
    res
      .status(200)
      .send("Telemetry checked and notifications sent if needed.");
  } catch (error) {
    console.error("Error in /check-telemetry:", error);
    res.status(500).send("An error occurred.");
  }
});

setInterval(checkAndNotify, 60 * 1000);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server is running on", PORT);
});
