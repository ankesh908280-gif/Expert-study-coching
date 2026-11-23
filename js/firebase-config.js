// Exact Firebase v10.12.2 Modular SDK via Google Official CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAYsUneDm-fRxOvVhGkYa1XUsI7UopYCVo",
  authDomain: "expert-study-20f20.firebaseapp.com",
  projectId: "expert-study-20f20",
  storageBucket: "expert-study-20f20.firebasestorage.app",
  messagingSenderId: "780921934583",
  appId: "1:780921934583:web:fe98829bec80d498c979f2",
  measurementId: "G-S7DEM9BRTV"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
