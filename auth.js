// =====================================================
//  Recyclix AI — Authentication
//  Google + Email/Password via Firebase Auth
// =====================================================

import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup,
         createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Firebase config ───────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyC7RQgZNjvL30ckXviMIzyH2w0mXHD7pW8",
    authDomain:        "recyclix-ai.firebaseapp.com",
    projectId:         "recyclix-ai",
    storageBucket:     "recyclix-ai.firebasestorage.app",
    messagingSenderId: "257417711055",
    appId:             "1:257417711055:web:29685eb719a4e6336656ba"
};

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// ── Export db so firebase.js can also use same instance ──
export { db };

// ── Current logged in user (null if not logged in) ───
export let currentUser = null;

// ── Watch auth state changes ─────────────────────────
// This runs automatically whenever user logs in or out
export function initAuth(onLogin, onLogout) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            onLogin(user);
        } else {
            currentUser = null;
            onLogout();
        }
    });
}

// ── Google Sign In ────────────────────────────────────
export async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return { success: true, user: result.user };
    } catch (error) {
        console.error("Google sign in error:", error.message);
        return { success: false, error: error.message };
    }
}

// ── Email Sign Up ─────────────────────────────────────
export async function signUpWithEmail(email, password) {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return { success: true, user: result.user };
    } catch (error) {
        console.error("Email sign up error:", error.message);
        return { success: false, error: getFriendlyError(error.code) };
    }
}

// ── Email Sign In ─────────────────────────────────────
export async function signInWithEmail(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: result.user };
    } catch (error) {
        console.error("Email sign in error:", error.message);
        return { success: false, error: getFriendlyError(error.code) };
    }
}

// ── Sign Out ──────────────────────────────────────────
export async function logOut() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ── Save scan WITH user ID ────────────────────────────
export async function saveScanWithUser(label, category, confidence) {
    try {
        const scanData = {
            label,
            category,
            confidence,
            month:     new Date().toLocaleString('default', { month: 'short' }),
            year:      new Date().getFullYear(),
            timestamp: new Date().toISOString(),
            city:      "Bhopal",
            userId:    currentUser ? currentUser.uid   : "guest",
            userName:  currentUser ? currentUser.displayName || currentUser.email : "Guest"
        };
        await addDoc(collection(db, "scans"), scanData);
        console.log("✅ Scan saved:", label, "by", scanData.userName);
    } catch (error) {
        console.error("Save scan error:", error);
    }
}

// ── Get THIS user's scans only ────────────────────────
export async function getUserScans() {
    if (!currentUser) return [];
    try {
        const q = query(
            collection(db, "scans"),
            where("userId", "==", currentUser.uid),
            orderBy("timestamp", "desc"),
            limit(100)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Get user scans error:", error);
        return [];
    }
}

// ── Calculate Eco Score ───────────────────────────────
// 10 points per scan, bonus for variety
export function calculateEcoScore(scans) {
    if (!scans || scans.length === 0) return 0;
    const base      = scans.length * 10;
    const categories = new Set(scans.map(s => s.category)).size;
    const bonus      = categories * 15;
    return base + bonus;
}

// ── Get Eco Level ─────────────────────────────────────
export function getEcoLevel(score) {
    if (score >= 500) return { level: "Eco Champion",  icon: "🏆", color: "#22C55E" };
    if (score >= 300) return { level: "Green Guardian", icon: "🌿", color: "#06B6D4" };
    if (score >= 150) return { level: "Recycler",       icon: "♻️", color: "#1E3A8A" };
    if (score >= 50)  return { level: "Beginner",       icon: "🌱", color: "#84CC16" };
    return                   { level: "New Member",     icon: "👋", color: "#94A3B8" };
}

// ── Friendly error messages ───────────────────────────
function getFriendlyError(code) {
    const errors = {
        "auth/email-already-in-use":   "This email is already registered. Try logging in.",
        "auth/weak-password":          "Password must be at least 6 characters.",
        "auth/invalid-email":          "Please enter a valid email address.",
        "auth/user-not-found":         "No account found with this email.",
        "auth/wrong-password":         "Incorrect password. Please try again.",
        "auth/invalid-credential":     "Invalid email or password.",
        "auth/too-many-requests":      "Too many attempts. Please wait a moment."
    };
    return errors[code] || "Something went wrong. Please try again.";
}