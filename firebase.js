// =====================================================
//  Recyclix AI — Firebase Configuration
//  Complete file — ready to use, no changes needed
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config (your real project values) ───────
const firebaseConfig = {
    apiKey:            "AIzaSyC7RQgZNjvL30ckXviMIzyH2w0mXHD7pW8",
    authDomain:        "recyclix-ai.firebaseapp.com",
    projectId:         "recyclix-ai",
    storageBucket:     "recyclix-ai.firebasestorage.app",
    messagingSenderId: "257417711055",
    appId:             "1:257417711055:web:29685eb719a4e6336656ba"
};

// ── Initialize Firebase ──────────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── Save a scan to Firestore ─────────────────────────
export async function saveScanToFirebase(label, category, confidence) {
    try {
        await addDoc(collection(db, "scans"), {
            label:      label,
            category:   category,
            confidence: confidence,
            month:      new Date().toLocaleString('default', { month: 'short' }),
            year:       new Date().getFullYear(),
            timestamp:  new Date().toISOString(),
            city:       "Bhopal"
        });
        console.log("✅ Scan saved to Firebase:", label);
    } catch (error) {
        console.error("❌ Firebase save error:", error);
    }
}

// ── Get all scans from Firestore ─────────────────────
export async function getScansFromFirebase() {
    try {
        const q = query(
            collection(db, "scans"),
            orderBy("timestamp", "desc"),
            limit(1000)
        );
        const snapshot = await getDocs(q);

        const scans         = [];
        const categoryCount = {};
        const monthCount    = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            scans.push(data);
            categoryCount[data.category] = (categoryCount[data.category] || 0) + 1;
            monthCount[data.month]       = (monthCount[data.month] || 0) + 1;
        });

        return { scans, categoryCount, monthCount, total: scans.length };

    } catch (error) {
        console.error("❌ Firebase read error:", error);
        return { scans: [], categoryCount: {}, monthCount: {}, total: 0 };
    }
}