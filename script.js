// PUT YOUR GEMINI API KEY HERE
const API_KEY = "AIzaSyArgDibWGJ4S_w0yQtRICdS8ihH3cnVwac";
const APP_NAME = "Dentiva Care AI";
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
];

const DENTAL_ASSISTANT_INSTRUCTION = `
You are Dentiva Care AI, a careful dental clinical support assistant.
Respond like an experienced dentist doing patient triage, but do not claim you can replace an in-person dental examination.

Rules:
- Focus only on dental and oral health.
- Use the patient's symptoms and image, if provided, to give the most likely dental possibilities.
- Be clear when the information is not enough for a definite diagnosis.
- Include urgent warning signs that need same-day dental or emergency care.
- Give practical home care advice that is generally safe.
- Do not prescribe antibiotics, opioids, steroids, or prescription-only medicines. Recommend seeing a dentist/doctor for medicines that require examination.
- Keep the language simple and reassuring.
`;

let users = JSON.parse(localStorage.getItem("users") || '{"admin":"1234"}');
let currentUser = null;

function saveUsers() {
  localStorage.setItem("users", JSON.stringify(users));
}

function toggleRegister() {
  let registerSection = document.getElementById("registerSection");
  let loginSection = document.getElementById("loginSection");
  let authTitle = document.getElementById("authTitle");

  let showingRegister = !registerSection.classList.contains("hidden");
  if (showingRegister) {
    registerSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    authTitle.textContent = `${APP_NAME} Login`;
  } else {
    loginSection.classList.add("hidden");
    registerSection.classList.remove("hidden");
    authTitle.textContent = `Create ${APP_NAME} Account`;
  }
}

// LOGIN
function login() {
  let u = username.value.trim();
  let p = password.value.trim();

  if (!u || !p) {
    alert("Please enter both username and password.");
    return;
  }

  if (users[u] === p) {
    loginPage.classList.add("hidden");
    app.classList.remove("hidden");
    currentUser = u;
    document.getElementById("userDisplay").textContent = u;
    showPage("analysis");
    loadHistory();
  } else {
    alert("Invalid login. Please check your username and password.");
  }
}

function showImagePreview() {
  let file = document.getElementById("imageInput").files[0];
  let preview = document.getElementById("imagePreview");
  let previewContainer = document.querySelector(".image-preview");

  if (!file || !file.type.startsWith("image/")) {
    previewContainer.classList.add("hidden");
    preview.src = "";
    return;
  }

  let reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    previewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  document.getElementById("imageInput").value = "";
  showImagePreview();
}

function isRetryableGeminiError(status, message = "") {
  let text = message.toLowerCase();
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    text.includes("high demand") ||
    text.includes("overloaded") ||
    text.includes("temporarily unavailable") ||
    text.includes("try again later")
  );
}

async function requestGemini(payload) {
  let lastError = "No Gemini model was available.";

  try {
    for (let model of GEMINI_MODELS) {
      let res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY
          },
          body: JSON.stringify(payload)
        }
      );

      let data = await res.json();
      if (!res.ok || data.error) {
        lastError = data.error?.message || JSON.stringify(data);

        if (isRetryableGeminiError(res.status, lastError)) {
          continue;
        }

        return {error: lastError};
      }

      let text = data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.output?.[0]?.content?.[0]?.text ||
        data.outputs?.[0]?.content?.[0]?.text ||
        data.output?.[0]?.content?.text ||
        data.outputs?.[0]?.content?.text ||
        null;

      if (!text) {
        lastError = JSON.stringify(data);
        continue;
      }

      return {text, model};
    }

    return {error: lastError};
  } catch (err) {
    return {error: err.message || "Network error"};
  }
}

function register() {
  let u = newUsername.value.trim();
  let p = newPassword.value.trim();
  let c = confirmPassword.value.trim();

  if (!u || !p || !c) {
    alert("Please fill all registration fields.");
    return;
  }

  if (p !== c) {
    alert("Passwords do not match.");
    return;
  }

  if (users[u]) {
    alert("That username is already taken.");
    return;
  }

  users[u] = p;
  saveUsers();
  alert("Account created successfully. You are now logged in.");

  username.value = u;
  password.value = p;
  toggleRegister();
  login();
}

function logout() {
  location.reload();
}

function showPage(page) {
  let pages = ["analysisPage", "chatPage", "historyPage"];
  pages.forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById(page + "Page").classList.remove("hidden");

  let buttons = document.querySelectorAll(".sidebar button[data-page]");
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
}

// ANALYSIS
async function analyze() {
  if (!currentUser) {
    alert("Please login or register before requesting report analysis.");
    return;
  }

  let file = document.getElementById("imageInput").files[0];
  let text = textInput.value.trim();

  if (!file && !text) {
    alert("Please upload an image or describe your dental problem to get a report.");
    return;
  }

  output.textContent = "Analyzing your dental concern...";

  let base64 = file ? await toBase64(file) : "";
  let prompt = `${DENTAL_ASSISTANT_INSTRUCTION}

Create a dental report with these sections:
1. Likely condition
2. What I noticed from the symptoms/image
3. Possible causes
4. What the patient can do today
5. Medicines or products to discuss with a dentist/pharmacist
6. What to avoid
7. When to see a dentist urgently
8. Expected recovery time

Patient details: ${text || "No written symptoms provided. Use the uploaded image if available."}`;

  let payload = {
    contents: [{
      parts: [
        {text: prompt},
        ...(base64 ? [{
          inlineData: {
            mimeType: file.type || "image/jpeg",
            data: base64.split(",")[1]
          }
        }] : [])
      ]
    }]
  };

  let result = await requestGemini(payload);
  if (result.error) {
    output.textContent = "Error: " + result.error;
    return;
  }

  output.textContent = result.text;
  saveHistory(result.text);
}

async function sendChat() {
  let msg = chatInput.value.trim();
  if (!msg) return;

  let chatBox = document.getElementById("chatBox");
  appendChatMessage(chatBox, "You", msg, "chat-user");
  chatInput.value = "";

  let payload = {
    contents: [{
      parts: [{
        text: `${DENTAL_ASSISTANT_INSTRUCTION}

Answer this patient question as a dentist-style triage response. Include urgency advice if needed.

Patient question: ${msg}`
      }]
    }]
  };
  let result = await requestGemini(payload);

  if (result.error) {
    appendChatMessage(chatBox, APP_NAME, "Error: " + result.error, "chat-error");
  } else {
    appendChatMessage(chatBox, APP_NAME, result.text, "chat-ai");
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

function appendChatMessage(chatBox, speaker, message, className) {
  let div = document.createElement("div");
  let label = document.createElement("b");

  div.className = className;
  label.textContent = speaker + ": ";
  div.appendChild(label);
  div.appendChild(document.createTextNode(message));
  chatBox.appendChild(div);
}

function saveHistory(report) {
  let history = JSON.parse(localStorage.getItem(currentUser)) || [];
  history.push(report);
  localStorage.setItem(currentUser, JSON.stringify(history));
}

function loadHistory() {
  let history = JSON.parse(localStorage.getItem(currentUser)) || [];
  let historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  history.forEach((report, index) => {
    let li = document.createElement("li");
    li.textContent = `Report ${index + 1}`;
    li.onclick = () => {
      output.textContent = report;
      showPage("analysis");
    };
    historyList.appendChild(li);
  });
}

// DOWNLOAD
function downloadReport() {
  let blob = new Blob([output.textContent], {type:"text/plain"});
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Dentiva_Care_Report.txt";
  a.click();
}

// UTIL
function toBase64(file){
  return new Promise(res=>{
    let reader=new FileReader();
    reader.readAsDataURL(file);
    reader.onload=()=>res(reader.result);
  });
}
