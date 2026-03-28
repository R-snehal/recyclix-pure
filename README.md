# ♻️ Recyclix AI — GenAI Waste Segregation System

> Turning Trash into Data-Driven Insights using Computer Vision + Claude AI

A smart web application that automatically classifies waste from images using TensorFlow.js MobileNet, then uses the Gemini AI to provide intelligent disposal advice and recycling recommendations — built for Bhopal Smart City.

---

## 🌟 Features

- 📸 **Live Image Classification** — Upload or capture waste photos; MobileNet AI classifies them instantly
- 📊 **Smart Dashboard** — Real-time charts tracking waste categories and recycling stats for Bhopal
- 🌙 **Dark Mode** — Full dark/light theme toggle
- 📱 **Mobile Responsive** — Works on phones and tablets with camera capture
- ✨ **Particle Animation** — Interactive background that adapts to theme

---

## 📁 Project Structure

```
recyclix-ai/
├── index.html        ← Main webpage (all sections)
├── style.css         ← All styling including dark mode & mobile
├── script.js         ← All frontend logic (AI, charts, animations)
├── server.js         ← Node.js backend (handles Claude API calls)
├── package.json      ← Project dependencies
├── .env              ← Your secret API key (DO NOT COMMIT)
├── .env.example      ← Template for .env (safe to commit)
├── .gitignore        ← Tells Git what NOT to upload
└── README.md         ← This file
```

---

## 🚀 How to Run Locally (Step by Step)

### Step 1 — Install Node.js
Download from https://nodejs.org (choose the LTS version)

### Step 2 — Clone or Download this Project
```bash
git clone https://github.com/your-username/recyclix-ai.git
cd recyclix-ai
```

### Step 3 — Install Dependencies
```bash
npm install
```
This reads `package.json` and installs Express, Anthropic SDK etc. into a `node_modules/` folder.

### Step 4 — Create your `.env` file
```bash
cp .env.example .env
```
Then open `.env` in any text editor and replace `your_claude_api_key_here` with your actual key from https://console.anthropic.com

### Step 5 — Start the Server
```bash
npm start
```
You should see:
```
✅ Recyclix AI server is running!
👉 Open your app at: http://localhost:3000
```

### Step 6 — Open in Browser
Go to **http://localhost:3000** — the full app loads from there.

---

## 🧠 How It Works

```
User uploads image
       ↓
TensorFlow MobileNet classifies it in the browser
       ↓
script.js sends label to server.js (POST /api/classify)
       ↓
server.js calls GEMINI API with the label
       ↓
Gemini returns disposal advice
       ↓
advice shown in chat bubble on the right
       ↓
scan saved to localStorage → updates dashboard charts
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| AI Classification | TensorFlow.js + MobileNet |
| GenAI Reasoning | Gemini |
| Charts | Chart.js |
| Backend | Node.js + Express |
| Icons | Font Awesome 6 |
| Fonts | Google Fonts (Montserrat + Open Sans) |

---

## 📊 Datasets Referenced

- **TrashNet** — Stanford dataset with 2,527 images across 6 categories
- **TACO** — Trash Annotations in Context (real-world images)
- **WasteNet** — Municipal solid waste dataset

---

## 🔐 Security Notes

- Your `GEMINI_API_KEY` is stored in `.env` and **never** sent to the frontend
- The `.gitignore` file ensures `.env` is never uploaded to GitHub
- All Claude API calls happen server-side in `server.js`

---

## 👥 Team

Built as a GenAI Smart City Project for Bhopal Municipal Corporation.

---

## 📄 License

MIT — free to use, modify, and distribute.
