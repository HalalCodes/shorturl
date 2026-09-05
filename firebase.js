import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTxAR3ZagbGfQRfHShJWqZmNcdatdDt-E",
  authDomain: "halalcodes.firebaseapp.com",
  projectId: "halalcodes",
  storageBucket: "halalcodes.firebasestorage.app",
  messagingSenderId: "455441854041",
  appId: "1:455441854041:web:5a93f5b1b55bb122014b48",
  measurementId: "G-NJQP9GK4LP"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
