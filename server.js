const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer-core");
const path = require("path");
const cors = require("cors");
const { execSync } = require("child_process");

const app = express();
app.use(bodyParser.json());

// ✅ Allow all origins (important for GitHub Pages → Render)
app.use(cors({ origin: "*" }));

// Serve static if needed
app.use(express.static(path.join(__dirname)));

// === Helper to launch Chromium ===
async function launchBrowser(isMobile) {
  return await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote"
    ],
    defaultViewport: isMobile
      ? { width: 375, height: 667, isMobile: true }
      : { width: 1366, height: 768, isMobile: false }
  });
}

// === API Route: Run Tests ===
app.post("/test", async (req, res) => {
  const { url, mode } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const browser = await launchBrowser(mode === "mobile");
    const page = await browser.newPage();

    const start = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const loadTime = Date.now() - start;

    // Functional checks
    const links = await page.$$eval("a", as => as.length);
    const forms = await page.$$eval("form", fs => fs.length);
    const buttons = await page.$$eval("button", bs => bs.length);

    // Usability
    const title = await page.title();
    const images = await page.$$eval("img", imgs => imgs.length);

    // Security
    const isHttps = url.startsWith("https");

    // Build results
    const results = {
      functional: [
        { text: "Links present", status: links > 0 ? "pass" : "fail" },
        { text: "Forms present", status: forms > 0 ? "pass" : "fail" },
        { text: "Buttons present", status: buttons > 0 ? "pass" : "fail" }
      ],
      usability: [
        { text: "Page has title", status: title ? "pass" : "fail" },
        { text: "Images present", status: images > 0 ? "pass" : "fail" }
      ],
      security: [
        { text: "HTTPS enabled", status: isHttps ? "pass" : "fail" }
      ],
      performance: [
        { text: `Page load time: ${loadTime} ms`, status: loadTime < 5000 ? "pass" : "fail" }
      ]
    };

    // Score
    const all = [
      ...results.functional,
      ...results.usability,
      ...results.security,
      ...results.performance
    ];
    const passed = all.filter(t => t.status === "pass").length;
    results.score = Math.round((passed / all.length) * 100);

    await browser.close();
    res.json(results);

  } catch (error) {
    res.status(500).json({ error: "Test failed", details: error.message });
  }
});

// === Health Check ===
app.get("/ping", (req, res) => res.json({ status: "ok" }));

// === Diagnostic Chrome check ===
app.get("/check-chrome", (req, res) => {
  try {
    const version = execSync("/usr/bin/chromium --version").toString();
    res.json({
      chromiumPath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      version
    });
  } catch (err) {
    res.json({ error: "Chromium not found", details: err.message });
  }
});

app.listen(3000, () => console.log("✅ Backend running on port 3000"));
