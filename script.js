// =====================================================
//  Recyclix AI — Main Script
//  Updated with: Claude API chat, localStorage
//  analytics, and mobile hamburger menu
// =====================================================

// ── Config ──────────────────────────────────────────
// If running locally: http://localhost:3000
// After deploying backend on Render: replace with your Render URL
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://your-render-app-name.onrender.com'; // ← Replace this after deploying


// --- Typewriter Effect ---
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


// --- Dark Mode Toggle ---
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

    // Close menu when any nav link is clicked
    document.querySelectorAll(".nav-links a").forEach(link => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("nav-open");
            hamburgerBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        });
    });
}


// ── LocalStorage Analytics Helpers ──────────────────
// Saves every scan so the dashboard charts can use real data

function saveScanResult(label, category) {
    try {
        const scans = JSON.parse(localStorage.getItem('recyclix_scans') || '[]');
        scans.push({
            label,
            category,
            date: new Date().toISOString(),
            month: new Date().toLocaleString('default', { month: 'short' })
        });
        // Keep only last 500 scans to avoid filling up storage
        if (scans.length > 500) scans.shift();
        localStorage.setItem('recyclix_scans', JSON.stringify(scans));
    } catch (e) {
        console.warn('Could not save scan to localStorage:', e);
    }
}

function getScanStats() {
    try {
        const scans = JSON.parse(localStorage.getItem('recyclix_scans') || '[]');
        const categoryCount = {};
        const monthCount = {};

        scans.forEach(scan => {
            categoryCount[scan.category] = (categoryCount[scan.category] || 0) + 1;
            monthCount[scan.month] = (monthCount[scan.month] || 0) + 1;
        });

        return { scans, categoryCount, monthCount, total: scans.length };
    } catch (e) {
        return { scans: [], categoryCount: {}, monthCount: {}, total: 0 };
    }
}


// ── Offline Backend Call ───────────────────────────
async function getAIVisionAdvice(label, category, confidence) {
    const chatBubble = document.querySelector('#resultChat .ai-bubble');
    if (!chatBubble) return;

    chatBubble.innerHTML = `
        <strong>Processing Local AI...</strong><br><br>
        <span style="color: var(--primary-aqua);">
            <i class="fa-solid fa-spinner fa-spin"></i> Checking disposal guidelines...
        </span>`;

    try {
        const selectedCity = document.getElementById('citySelect') ? document.getElementById('citySelect').value : 'bhopal';
        const response = await fetch(`${SERVER_URL}/api/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, category, confidence, city: selectedCity })
        });

        if (!response.ok) throw new Error('Server error');

        const data = await response.json();

        chatBubble.innerHTML = `
            <strong>Classification Complete.</strong><br><br>
            <span class="green-text">
                <i class="fa-solid fa-bolt"></i> ${data.advice}
            </span>`;
            
        if (typeof window.loadStatsFromDB === 'function') window.loadStatsFromDB();

    } catch (error) {
        console.error('Offline Advice Error:', error);
        chatBubble.innerHTML = `
            <strong>Classification Complete.</strong><br><br>
            <span class="green-text">
                <small style="color: #94a3b8;">Local classification passed but server failed to respond.</small>
            </span>`;
    }
}


// --- File Upload & Camera Integration ---
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const cameraInput = document.getElementById("cameraInput");
const uploadIdle = document.getElementById("uploadIdle");
const previewContainer = document.getElementById("previewContainer");
const imagePreview = document.getElementById("imagePreview");
const scanLine = document.getElementById("scanLine");
const previewOverlay = document.getElementById("previewOverlay");
const uploadLoading = document.getElementById("uploadLoading");
const uploadResult = document.getElementById("uploadResult");
const resultChat = document.getElementById("resultChat");
const resultTitle = document.getElementById("resultTitle");
const resultTags = document.getElementById("resultTags");

// --- TensorFlow.js COCO-SSD Model (Object Detection) ---
let aiModel = null;
if (typeof cocoSsd !== 'undefined') {
    cocoSsd.load().then(model => {
        aiModel = model;
        console.log("COCO-SSD AI Model Loaded Successfully!");
    }).catch(err => console.error("Model load error:", err));
}



// ── Main Image Handler ───────────────────────────────
function handleImageInput(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        // Reset UI state
        uploadIdle.classList.add("hidden");
        uploadResult.classList.add("hidden");
        resultChat.classList.add("hidden");
        previewContainer.classList.remove("hidden");

        const detectionCanvas = document.getElementById('detectionCanvas');
        const ctx = detectionCanvas ? detectionCanvas.getContext('2d') : null;

        imagePreview.onload = () => {
            if (aiModel) {
                // Ensure canvas matches image's natural dimensions and container scales both equally
                imagePreview.style.objectFit = 'contain';
                if (detectionCanvas) {
                    detectionCanvas.style.objectFit = 'contain';
                    detectionCanvas.width = imagePreview.naturalWidth;
                    detectionCanvas.height = imagePreview.naturalHeight;
                }

                aiModel.detect(imagePreview).then(predictions => {
                    if (ctx && detectionCanvas) {
                        ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
                    }

                    if (predictions.length === 0) {
                        // Fallback if nothing detected
                        predictions = [{ class: 'mixed waste', score: 0.50, bbox: [10, 10, (detectionCanvas?.width || 200) - 20, (detectionCanvas?.height || 200) - 20] }];
                    }

                    if (ctx) {
                        // Draw bounding boxes for all predictions
                        predictions.forEach(pred => {
                            ctx.beginPath();
                            ctx.rect(...pred.bbox);
                            ctx.lineWidth = 4;
                            ctx.strokeStyle = '#06B6D4'; // Aqua
                            ctx.stroke();

                            ctx.fillStyle = '#06B6D4';
                            ctx.font = 'bold 18px sans-serif';
                            const text = `${pred.class} (${(pred.score * 100).toFixed(0)}%)`;
                            const textWidth = ctx.measureText(text).width;
                            ctx.fillRect(pred.bbox[0], pred.bbox[1] > 25 ? pred.bbox[1] - 25 : 0, textWidth + 10, 25);
                            ctx.fillStyle = '#fff';
                            ctx.fillText(text, pred.bbox[0] + 5, pred.bbox[1] > 25 ? pred.bbox[1] - 7 : 18);
                        });
                    }

                    const topPrediction = predictions[0];
                    const label = topPrediction.class;
                    const confidence = (topPrediction.score * 100).toFixed(1);

                    // ── Offline Custom Categorization Logic ───────────────
                    const lowerLabel = label.toLowerCase();
                    let tagStyle = "background: #fefce8; color: #854d0e;";
                    let tagIcon  = "fa-trash";
                    let tagText  = "General Waste";
                    let category = "General Waste";

                    if (/(plastic|bottle|jug|cup|container|bag|wrapper|packaging)/.test(lowerLabel)) {
                        tagStyle = "background: #dbeafe; color: #1e3a8a;";
                        tagIcon  = "fa-recycle";
                        tagText  = "Plastic Recycling (Blue Bin)";
                        category = "Plastic";
                    } else if (/(paper|cardboard|carton|envelope|box|book|magazine|newspaper)/.test(lowerLabel)) {
                        tagStyle = "background: #dbeafe; color: #1e3a8a;";
                        tagIcon  = "fa-box";
                        tagText  = "Paper/Cardboard (Blue Bin)";
                        category = "Paper";
                    } else if (/(glass|jar|wine|beer|goblet|vase)/.test(lowerLabel)) {
                        tagStyle = "background: #dcfce3; color: #166534;";
                        tagIcon  = "fa-wine-glass";
                        tagText  = "Glass (Green Bin)";
                        category = "Glass";
                    } else if (/(metal|can|tin|aluminum|steel|spoon|fork|knife|pan)/.test(lowerLabel)) {
                        tagStyle = "background: #e2e8f0; color: #334155;";
                        tagIcon  = "fa-spray-can";
                        tagText  = "Metal/Aluminium (Blue Bin)";
                        category = "Metal";
                    } else if (/(apple|banana|orange|fruit|vegetable|food|plant|leaf|wood|flower|peel)/.test(lowerLabel)) {
                        tagStyle = "background: #dcfce3; color: #166534;";
                        tagIcon  = "fa-leaf";
                        tagText  = "Organic Waste (Compost)";
                        category = "Organic";
                    } else if (/(computer|laptop|phone|monitor|mouse|keyboard|screen|tv|tablet|battery|charger|circuit)/.test(lowerLabel)) {
                        tagStyle = "background: #fee2e2; color: #991b1b;";
                        tagIcon  = "fa-plug";
                        tagText  = "E-Waste / Hazardous";
                        category = "E-Waste";
                    }
                    
                    const titleStr = label.charAt(0).toUpperCase() + label.slice(1);
                    resultTitle.innerHTML = titleStr;

                    let htmlTags = `<span class="tag" style="${tagStyle}"><i class="fa-solid ${tagIcon}"></i> ${tagText}</span>`;
                    htmlTags += `<span class="tag tag-green"><i class="fa-solid fa-leaf"></i> ${confidence}% Confidence</span>`;
                    resultTags.innerHTML = htmlTags;
                    
                    setTimeout(() => {
                        uploadLoading.classList.add("hidden");
                        scanLine.classList.add("hidden");
                        previewOverlay.style.display = "none";
                        uploadResult.classList.remove("hidden");
                        resultChat.classList.remove("hidden");

                        getAIVisionAdvice(titleStr, category, confidence);
                    }, 500);
                });

            } else {
                // Model hasn't loaded yet, fallback to offline default
                console.warn("Model not ready. Falling back to default.");
                resultTitle.innerHTML = "Mixed Waste (Offline Demo)";
                resultTags.innerHTML = `<span class="tag" style="background: #fefce8; color: #854d0e;"><i class="fa-solid fa-trash"></i> General Waste</span>`;
                
                setTimeout(() => {
                    uploadLoading.classList.add("hidden");
                    scanLine.classList.add("hidden");
                    previewOverlay.style.display = "none";
                    uploadResult.classList.remove("hidden");
                    resultChat.classList.remove("hidden");

                    getAIVisionAdvice("Mixed Waste", "General Waste", "50.0");
                }, 500);
            }
        };

            // Set src and display scan-line immediately
            imagePreview.src = e.target.result;
            scanLine.classList.remove("hidden");
            previewOverlay.style.display = "block";
            uploadLoading.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
    }


fileInput.addEventListener("change", handleImageInput);
cameraInput.addEventListener("change", handleImageInput);

// Drag and drop support
uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault(); 
    uploadZone.style.borderColor = "var(--primary-aqua)"; 
});
uploadZone.addEventListener("dragleave", (e) => { 
    e.preventDefault(); 
    uploadZone.style.borderColor = "#cbd5e1"; 
});
uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "#cbd5e1";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        handleImageInput({target: fileInput});
    }
});

// --- Animated Counters (Intersection Observer) ---
const counters = document.querySelectorAll('.counter');
let countersAnimated = false;

const animateCounters = () => {
    counters.forEach(counter => {
        const target = +counter.getAttribute('data-target');
        const suffix = counter.getAttribute('data-suffix') || '';
        const duration = 2000;
        const speed = target / (duration / 16); // 60fps
        
        let current = 0;
        const updateCounter = () => {
            current += speed;
            if (current < target) {
                // If the number is large, format it
                if (target > 10000) {
                    counter.innerText = (current / 1000000).toFixed(1) + 'M' + suffix;
                } else {
                    counter.innerText = Math.ceil(current) + suffix;
                }
                requestAnimationFrame(updateCounter);
            } else {
                if (target > 10000) {
                    counter.innerText = (target / 1000000).toFixed(1) + 'M' + suffix;
                } else {
                    counter.innerText = target + suffix;
                }
            }
        };
        updateCounter();
    });
};

const observerOptions = {
    threshold: 0.5
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !countersAnimated) {
            animateCounters();
            countersAnimated = true;
        }
    });
}, observerOptions);

const impactSection = document.getElementById('impact');
if (impactSection) {
    observer.observe(impactSection);
}

// --- Chart.js Initializations ---
document.addEventListener("DOMContentLoaded", function() {
    
    // Dataset for multi-city stats
    const allCitiesData = {
        bhopal: {
            city: {
                accuracy: [85, 88, 91, 94, 96, 98],
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                reduced: [180, 195, 210, 240, 260, 280],
                recycled: [90, 110, 130, 160, 185, 210]
            },
            zone: {
                accuracy: [92, 95, 96, 99],
                labels: ["Zone 1 (MP Nagar)", "Zone 2 (New Market)", "Zone 3 (BHEL)", "Zone 4 (Kolar)"],
                reduced: [45, 55, 60, 70],
                recycled: [30, 42, 50, 65]
            },
            trends: {
                accuracy: [80, 85, 90, 95, 97, 98, 99],
                labels: ["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
                reduced: [500, 600, 750, 900, 1100, 1350, 1600],
                recycled: [200, 350, 500, 700, 950, 1200, 1500]
            }
        },
        indore: {
            city: {
                accuracy: [92, 94, 96, 97, 98, 99],
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                reduced: [220, 240, 250, 275, 290, 310],
                recycled: [140, 165, 180, 205, 225, 250]
            },
            zone: {
                accuracy: [96, 97, 98, 99],
                labels: ["Vijaynagar", "Palasia", "Rajwada", "Bhawarkuan"],
                reduced: [60, 70, 85, 95],
                recycled: [45, 55, 65, 80]
            },
            trends: {
                accuracy: [88, 90, 93, 96, 98, 98, 99],
                labels: ["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
                reduced: [600, 750, 900, 1050, 1250, 1450, 1700],
                recycled: [350, 500, 650, 850, 1050, 1300, 1600]
            }
        },
        surat: {
            city: {
                accuracy: [80, 83, 85, 88, 91, 94],
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                reduced: [160, 175, 190, 210, 230, 250],
                recycled: [70, 85, 100, 130, 160, 190]
            },
            zone: {
                accuracy: [85, 88, 90, 92],
                labels: ["Adajan", "Vesu", "Katargam", "Varachha"],
                reduced: [35, 45, 50, 60],
                recycled: [20, 30, 40, 50]
            },
            trends: {
                accuracy: [75, 78, 82, 86, 90, 93, 95],
                labels: ["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
                reduced: [400, 500, 650, 800, 950, 1150, 1400],
                recycled: [150, 250, 400, 550, 750, 950, 1200]
            }
        },
        pune: {
            city: {
                accuracy: [88, 90, 92, 95, 96, 97],
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                reduced: [200, 220, 240, 260, 280, 300],
                recycled: [110, 130, 150, 180, 205, 230]
            },
            zone: {
                accuracy: [90, 93, 95, 96],
                labels: ["Kothrud", "Hinjewadi", "Viman Nagar", "Kalyani Nagar"],
                reduced: [50, 60, 75, 80],
                recycled: [35, 45, 55, 65]
            },
            trends: {
                accuracy: [82, 85, 88, 92, 95, 96, 97],
                labels: ["2020", "2021", "2022", "2023", "2024", "2025", "2026"],
                reduced: [550, 650, 800, 950, 1150, 1350, 1550],
                recycled: [250, 400, 550, 750, 950, 1150, 1400]
            }
        }
    };

    let currentCity = 'bhopal';
    let currentView = 'city';

    const citySelect = document.getElementById('citySelect');
    if (citySelect) {
        citySelect.addEventListener('change', function(e) {
            currentCity = e.target.value;
            renderCharts(currentView);
        });
    }

    // ── Load Stats from Database ────────────────────────────────────
    window.dbStats = [];
    window.loadStatsFromDB = async function() {
        try {
            const res = await fetch(`${SERVER_URL}/api/stats`);
            const data = await res.json();
            if (data.success) {
                window.dbStats = data.stats;
                renderCharts(currentView);
            }
        } catch(e) { console.error('Error fetching stats:', e); }
    };
    
    // Call on load
    window.loadStatsFromDB();

    // ── Merge real scan data from SQLite DB into city view ──
    function getMergedCityData() {
        const stats  = window.dbStats || [];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
        const base   = allCitiesData[currentCity].city;

        // Add real scan counts from DB
        const enrichedRecycled = months.map((month, i) => {
            let realCount = 0;
            // For demo purposes, we will add all DB counts for this city to the current month (June = index 5)
            if (i === months.length - 1) {
                realCount = stats.filter(s => s.city.toLowerCase() === currentCity.toLowerCase())
                                 .reduce((acc, curr) => acc + curr.count, 0);
            }
            return base.recycled[i] + realCount;
        });

        return {
            accuracy: base.accuracy,
            labels:   months,
            reduced:  base.reduced,
            recycled: enrichedRecycled
        };
    }
    
    let accuracyChart, reductionChart;

    function renderCharts(view) {
        currentView = view;
        const data = view === 'city' ? getMergedCityData() : allCitiesData[currentCity][view];
        
        // Destroy existing to prevent overlap
        if(accuracyChart) accuracyChart.destroy();
        if(reductionChart) reductionChart.destroy();

        // Accuracy Chart
        const ctxAccuracy = document.getElementById('accuracyChart').getContext('2d');
        accuracyChart = new Chart(ctxAccuracy, {
            type: view === 'zone' ? 'bar' : 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: "Segregation Accuracy (%)",
                    data: data.accuracy,
                    borderColor: "#06B6D4",
                    backgroundColor: view === 'zone' ? "rgba(6, 182, 212, 0.6)" : "rgba(6, 182, 212, 0.1)",
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

        // Processing Chart
        const ctxReduction = document.getElementById('reductionChart').getContext('2d');
        reductionChart = new Chart(ctxReduction, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: "Mixed Solid Waste (Tons)",
                        data: data.reduced,
                        backgroundColor: "#1E3A8A",
                        borderRadius: 4
                    },
                    {
                        label: "Processed/Recycled (Tons)",
                        data: data.recycled,
                        backgroundColor: "#22C55E",
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true } }
            }
        });
    }

    // Initial render
    renderCharts('city');

    // Dashboard Tabs Logic
    const tabs = document.querySelectorAll('#dashboardTabs .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderCharts(e.target.getAttribute('data-view'));
        });
    });
});

// --- Interactive Particles Background ---
const canvas = document.getElementById("particles-bg");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];
const isDarkMode = () => document.documentElement.getAttribute("data-theme") === "dark";

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size > 0.2) this.size -= 0.01;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 3 + 1;
        }
    }
    draw() {
        ctx.fillStyle = isDarkMode() ? 'rgba(6, 182, 212, 0.4)' : 'rgba(30, 58, 138, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    particlesArray = [];
    let numParticles = (canvas.width * canvas.height) / 10000;
    for (let i = 0; i < numParticles; i++) {
        particlesArray.push(new Particle());
    }
}
initParticles();

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
    }
    requestAnimationFrame(animateParticles);
}
animateParticles();

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
});
