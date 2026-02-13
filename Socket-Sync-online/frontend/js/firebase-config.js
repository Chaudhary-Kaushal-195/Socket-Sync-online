import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBWk-u7V0Tf52DiUTbnqjr9EqCURGJcR2I",
    authDomain: "socketsync-1f92b.firebaseapp.com",
    databaseURL: "https://socketsync-1f92b-default-rtdb.firebaseio.com",
    projectId: "socketsync-1f92b",
    storageBucket: "socketsync-1f92b.firebasestorage.app",
    messagingSenderId: "1076614243500",
    appId: "1:1076614243500:web:4bd6e29972f4884887eb09"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

export { auth, googleProvider, githubProvider, signInWithPopup };
