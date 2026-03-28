// =====================================================
//  Recyclix AI — Backend Server
//  Using Google Gemini API (Free, no card needed)
// =====================================================
 
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
 
const app = express();
const PORT = process.env.PORT || 3000;

// ── Database Setup ──────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'scans.db'), (err) => {
    if (err) console.error('Database opening error: ', err);
    else console.log('✅ Connected to SQLite scans.db');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city TEXT,
        label TEXT,
        category TEXT,
        confidence REAL,
        advice TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});
 
// ── Middleware ──────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('.'));
 
// ── Health Check Route ───────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Recyclix AI server is running!' });
});
 
// ── Dashboard Stats Route ────────────────────────────
app.get('/api/stats', (req, res) => {
    db.all(`SELECT city, category, strftime('%Y-%m', timestamp) as month, COUNT(*) as count FROM scans GROUP BY city, category, month`, [], (err, rows) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, stats: rows });
    });
});

// ── Main Classification Route (Offline Fast-Pass) ────────────────────────
app.post('/api/classify', async (req, res) => {
    // The frontend will do the vision detection (COCO-SSD) and send us the text label
    const { label, category, confidence, city } = req.body;
 
    if (!label) {
        return res.status(400).json({ error: 'No item label provided.' });
    }
    
    // Fallback Offline Advice Generator
    let advice = "";
    if (category === 'Plastic' || category === 'Paper' || category === 'Metal') {
        advice = `This belongs in the Blue Dry Waste Bin. Tip: Make sure it's clean and dry before recycling!`;
    } else if (category === 'Glass') {
        advice = `This belongs in the Green Bin. Tip: Handle with care so it doesn't shatter in the bin!`;
    } else if (category === 'Organic') {
        advice = `This belongs in the Green Wet Waste Bin. Tip: This can be composted to create rich fertilizer!`;
    } else if (category === 'E-Waste') {
        advice = `This is Hazardous E-Waste. Do not throw in regular bins! Please drop it off at a certified E-Waste collection center.`;
    } else {
        advice = `This is General Waste. Please dispose of it responsibly in the standard municipal bins.`;
    }

    try {
        console.log(`[${new Date().toISOString()}] Fast-Pass Classified: ${label} → ${category} (${confidence}%)`);
        
        // Save to Database
        db.run(`INSERT INTO scans (city, label, category, confidence, advice) VALUES (?, ?, ?, ?, ?)`, 
            [city || 'bhopal', label, category, confidence, advice], 
            function(err) {
                if (err) console.error('Error inserting into DB:', err.message);
            }
        );
 
        res.json({ success: true, advice });
 
    } catch (error) {
        console.error('Offline API Error:', error);
        res.status(500).json({ success: false, error: 'Internal service error' });
    }
});
 
// ── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n✅ Recyclix AI server is running!`);
    console.log(`👉 Open your app at: http://localhost:${PORT}`);
    console.log(`🔍 Health check at: http://localhost:${PORT}/health\n`);
});