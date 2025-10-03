const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve frontend (optional if you only deploy API on Render)
app.use(express.static(path.join(__dirname)));

// --- API Route: Run Tests ---
app.post("/test", async (req, res) => {
  const { url, mode } = req.body; // mode = desktop | mobile
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(), // ✅ Fix for Render
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote"
      ]
    });

    const page = await browser.newPage();

    // Set viewport based on mode
    if (mode === "mobile") {
      await page.setViewport({ width: 375, height: 667, isMobile: true });
    } else {
      await page.setViewport({ width: 1366, height: 768, isMobile: false });
    }

    const start = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const loadTime = Date.now() - start;

    // === Functional checks ===
    const links = await page.$$eval("a", as => as.length);
    const forms = await page.$$eval("form", fs => fs.length);
    const buttons = await page.$$eval("button", bs => bs.length);

    // === Usability checks ===
    const title = await page.title();
    const images = await page.$$eval("img", imgs => imgs.length);

    // === Security checks ===
    const isHttps = url.startsWith("https");

    // --- Build results ---
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
        { text: `Page load time: ${loadTime} ms`, status: loadTime < (mode === "mobile" ? 5000 : 3000) ? "pass" : "fail" }
      ],
      score: 0,
      mode: mode || "desktop"
    };

    // --- Weighted Score ---
    const allTests = [
      ...results.functional,
      ...results.usability,
      ...results.security,
      ...results.performance
    ];
    const passed = allTests.filter(t => t.status === "pass").length;
    results.score = Math.round((passed / allTests.length) * 100);

    await browser.close();
    res.json(results);

  } catch (error) {
    console.error("Test failed:", error.message);
    res.status(500).json({ error: "Test failed", details: error.message });
  }
});

// --- Health check ---
app.get("/ping", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(3000, () =>
  console.log("✅ Backend running on port 3000")
);
