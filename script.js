// =====================================================
//  Recyclix AI — Main Script
//  Phase 3: Auth + personal scan history + eco score
// =====================================================

import { saveScanToFirebase, getScansFromFirebase } from './firebase.js';
import { initAuth, signInWithGoogle, signInWithEmail, signUpWithEmail,
         logOut, saveScanWithUser, getUserScans,
         calculateEcoScore, getEcoLevel } from './auth.js';

// ── Config ──────────────────────────────────────────
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://your-render-app-name.onrender.com';


// ── Typewriter Effect ────────────────────────────────
const tagline = "Turning Trash into Data-Driven Insights ♻️";
const typewriterEl = document.getElementById("typewriter-text");
let charIndex = 0;

function typeWriter() {
    if (charIndex < tagline.length) {
        typewriterEl.innerHTML += tagline.charAt(charIndex);
        charIndex++;
        setTimeout(typeWriter, 50);
    }
}
setTimeout(typeWriter, 500);


// ── Dark Mode Toggle ─────────────────────────────────
const darkModeToggle = document.getElementById("darkModeToggle");
const rootHtml = document.documentElement;

darkModeToggle.addEventListener("click", () => {
    if (rootHtml.getAttribute("data-theme") === "dark") {
        rootHtml.removeAttribute("data-theme");
        darkModeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        rootHtml.setAttribute("data-theme", "dark");
        darkModeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
});


// ── Mobile Hamburger Menu ────────────────────────────
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navLinks = document.querySelector(".nav-links");

if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", () => {
        navLinks.classList.toggle("nav-open");
        const isOpen = navLinks.classList.contains("nav-open");
        hamburgerBtn.innerHTML = isOpen
            ? '<i class="fa-solid fa-xmark"></i>'
            : '<i class="fa-solid fa-bars"></i>';
    });
    document.querySelectorAll(".nav-links a").forEach(link => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("nav-open");
            hamburgerBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        });
    });
}


// ── Save Scan — Firebase first, localStorage as backup ──
async function saveScan(label, category, confidence) {
    // 1. Always save to localStorage immediately (instant, offline)
    try {
        const scans = JSON.parse(localStorage.getItem('recyclix_scans') || '[]');
        scans.push({
            label, category, confidence,
            date:  new Date().toISOString(),
            month: new Date().toLocaleString('default', { month: 'short' })
        });
        if (scans.length > 500) scans.shift();
        localStorage.setItem('recyclix_scans', JSON.stringify(scans));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }

    // 2. Also save to Firebase (persistent cloud storage)
    await saveScanToFirebase(label, category, confidence);
}


// ── Get Stats — Firebase first, localStorage as backup ──
async function getScanStats() {
    try {
        // Try Firebase first — this has ALL users' data
        const firebaseStats = await getScansFromFirebase();
        if (firebaseStats.total > 0) {
            return firebaseStats;
        }
    } catch (e) {
        console.warn('Firebase read failed, using localStorage:', e);
    }

    // Fallback to localStorage if Firebase fails
    try {
        const scans = JSON.parse(localStorage.getItem('recyclix_scans') || '[]');
        const categoryCount = {};
        const monthCount    = {};
        scans.forEach(scan => {
            categoryCount[scan.category] = (categoryCount[scan.category] || 0) + 1;
            monthCount[scan.month]       = (monthCount[scan.month] || 0) + 1;
        });
        return { scans, categoryCount, monthCount, total: scans.length };
    } catch (e) {
        return { scans: [], categoryCount: {}, monthCount: {}, total: 0 };
    }
}


// ── Groq AI Advice ─────────────────────────────────
async function getAIAdvice(wasteLabel, category, confidence) {
    const chatBubble = document.querySelector('#resultChat .ai-bubble');
    if (!chatBubble) return;

    chatBubble.innerHTML = `
        <strong>Classification Complete.</strong><br><br>
        <span style="color: var(--primary-aqua);">
            <i class="fa-solid fa-spinner fa-spin"></i> Getting AI disposal advice...
        </span>`;

    try {
        const response = await fetch(`${SERVER_URL}/api/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wasteLabel, category, confidence })
        });

        if (!response.ok) throw new Error('Server error');
        const data = await response.json();

        chatBubble.innerHTML = `
            <strong>Classification Complete.</strong><br><br>
            <span class="green-text">
                <i class="fa-solid fa-bolt"></i> ${data.advice}
            </span>`;

    } catch (error) {
        console.error('AI Advice Error:', error);
        chatBubble.innerHTML = `
            <strong>Classification Complete.</strong><br><br>
            <span class="green-text">
                <i class="fa-solid fa-info-circle"></i>
                Item identified as <strong>${wasteLabel}</strong> (${category}).
                Please check your local BMC waste disposal guidelines.
                <br><br><small style="color:#94a3b8;">⚠️ AI advice unavailable — make sure the server is running.</small>
            </span>`;
    }
}


// ── File Upload & Camera Integration ────────────────
const uploadZone     = document.getElementById("uploadZone");
const fileInput      = document.getElementById("fileInput");
const cameraInput    = document.getElementById("cameraInput");
const uploadIdle     = document.getElementById("uploadIdle");
const previewContainer = document.getElementById("previewContainer");
const imagePreview   = document.getElementById("imagePreview");
const scanLine       = document.getElementById("scanLine");
const previewOverlay = document.getElementById("previewOverlay");
const uploadLoading  = document.getElementById("uploadLoading");
const uploadResult   = document.getElementById("uploadResult");
const resultChat     = document.getElementById("resultChat");
const resultTitle    = document.getElementById("resultTitle");
const resultTags     = document.getElementById("resultTags");


// ── TensorFlow MobileNet Model ───────────────────────
let aiModel = null;
const modelStatusEl = document.querySelector('#uploadIdle h3');

// Disable upload buttons until AI is ready
const uploadFileBtn = document.querySelector('#uploadIdle .btn-primary');
const uploadCamBtn  = document.querySelector('#uploadIdle .btn-secondary');

if (uploadFileBtn) {
    uploadFileBtn.disabled = true;
    uploadFileBtn.style.opacity = "0.5";
    uploadFileBtn.style.cursor = "not-allowed";
    uploadFileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Loading...';
}
if (uploadCamBtn) {
    uploadCamBtn.disabled = true;
    uploadCamBtn.style.opacity = "0.5";
    uploadCamBtn.style.cursor = "not-allowed";
}

if (typeof mobilenet !== 'undefined') {
    mobilenet.load().then(model => {
    aiModel = model;
    console.log("✅ MobileNet AI Model Loaded Successfully!");

    // Enable buttons now that AI is ready
    if (uploadFileBtn) {
        uploadFileBtn.disabled = false;
        uploadFileBtn.style.opacity = "1";
        uploadFileBtn.style.cursor = "pointer";
        uploadFileBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload File';
    }
    if (uploadCamBtn) {
        uploadCamBtn.disabled = false;
        uploadCamBtn.style.opacity = "1";
        uploadCamBtn.style.cursor = "pointer";
    }
    if (modelStatusEl) {
        modelStatusEl.innerHTML = 'Upload Waste Image <span style="color:#22C55E; font-size:0.8rem; font-weight:600;">● AI Ready</span>';
    }
}).catch(err => {
    console.error("Model load error:", err);
    if (uploadFileBtn) {
        uploadFileBtn.disabled = false;
        uploadFileBtn.style.opacity = "1";
        uploadFileBtn.style.cursor = "pointer";
        uploadFileBtn.innerHTML = 'Reload Page';
    }
    if (modelStatusEl) {
        modelStatusEl.innerHTML = 'Upload Waste Image <span style="color:#ef4444; font-size:0.8rem;">● Failed — Reload</span>';
    }
});
}


// ── Main Image Handler ───────────────────────────────
function handleImageInput(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        uploadIdle.classList.add("hidden");
        uploadResult.classList.add("hidden");
        resultChat.classList.add("hidden");
        previewContainer.classList.remove("hidden");

        imagePreview.onload = () => {
            if (aiModel) {
                aiModel.classify(imagePreview).then(predictions => {
                    const topPrediction = predictions[0];
                    const label      = topPrediction.className.split(',')[0].trim();
                    const confidence = (topPrediction.probability * 100).toFixed(1);

                    resultTitle.innerHTML = label.charAt(0).toUpperCase() + label.slice(1);

                    // ── Waste Categorization ─────────────────────
                    const lowerLabel = label.toLowerCase();
                    let tagStyle = "background:#fefce8;color:#854d0e;";
                    let tagIcon  = "fa-trash";
                    let tagText  = "General Waste";
                    let category = "General Waste";

                    if (/(plastic|bottle|jug|cup|container|bag|wrapper|packaging)/.test(lowerLabel)) {
                        tagStyle = "background:#dbeafe;color:#1e3a8a;";
                        tagIcon  = "fa-recycle";
                        tagText  = "Plastic Recycling (Blue Bin)";
                        category = "Plastic";
                    } else if (/(paper|cardboard|carton|envelope|box|book|magazine|newspaper)/.test(lowerLabel)) {
                        tagStyle = "background:#dbeafe;color:#1e3a8a;";
                        tagIcon  = "fa-box";
                        tagText  = "Paper/Cardboard (Blue Bin)";
                        category = "Paper";
                    } else if (/(glass|jar|wine|beer|goblet|vase)/.test(lowerLabel)) {
                        tagStyle = "background:#dcfce3;color:#166534;";
                        tagIcon  = "fa-wine-glass";
                        tagText  = "Glass (Green Bin)";
                        category = "Glass";
                    } else if (/(metal|can|tin|aluminum|steel|spoon|fork|knife|pan)/.test(lowerLabel)) {
                        tagStyle = "background:#e2e8f0;color:#334155;";
                        tagIcon  = "fa-spray-can";
                        tagText  = "Metal/Aluminium (Blue Bin)";
                        category = "Metal";
                    } else if (/(apple|banana|orange|fruit|vegetable|food|plant|leaf|wood|flower|peel)/.test(lowerLabel)) {
                        tagStyle = "background:#dcfce3;color:#166534;";
                        tagIcon  = "fa-leaf";
                        tagText  = "Organic Waste (Compost)";
                        category = "Organic";
                    } else if (/(computer|laptop|phone|monitor|mouse|keyboard|screen|tv|tablet|battery|charger|circuit)/.test(lowerLabel)) {
                        tagStyle = "background:#fee2e2;color:#991b1b;";
                        tagIcon  = "fa-plug";
                        tagText  = "E-Waste / Hazardous";
                        category = "E-Waste";
                    }

                    resultTags.innerHTML = `
                        <span class="tag" style="${tagStyle}">
                            <i class="fa-solid ${tagIcon}"></i> ${tagText}
                        </span>
                        <span class="tag tag-green">
                            <i class="fa-solid fa-leaf"></i> ${confidence}% Confidence
                        </span>`;

                    // Save to Firebase + localStorage
                    saveScan(label, category, confidence);

                    setTimeout(() => {
                        uploadLoading.classList.add("hidden");
                        scanLine.classList.add("hidden");
                        previewOverlay.style.display = "none";
                        uploadResult.classList.remove("hidden");
                        resultChat.classList.remove("hidden");
                        getAIAdvice(label, category, confidence);
                    }, 1000);
                });

            } else {
                resultTitle.innerHTML = "Model loading... please wait 20 seconds and try again.";
                setTimeout(() => {
                    uploadLoading.classList.add("hidden");
                    scanLine.classList.add("hidden");
                    previewOverlay.style.display = "none";
                    uploadResult.classList.remove("hidden");
                }, 1000);
            }
        };

        imagePreview.src = e.target.result;
        scanLine.classList.remove("hidden");
        previewOverlay.style.display = "block";
        uploadLoading.classList.remove("hidden");
    };

    reader.readAsDataURL(file);
}

fileInput.addEventListener("change", handleImageInput);
cameraInput.addEventListener("change", handleImageInput);

uploadZone.addEventListener("dragover",  (e) => { e.preventDefault(); uploadZone.style.borderColor = "var(--primary-aqua)"; });
uploadZone.addEventListener("dragleave", (e) => { e.preventDefault(); uploadZone.style.borderColor = "#cbd5e1"; });
uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "#cbd5e1";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        handleImageInput({ target: fileInput });
    }
});


// ── Animated Counters ────────────────────────────────
const counters = document.querySelectorAll('.counter');
let countersAnimated = false;

const animateCounters = () => {
    counters.forEach(counter => {
        const target   = +counter.getAttribute('data-target');
        const suffix   = counter.getAttribute('data-suffix') || '';
        const duration = 2000;
        const speed    = target / (duration / 16);
        let current = 0;
        const updateCounter = () => {
            current += speed;
            if (current < target) {
                counter.innerText = target > 10000
                    ? (current / 1000000).toFixed(1) + 'M' + suffix
                    : Math.ceil(current) + suffix;
                requestAnimationFrame(updateCounter);
            } else {
                counter.innerText = target > 10000
                    ? (target / 1000000).toFixed(1) + 'M' + suffix
                    : target + suffix;
            }
        };
        updateCounter();
    });
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !countersAnimated) {
            animateCounters();
            countersAnimated = true;
        }
    });
}, { threshold: 0.5 });

const impactSection = document.getElementById('impact');
if (impactSection) observer.observe(impactSection);


// ── Chart.js Dashboard ───────────────────────────────
document.addEventListener("DOMContentLoaded", async function () {

    // staticData defined FIRST before anything uses it
    const staticData = {
        city: {
            accuracy: [85, 88, 91, 94, 96, 98],
            labels:   ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            reduced:  [180, 195, 210, 240, 260, 280],
            recycled: [90, 110, 130, 160, 185, 210]
        },
        zone: {
            accuracy: [92, 95, 96, 99],
            labels:   ["Zone 1 (MP Nagar)", "Zone 2 (New Market)", "Zone 3 (BHEL)", "Zone 4 (Kolar)"],
            reduced:  [45, 55, 60, 70],
            recycled: [30, 42, 50, 65]
        },
        trends: {
            accuracy: [80, 85, 90, 95, 97, 98, 99],
            labels:   ["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
            reduced:  [500, 600, 750, 900, 1100, 1350, 1600],
            recycled: [200, 350, 500, 700, 950, 1200, 1500]
        }
    };

    // getMergedCityData defined SECOND (needs staticData)
    function getMergedCityData(realStats) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
        const base   = staticData.city;
        const enrichedRecycled = months.map((month, i) => {
            const realCount = realStats.monthCount[month] || 0;
            return base.recycled[i] + realCount;
        });
        return {
            accuracy: base.accuracy,
            labels:   months,
            reduced:  base.reduced,
            recycled: enrichedRecycled
        };
    }

    // Fetch real stats from Firebase AFTER functions are defined
    const realStats = await getScanStats();

    let accuracyChart, reductionChart;

    function renderCharts(view) {
        const data = view === 'city' ? getMergedCityData(realStats) : staticData[view];

        if (accuracyChart) accuracyChart.destroy();
        if (reductionChart) reductionChart.destroy();

        const ctxAccuracy = document.getElementById('accuracyChart').getContext('2d');
        accuracyChart = new Chart(ctxAccuracy, {
            type: view === 'zone' ? 'bar' : 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: "Segregation Accuracy (%)",
                    data: data.accuracy,
                    borderColor: "#06B6D4",
                    backgroundColor: view === 'zone' ? "rgba(6,182,212,0.6)" : "rgba(6,182,212,0.1)",
                    borderWidth: 3,
                    tension: 0.4,
                    fill: view !== 'zone'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 70, max: 100 } }
            }
        });

        const ctxReduction = document.getElementById('reductionChart').getContext('2d');
        reductionChart = new Chart(ctxReduction, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    { label: "Mixed Solid Waste (Tons)",   data: data.reduced,  backgroundColor: "#1E3A8A", borderRadius: 4 },
                    { label: "Processed/Recycled (Tons)",  data: data.recycled, backgroundColor: "#22C55E", borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true } }
            }
        });
    }

    renderCharts('city');

    document.querySelectorAll('#dashboardTabs .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('#dashboardTabs .tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderCharts(e.target.getAttribute('data-view'));
        });
    });

    // Show total scans count in dashboard header if we have real data
    if (realStats.total > 0) {
        const dashHeader = document.querySelector('.dashboard-header p');
        if (dashHeader) {
            dashHeader.innerHTML = `Real-time analytics · <strong style="color:var(--primary-aqua)">${realStats.total} scans</strong> recorded in Firestore`;
        }
    }
});


// ── Particles Background ─────────────────────────────
const canvas = document.getElementById("particles-bg");
const ctx    = canvas.getContext("2d");
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];
const isDarkMode = () => document.documentElement.getAttribute("data-theme") === "dark";

class Particle {
    constructor() {
        this.x      = Math.random() * canvas.width;
        this.y      = Math.random() * canvas.height;
        this.size   = Math.random() * 3 + 1;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size > 0.2) this.size -= 0.01;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.x    = Math.random() * canvas.width;
            this.y    = Math.random() * canvas.height;
            this.size = Math.random() * 3 + 1;
        }
    }
    draw() {
        ctx.fillStyle = isDarkMode() ? 'rgba(6,182,212,0.4)' : 'rgba(30,58,138,0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    particlesArray = [];
    const num = (canvas.width * canvas.height) / 10000;
    for (let i = 0; i < num; i++) particlesArray.push(new Particle());
}
initParticles();

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesArray.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
}
animateParticles();

window.addEventListener("resize", () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
});

// =====================================================
//  PHASE 3 — Authentication & User Profile
// =====================================================
 
// ── Update Navbar Based on Auth State ────────────────
function updateNavbar(user) {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;
 
    if (user) {
        // User is logged in — show avatar + logout
        const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=06B6D4&color=fff`;
        navActions.innerHTML = `
            <button class="btn-dark-mode" id="darkModeToggle"><i class="fa-solid fa-moon"></i></button>
            <button class="btn-profile" id="profileBtn" onclick="showProfile()" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:0.5rem;font-weight:600;color:var(--primary-aqua);">
                <img src="${photoURL}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--primary-aqua);">
                ${user.displayName ? user.displayName.split(' ')[0] : 'Profile'}
            </button>
            <button onclick="handleLogout()" class="btn btn-secondary" style="padding:0.5rem 1rem;">
                <i class="fa-solid fa-right-from-bracket"></i> Logout
            </button>
            <button class="btn-hamburger" id="hamburgerBtn"><i class="fa-solid fa-bars"></i></button>`;
    } else {
        // Not logged in — show login button
        navActions.innerHTML = `
            <button class="btn-dark-mode" id="darkModeToggle"><i class="fa-solid fa-moon"></i></button>
            <button onclick="showAuthModal()" class="btn btn-primary">
                <i class="fa-solid fa-user"></i> Login
            </button>
            <a href="#demo" class="btn btn-primary">Try Now</a>
            <button class="btn-hamburger" id="hamburgerBtn"><i class="fa-solid fa-bars"></i></button>`;
    }
 
    // Re-attach dark mode toggle listener
    const newToggle = document.getElementById('darkModeToggle');
    if (newToggle) {
        newToggle.addEventListener('click', () => {
            if (document.documentElement.getAttribute('data-theme') === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                newToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                newToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });
    }
}
 
// ── Show Auth Modal ───────────────────────────────────
window.showAuthModal = function() {
    // Remove existing modal if any
    document.getElementById('authModal')?.remove();
 
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.6);
        z-index:9999;display:flex;align-items:center;justify-content:center;
        backdrop-filter:blur(4px);`;
 
    modal.innerHTML = `
        <div style="background:var(--glass-bg);backdrop-filter:blur(16px);
            border:1px solid var(--glass-border);border-radius:1.5rem;
            padding:2.5rem;width:90%;max-width:420px;position:relative;">
 
            <button onclick="document.getElementById('authModal').remove()"
                style="position:absolute;top:1rem;right:1rem;background:none;
                border:none;font-size:1.5rem;cursor:pointer;color:var(--text-muted);">
                <i class="fa-solid fa-xmark"></i>
            </button>
 
            <div style="text-align:center;margin-bottom:1.5rem;">
                <i class="fa-solid fa-recycle" style="font-size:2.5rem;color:var(--primary-green);"></i>
                <h2 style="font-family:var(--font-heading);margin-top:0.5rem;">Welcome to RecyclixAI</h2>
                <p style="color:var(--text-muted);font-size:0.9rem;">Login to track your eco impact</p>
            </div>
 
            <!-- Tab buttons -->
            <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;background:rgba(0,0,0,0.05);padding:0.3rem;border-radius:0.75rem;">
                <button id="loginTab" onclick="switchTab('login')"
                    style="flex:1;padding:0.6rem;border:none;border-radius:0.5rem;
                    font-weight:600;cursor:pointer;background:var(--primary-green);color:white;">
                    Login
                </button>
                <button id="signupTab" onclick="switchTab('signup')"
                    style="flex:1;padding:0.6rem;border:none;border-radius:0.5rem;
                    font-weight:600;cursor:pointer;background:transparent;color:var(--text-muted);">
                    Sign Up
                </button>
            </div>
 
            <!-- Error message -->
            <div id="authError" style="display:none;background:#fee2e2;color:#991b1b;
                padding:0.75rem;border-radius:0.75rem;margin-bottom:1rem;font-size:0.875rem;"></div>
 
            <!-- Email input -->
            <input id="authEmail" type="email" placeholder="Email address"
                style="width:100%;padding:0.75rem 1rem;border:1px solid var(--glass-border);
                border-radius:0.75rem;margin-bottom:0.75rem;font-size:1rem;
                background:var(--glass-bg);color:var(--text-dark);box-sizing:border-box;">
 
            <!-- Password input -->
            <input id="authPassword" type="password" placeholder="Password (min 6 characters)"
                style="width:100%;padding:0.75rem 1rem;border:1px solid var(--glass-border);
                border-radius:0.75rem;margin-bottom:1rem;font-size:1rem;
                background:var(--glass-bg);color:var(--text-dark);box-sizing:border-box;">
 
            <!-- Submit button -->
            <button id="authSubmitBtn" onclick="handleEmailAuth()"
                style="width:100%;padding:0.85rem;background:var(--primary-green);
                color:white;border:none;border-radius:0.75rem;font-size:1rem;
                font-weight:600;cursor:pointer;margin-bottom:1rem;">
                Login
            </button>
 
            <!-- Divider -->
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
                <div style="flex:1;height:1px;background:var(--glass-border);"></div>
                <span style="color:var(--text-muted);font-size:0.875rem;">or</span>
                <div style="flex:1;height:1px;background:var(--glass-border);"></div>
            </div>
 
            <!-- Google button -->
            <button onclick="handleGoogleAuth()"
                style="width:100%;padding:0.85rem;background:white;color:#374151;
                border:1px solid #e5e7eb;border-radius:0.75rem;font-size:1rem;
                font-weight:600;cursor:pointer;display:flex;align-items:center;
                justify-content:center;gap:0.75rem;">
                <img src="https://www.google.com/favicon.ico" style="width:18px;height:18px;">
                Continue with Google
            </button>
        </div>`;
 
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};
 
// ── Switch Login / Signup Tab ─────────────────────────
window.switchTab = function(tab) {
    const isLogin = tab === 'login';
    document.getElementById('loginTab').style.background  = isLogin ? 'var(--primary-green)' : 'transparent';
    document.getElementById('loginTab').style.color       = isLogin ? 'white' : 'var(--text-muted)';
    document.getElementById('signupTab').style.background = !isLogin ? 'var(--primary-green)' : 'transparent';
    document.getElementById('signupTab').style.color      = !isLogin ? 'white' : 'var(--text-muted)';
    document.getElementById('authSubmitBtn').innerText    = isLogin ? 'Login' : 'Create Account';
    document.getElementById('authError').style.display   = 'none';
    window._authTab = tab;
};
window._authTab = 'login';
 
// ── Handle Email Auth ────────────────────────────────
window.handleEmailAuth = async function() {
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorEl  = document.getElementById('authError');
    const btn      = document.getElementById('authSubmitBtn');
 
    if (!email || !password) {
        errorEl.style.display = 'block';
        errorEl.textContent   = 'Please enter your email and password.';
        return;
    }
 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Please wait...';
    btn.disabled  = true;
 
    const result = window._authTab === 'login'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);
 
    if (result.success) {
        document.getElementById('authModal')?.remove();
    } else {
        errorEl.style.display = 'block';
        errorEl.textContent   = result.error;
        btn.innerHTML = window._authTab === 'login' ? 'Login' : 'Create Account';
        btn.disabled  = false;
    }
};
 
// ── Handle Google Auth ───────────────────────────────
window.handleGoogleAuth = async function() {
    const result = await signInWithGoogle();
    if (result.success) {
        document.getElementById('authModal')?.remove();
    } else {
        const errorEl = document.getElementById('authError');
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent   = result.error;
        }
    }
};
 
// ── Handle Logout ─────────────────────────────────────
window.handleLogout = async function() {
    await logOut();
};
 
// ── Show Profile Page ─────────────────────────────────
window.showProfile = async function() {
    const { currentUser: user } = await import('./auth.js');
    if (!user) { showAuthModal(); return; }
 
    const scans    = await getUserScans();
    const score    = calculateEcoScore(scans);
    const ecoLevel = getEcoLevel(score);
    const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=06B6D4&color=fff&size=128`;
 
    // Count categories
    const catCount = {};
    scans.forEach(s => { catCount[s.category] = (catCount[s.category] || 0) + 1; });
    const topCategory = Object.entries(catCount).sort((a,b) => b[1]-a[1])[0];
 
    // Build scan history rows
    const historyRows = scans.slice(0, 10).map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:0.75rem;border-bottom:1px solid var(--glass-border);font-size:0.875rem;">
            <span><i class="fa-solid fa-leaf" style="color:var(--primary-green);margin-right:0.5rem;"></i>${s.label}</span>
            <span style="color:var(--text-muted);">${s.category}</span>
            <span style="color:var(--text-muted);">${s.month} ${s.year}</span>
        </div>`).join('');
 
    document.getElementById('profileModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;
        display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);
        overflow-y:auto;padding:1rem;`;
 
    modal.innerHTML = `
        <div style="background:var(--glass-bg);backdrop-filter:blur(16px);
            border:1px solid var(--glass-border);border-radius:1.5rem;
            padding:2.5rem;width:90%;max-width:560px;position:relative;">
 
            <button onclick="document.getElementById('profileModal').remove()"
                style="position:absolute;top:1rem;right:1rem;background:none;
                border:none;font-size:1.5rem;cursor:pointer;color:var(--text-muted);">
                <i class="fa-solid fa-xmark"></i>
            </button>
 
            <!-- Profile header -->
            <div style="text-align:center;margin-bottom:2rem;">
                <img src="${photoURL}" style="width:80px;height:80px;border-radius:50%;
                    border:3px solid var(--primary-aqua);margin-bottom:1rem;">
                <h2 style="font-family:var(--font-heading);margin:0;">
                    ${user.displayName || 'User'}
                </h2>
                <p style="color:var(--text-muted);margin:0.25rem 0;">${user.email}</p>
                <span style="background:rgba(6,182,212,0.1);color:var(--primary-aqua);
                    padding:0.3rem 1rem;border-radius:2rem;font-size:0.875rem;font-weight:600;">
                    ${ecoLevel.icon} ${ecoLevel.level}
                </span>
            </div>
 
            <!-- Stats cards -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:2rem;">
                <div style="background:rgba(34,197,94,0.1);border-radius:1rem;padding:1rem;text-align:center;">
                    <div style="font-size:1.75rem;font-weight:700;color:var(--primary-green);">${score}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">Eco Score</div>
                </div>
                <div style="background:rgba(6,182,212,0.1);border-radius:1rem;padding:1rem;text-align:center;">
                    <div style="font-size:1.75rem;font-weight:700;color:var(--primary-aqua);">${scans.length}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">Total Scans</div>
                </div>
                <div style="background:rgba(30,58,138,0.1);border-radius:1rem;padding:1rem;text-align:center;">
                    <div style="font-size:1.75rem;font-weight:700;color:var(--primary-blue);">
                        ${Object.keys(catCount).length}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">Categories</div>
                </div>
            </div>
 
            ${topCategory ? `
            <div style="background:rgba(34,197,94,0.08);border-radius:1rem;padding:1rem;
                margin-bottom:1.5rem;display:flex;align-items:center;gap:0.75rem;">
                <i class="fa-solid fa-trophy" style="color:#eab308;font-size:1.5rem;"></i>
                <div>
                    <div style="font-weight:600;">Top category: ${topCategory[0]}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">
                        You've scanned ${topCategory[1]} ${topCategory[0]} items
                    </div>
                </div>
            </div>` : ''}
 
            <!-- Scan history -->
            <h3 style="font-family:var(--font-heading);margin-bottom:1rem;">
                <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary-aqua);"></i>
                Recent Scans
            </h3>
            <div style="border:1px solid var(--glass-border);border-radius:1rem;overflow:hidden;">
                ${historyRows || '<div style="padding:1rem;text-align:center;color:var(--text-muted);">No scans yet — start scanning!</div>'}
            </div>
        </div>`;
 
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};
 
// ── Initialize Auth on Page Load ─────────────────────
initAuth(
    (user) => {
        // User logged in
        console.log(" Logged in:", user.displayName || user.email);
        updateNavbar(user);
    },
    () => {
        // User logged out
        console.log(" Logged out");
        updateNavbar(null);
    }
);