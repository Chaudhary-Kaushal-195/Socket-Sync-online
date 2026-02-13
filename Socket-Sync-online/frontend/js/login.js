const API_BASE = "http://127.0.0.1:5000";

// ================= VALIDATION RULES =================
const ValidationRules = {
    userId: {
        minLength: 5,
        maxLength: 50,
        // Email pattern: allows standard email format
        pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        messages: {
            required: "Email/User ID is required",
            minLength: "Email must be at least 5 characters",
            maxLength: "Email cannot exceed 50 characters",
            pattern: "Please enter a valid email address (e.g., user@gmail.com)"
        }
    },
    password: {
        minLength: 1,
        messages: {
            required: "Password is required"
        }
    }
};

// ================= VALIDATION FUNCTIONS =================
function validateUserId(userId) {
    const rules = ValidationRules.userId;
    const errors = [];

    if (!userId || userId.trim() === "") {
        errors.push(rules.messages.required);
        return errors;
    }

    const trimmed = userId.trim();
    if (trimmed.length < rules.minLength) {
        errors.push(rules.messages.minLength);
    }
    if (trimmed.length > rules.maxLength) {
        errors.push(rules.messages.maxLength);
    }
    if (!rules.pattern.test(trimmed)) {
        errors.push(rules.messages.pattern);
    }

    return errors;
}

function validatePassword(password) {
    const rules = ValidationRules.password;
    const errors = [];

    if (!password || password === "") {
        errors.push(rules.messages.required);
        return errors;
    }

    return errors;
}

function showFieldError(inputEl, errors) {
    clearFieldError(inputEl);

    if (errors.length > 0) {
        inputEl.classList.add('is-invalid');
        inputEl.classList.remove('is-valid');

        const errorDiv = document.createElement('div');
        errorDiv.className = 'invalid-feedback';
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = errors.map(e => `<div>• ${e}</div>`).join('');
        inputEl.parentNode.insertBefore(errorDiv, inputEl.nextSibling);
        return false;
    } else {
        inputEl.classList.remove('is-invalid');
        inputEl.classList.add('is-valid');
        return true;
    }
}

function clearFieldError(inputEl) {
    inputEl.classList.remove('is-invalid', 'is-valid');
    const existingError = inputEl.parentNode.querySelector('.invalid-feedback');
    if (existingError) existingError.remove();
}

// QR Scanner Login
let html5QrCode = null;

async function startQrScanner() {
    const readerEl = document.getElementById('qr-reader');
    readerEl.style.display = "block";

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    try {
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanFailure
        );
    } catch (err) {
        console.error("Camera failed", err);
        alert("Camera failed to start: " + err);
    }
}

function onScanFailure(error) {
    // ignore
}

async function onScanSuccess(decodedText, decodedResult) {
    try {
        if (html5QrCode) {
            await html5QrCode.stop();
            html5QrCode.clear();
        }

        const payload = JSON.parse(decodedText);

        if (payload.type === "login" && payload.token) {
            document.getElementById('qr-reader').innerHTML = "Verifying...";

            const r = await fetch(`${API_BASE}/login/qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: payload.token })
            });

            const data = await r.json();
            if (data.error) {
                alert("Login Failed: " + data.error);
                window.location.reload();
            } else {
                localStorage.setItem("currentUser", JSON.stringify(data));
                window.location.href = "/chat";
            }
        }
    } catch (e) {
        console.error("Invalid QR", e);
        alert("Invalid QR Code");
        window.location.reload();
    }
}

// Standard Login
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const uidInput = document.getElementById('uid');
    const pwdInput = document.getElementById('pwd');

    // Real-time validation
    if (uidInput) {
        uidInput.addEventListener('blur', () => {
            showFieldError(uidInput, validateUserId(uidInput.value));
        });
        uidInput.addEventListener('input', () => {
            if (uidInput.classList.contains('is-invalid')) {
                showFieldError(uidInput, validateUserId(uidInput.value));
            }
        });
    }

    if (pwdInput) {
        pwdInput.addEventListener('blur', () => {
            showFieldError(pwdInput, validatePassword(pwdInput.value));
        });
        pwdInput.addEventListener('input', () => {
            if (pwdInput.classList.contains('is-invalid')) {
                showFieldError(pwdInput, validatePassword(pwdInput.value));
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('uid').value;
            const pwd = document.getElementById('pwd').value;

            // Validate fields
            const userIdErrors = validateUserId(id);
            const passwordErrors = validatePassword(pwd);

            const userIdValid = showFieldError(uidInput, userIdErrors);
            const passwordValid = showFieldError(pwdInput, passwordErrors);

            if (!userIdValid || !passwordValid) {
                return;
            }

            try {
                const r = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: id, password: pwd })
                });

                const data = await r.json();
                if (data.error) {
                    alert(data.error);
                } else {
                    localStorage.setItem("currentUser", JSON.stringify(data));
                    window.location.href = "/chat";
                }
            } catch (err) {
                alert("Login failed: " + err.message);
            }
        });
    }
});

// ================= SOCIAL LOGIN =================
import { auth, googleProvider, githubProvider, signInWithPopup } from './firebase-config.js';

window.loginWithGoogle = async function () {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        await handleSocialLogin(user);
    } catch (error) {
        console.error("Google Login Error:", error);
        alert("Google Login Failed: " + error.message);
    }
}

window.loginWithGithub = async function () {
    try {
        const result = await signInWithPopup(auth, githubProvider);
        const user = result.user;
        await handleSocialLogin(user);
    } catch (error) {
        console.error("GitHub Login Error:", error);
        alert("GitHub Login Failed: " + error.message);
    }
}

async function handleSocialLogin(firebaseUser) {
    try {
        // Prepare data for backend
        const payload = {
            email: firebaseUser.email,
            name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            avatar: firebaseUser.photoURL
        };

        const r = await fetch(`${API_BASE}/social-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await r.json();
        if (data.error) {
            alert("Login Failed: " + data.error);
        } else {
            localStorage.setItem("currentUser", JSON.stringify(data));
            window.location.href = "/chat";
        }
    } catch (err) {
        alert("Server Login Failed: " + err.message);
    }
}

// Make globally available for HTML onclick
window.startQrScanner = startQrScanner;
