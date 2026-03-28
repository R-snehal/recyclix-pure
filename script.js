// =====================================================
//  Recyclix AI — Main Script
//  Phase 2: Firebase Firestore integration
//  localStorage kept as offline fallback
// =====================================================

import { saveScanToFirebase, getScansFromFirebase } from './firebase.js';

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


// ── Gemini AI Advice ─────────────────────────────────
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
    uploadFileBtn.innerText = "AI Loading...";
}
if (uploadCamBtn) {
    uploadCamBtn.disabled = true;
    uploadCamBtn.style.opacity = "0.5";
}

if (typeof mobilenet !== 'undefined') {
    mobilenet.load().then(model => {
    aiModel = model;
    console.log("✅ MobileNet AI Model Loaded Successfully!");

    // Re-enable buttons now that AI is ready
    if (uploadFileBtn) {
        uploadFileBtn.disabled = false;
        uploadFileBtn.style.opacity = "1";
        uploadFileBtn.style.cursor = "pointer";
        uploadFileBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload File';
    }
    if (uploadCamBtn) {
        uploadCamBtn.disabled = false;
        uploadCamBtn.style.opacity = "1";
    }
    if (modelStatusEl) {
        modelStatusEl.innerHTML = 'Upload Waste Image <span style="color:#22C55E;font-size:0.8rem;font-weight:500;">● AI Ready</span>';
    }
}).catch(err => {
    console.error("Model load error:", err);
    if (uploadFileBtn) {
        uploadFileBtn.innerText = "Reload Page";
        uploadFileBtn.disabled = false;
        uploadFileBtn.style.opacity = "1";
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