import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDslGup2EIZMKcAAdH9Ghg7V8UDcMfw02g",
  authDomain: "jellyharris-92239.firebaseapp.com",
  projectId: "jellyharris-92239",
  storageBucket: "jellyharris-92239.firebasestorage.app",
  messagingSenderId: "891351390310",
  appId: "1:891351390310:web:01dc2516c75e34ed66b5a7",
  measurementId: "G-GSTHLSQGG8"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
