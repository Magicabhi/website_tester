const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());

// ✅ Explicit CORS config so GitHub Pages frontend can talk to backend
app.use(cors({
  origin: "*", // allow all origins (or replace with "https://magicabhi.github.io" for stricter)
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// Serve static frontend files if needed
app.use(express.static(path.join(__dirname)));

// Helper to score based on thresholds
function scoreMetricPSI(value, good, needsImprovement) {
  if (value <= good) return 100;
  if (value <= needsImprovement) return 50;
  return 0;
}

// === API: Run Tests ===
app.post("/test", async (req, res) => {
  const { url, mode } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process"
      ]
    });

    const page = await browser.newPage();

    // Set viewport
    if (mode === "mobile") {
      await page.setViewport({ width: 375, height: 667, isMobile: true });
    } else {
      await page.setViewport({ width: 1366, height: 768, isMobile: false });
    }

    // Inject observers for Web Vitals
    await page.evaluateOnNewDocument(() => {
      window.__perfMetrics = {};

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            window.__perfMetrics.fcp = entry.startTime;
          }
        }
      }).observe({ type: "paint", buffered: true });

      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        window.__perfMetrics.lcp =
          last.renderTime || last.loadTime || last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });

      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        window.__perfMetrics.cls = clsValue;
      }).observe({ type: "layout-shift", buffered: true });
    });

    const navStart = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const totalLoadTime = Date.now() - navStart;

    // Gather metrics
    const perf = await page.evaluate(() => {
      const pt = performance.timing;
      return {
        ...window.__perfMetrics,
        ttfb: pt.responseStart - pt.requestStart,
        domContentLoaded: pt.domContentLoadedEventEnd - pt.navigationStart,
        loadTime: pt.loadEventEnd - pt.navigationStart
      };
    });

    // Functional checks
    const links = await page.$$eval("a", as => as.length);
    const forms = await page.$$eval("form", fs => fs.length);
    const buttons = await page.$$eval("button", bs => bs.length);

    const results = {
      functional: [
        { text: "Links present", status: links > 0 ? "pass" : "fail" },
        { text: "Forms present", status: forms > 0 ? "pass" : "fail" },
        { text: "Buttons present", status: buttons > 0 ? "pass" : "fail" }
      ],
      usability: [
        { text: "Page has title", status: (await page.title()) ? "pass" : "fail" },
        {
          text: "Images present",
          status: (await page.$$eval("img", imgs => imgs.length)) > 0 ? "pass" : "fail"
        }
      ],
      security: [
        { text: "HTTPS enabled", status: url.startsWith("https") ? "pass" : "fail" }
      ],
      performance: [
        {
          text: `FCP: ${Math.round(perf.fcp || 0)} ms`,
          status: scoreMetricPSI(perf.fcp || Infinity, 1800, 3000) >= 50 ? "pass" : "fail"
        },
        {
          text: `LCP: ${Math.round(perf.lcp || 0)} ms`,
          status: scoreMetricPSI(perf.lcp || Infinity, 2500, 4000) >= 50 ? "pass" : "fail"
        },
        {
          text: `TTFB: ${Math.round(perf.ttfb || 0)} ms`,
          status: scoreMetricPSI(perf.ttfb || Infinity, 800, 1800) >= 50 ? "pass" : "fail"
        },
        {
          text: `CLS: ${(perf.cls || 0).toFixed(2)}`,
          status: (perf.cls || 0) <= 0.25 ? "pass" : "fail"
        },
        {
          text: `DOM Content Loaded: ${perf.domContentLoaded} ms`,
          status: perf.domContentLoaded < 4000 ? "pass" : "fail"
        },
        {
          text: `Total Load Time: ${totalLoadTime} ms`,
          status: totalLoadTime < (mode === "mobile" ? 5000 : 3000) ? "pass" : "fail"
        }
      ]
    };

    // Calculate score
    const scores = [
      scoreMetricPSI(perf.fcp || Infinity, 1800, 3000),
      scoreMetricPSI(perf.lcp || Infinity, 2500, 4000),
      scoreMetricPSI(perf.ttfb || Infinity, 800, 1800),
      (perf.cls <= 0.10 ? 100 : perf.cls <= 0.25 ? 50 : 0),
      scoreMetricPSI(totalLoadTime, mode === "mobile" ? 5000 : 3000, mode === "mobile" ? 8000 : 5000)
    ];

    [...results.functional, ...results.usability, ...results.security].forEach(test => {
      scores.push(test.status === "pass" ? 100 : 0);
    });

    results.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    results.mode = mode;

    await browser.close();
    res.json(results);

  } catch (error) {
    console.error("❌ Puppeteer test error:", error);
    if (browser) await browser.close();
    res.status(500).json({ error: "Test failed", details: error.message });
  }
});

// Health check
app.get("/ping", (req, res) => {
  res.json({ status: "ok" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
