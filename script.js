// ✅ Replace with your actual Render backend URL
const API_BASE = "https://website-tester-backend-xxxx.onrender.com";

async function runTest(mode) {
  const url = document.getElementById("urlInput").value;
  if (!url) {
    alert("Please enter a URL");
    return;
  }

  document.getElementById("loading").style.display = "block";
  document.getElementById("error").style.display = "none";
  document.getElementById("modeLabel").textContent = `Overall Score (${mode})`;

  try {
    const response = await fetch(`${API_BASE}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.details || data.error);

    renderResults(data);
  } catch (err) {
    document.getElementById("error").style.display = "block";
    document.getElementById("error").textContent = "❌ " + err.message;
  } finally {
    document.getElementById("loading").style.display = "none";
  }
}

function renderResults(data) {
  updateList("functionalResults", data.functional);
  updateList("usabilityResults", data.usability);
  updateList("securityResults", data.security);
  updateList("performanceResults", data.performance);

  const scoreBoard = document.getElementById("scoreBoard");
  scoreBoard.textContent = `${data.score}%`;
  scoreBoard.className = "score " + (data.score >= 90 ? "pass" : data.score >= 50 ? "warn" : "fail");
}

function updateList(elementId, items) {
  const ul = document.getElementById(elementId);
  ul.innerHTML = "";
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.text;
    li.className = item.status;
    ul.appendChild(li);
  });
}
