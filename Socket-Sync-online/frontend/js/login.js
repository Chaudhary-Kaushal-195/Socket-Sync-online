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
                window.location.href = "chat.html";
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
                    window.location.href = "chat.html";
                }
            } catch (err) {
                alert("Login failed: " + err.message);
            }
        });
    }
});

// ================= SOCIAL LOGIN =================
// Note: For production, you need to set up OAuth credentials in Google Cloud Console / GitHub Developer Settings

function loginWithGoogle() {
    // Google OAuth 2.0 Configuration
    // Replace with your actual Google Client ID
    const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
    const REDIRECT_URI = encodeURIComponent(window.location.origin + '/frontend/pages/oauth-callback.html');
    const SCOPE = encodeURIComponent('email profile');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=token` +
        `&scope=${SCOPE}` +
        `&prompt=select_account`;

    // For demo purposes, show info message
    if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
        alert('Google OAuth Setup Required\n\n' +
            'To enable Google login:\n' +
            '1. Go to Google Cloud Console\n' +
            '2. Create OAuth 2.0 credentials\n' +
            '3. Replace GOOGLE_CLIENT_ID in login.js\n\n' +
            'For now, please use email/password login.');
        return;
    }

    // Open OAuth popup
    const popup = window.open(authUrl, 'Google Login',
        'width=500,height=600,scrollbars=yes');

    // Listen for OAuth callback
    window.addEventListener('message', handleOAuthMessage);
}

function loginWithGithub() {
    // GitHub OAuth Configuration
    // Replace with your actual GitHub Client ID
    const GITHUB_CLIENT_ID = 'YOUR_GITHUB_CLIENT_ID';
    const REDIRECT_URI = encodeURIComponent(window.location.origin + '/frontend/pages/oauth-callback.html');
    const SCOPE = encodeURIComponent('user:email');

    const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${GITHUB_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&scope=${SCOPE}`;

    // For demo purposes, show info message
    if (GITHUB_CLIENT_ID === 'YOUR_GITHUB_CLIENT_ID') {
        alert('GitHub OAuth Setup Required\n\n' +
            'To enable GitHub login:\n' +
            '1. Go to GitHub Developer Settings\n' +
            '2. Create a new OAuth App\n' +
            '3. Replace GITHUB_CLIENT_ID in login.js\n\n' +
            'For now, please use email/password login.');
        return;
    }

    // Open OAuth popup
    const popup = window.open(authUrl, 'GitHub Login',
        'width=500,height=600,scrollbars=yes');

    window.addEventListener('message', handleOAuthMessage);
}

async function handleOAuthMessage(event) {
    // Security: verify origin
    if (event.origin !== window.location.origin) return;

    const { provider, token, user } = event.data || {};

    if (token && user) {
        try {
            // Send to backend for verification/account creation
            const r = await fetch(`${API_BASE}/login/oauth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: provider,
                    token: token,
                    email: user.email,
                    name: user.name,
                    avatar: user.picture || user.avatar_url
                })
            });

            const data = await r.json();
            if (data.error) {
                alert("OAuth Login Failed: " + data.error);
            } else {
                localStorage.setItem("currentUser", JSON.stringify(data));
                window.location.href = "chat.html";
            }
        } catch (err) {
            alert("OAuth login failed: " + err.message);
        }
    }

    window.removeEventListener('message', handleOAuthMessage);
}
