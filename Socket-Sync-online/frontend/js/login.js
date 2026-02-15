// Unified Deployment: Use relative paths
const API_BASE = "";

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

        let payload;
        try {
            payload = JSON.parse(decodedText);
        } catch (e) {
            alert("Invalid QR format. Expected JSON.");
            window.location.reload();
            return;
        }

        if (payload.type === "login" && payload.token) {
            // Legacy Login Logic - Migration Pending
            alert("Login via QR is currently disabled during migration.");
            window.location.reload();
        }
        else if (payload.type === "session") {
            // Direct Login via Session QR
            try {
                // Stop scanner
                document.getElementById('qr-reader').style.display = "none";

                const { data, error } = await window.supabase.auth.setSession({
                    refresh_token: payload.rt,
                    access_token: payload.at
                });

                if (error) throw error;

                // Session established. 
                // We rely on chat.js/auth guard to fetch profile details on redirect.
                window.location.href = "/chat";

            } catch (e) {
                console.error("Session Import Error", e);
                alert("Login via QR failed: " + e.message);
                window.location.reload();
            }
        }
        else if (payload.type === "profile") {
            // User scanned a profile QR
            const uidInput = document.getElementById("uid");
            if (uidInput) {
                // We are on the login page
                uidInput.value = payload.email || "";

                // Focus password field
                const pwdInput = document.getElementById("pwd");
                if (pwdInput) pwdInput.focus();

                // Hide scanner logic/UI if strictly needed, but reload might be cleaner to stop scanner? 
                // Actually, stopping scanner manually is better UX than reload for autofill.
                document.getElementById('qr-reader').style.display = "none";

                // Optional: Trigger input event for any validation listeners
                uidInput.dispatchEvent(new Event('input'));
            } else {
                // We are likely inside the app (e.g. Add Contact modal)
                alert(`Found User: ${payload.email}\n\nPlease log in to add them to your contacts.`);
                window.location.reload();
            }
        }
        else {
            alert("Unknown QR Code Type: " + payload.type);
            window.location.reload();
        }

    } catch (e) {
        console.error("Scanner Error", e);
        alert("Error processing QR code");
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
            const email = document.getElementById('uid').value;
            const pwd = document.getElementById('pwd').value;

            // Validate fields
            const userIdErrors = validateUserId(email);
            const passwordErrors = validatePassword(pwd);

            const userIdValid = showFieldError(uidInput, userIdErrors);
            const passwordValid = showFieldError(pwdInput, passwordErrors);

            if (!userIdValid || !passwordValid) {
                return;
            }

            try {
                // Supabase Login
                if (!window.supabase) {
                    alert("System Error: Supabase client not initialized. Please refresh.");
                    return;
                }

                const { data, error } = await window.supabase.auth.signInWithPassword({
                    email: email,
                    password: pwd
                });

                if (error) {
                    alert("Login failed: " + error.message);
                } else {
                    // Fetch Profile details to store in currentUser
                    const { data: profile, error: profileError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', data.session.user.id)
                        .single();

                    if (profileError) {
                        console.error("Profile fetch error", profileError);
                        // Fallback using auth metadata if profile fails
                        const userMeta = data.session.user.user_metadata;
                        const currentUser = {
                            user_id: data.session.user.id, // UUID
                            email: data.session.user.email,
                            name: userMeta.name || email.split('@')[0],
                            avatar: userMeta.avatar || "https://ui-avatars.com/api/?name=User"
                        };
                        localStorage.setItem("currentUser", JSON.stringify(currentUser));
                    } else {
                        // Use profile data
                        const currentUser = {
                            user_id: profile.id, // UUID
                            email: profile.user_id, // stored email in profiles
                            name: profile.name,
                            avatar: profile.avatar
                        };
                        localStorage.setItem("currentUser", JSON.stringify(currentUser));
                    }

                    // Update Login Streak
                    try {
                        const now = new Date();
                        const lastLogin = profile.last_login ? new Date(profile.last_login) : null;
                        let streak = profile.login_streak || 0;

                        if (lastLogin) {
                            const diff = now - lastLogin;
                            const oneDay = 24 * 60 * 60 * 1000;
                            if (diff > oneDay && diff < (oneDay * 2)) {
                                streak++;
                            } else if (diff > (oneDay * 2)) {
                                streak = 1;
                            }
                        } else {
                            streak = 1;
                        }

                        await supabase
                            .from('profiles')
                            .update({
                                last_login: now.toISOString(),
                                login_streak: streak
                            })
                            .eq('id', profile.id);

                    } catch (e) {
                        console.error("Streak access/update failed", e);
                    }

                    window.location.href = "/chat";
                }
            } catch (err) {
                alert("Login critical error: " + err.message);
                console.error(err);
            }
        });
    }
});

// ================= SOCIAL LOGIN =================
// ================= SOCIAL LOGIN =================
// import { auth, googleProvider, githubProvider, signInWithPopup } from './firebase-config.js';

window.loginWithGoogle = async function () {
    try {
        const { data, error } = await window.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/chat'
            }
        });
        if (error) throw error;
    } catch (e) {
        console.error("Google Login Error", e);
        alert("Google Login Error: " + e.message);
    }
}

window.loginWithGithub = async function () {
    try {
        const { data, error } = await window.supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: window.location.origin + '/chat'
            }
        });
        if (error) throw error;
    } catch (e) {
        console.error("GitHub Login Error", e);
        alert("GitHub Login Error: " + e.message);
    }
}

/*
async function handleSocialLogin(firebaseUser) {
    // Legacy Firebase Code Removed
}
*/

// Make globally available for HTML onclick
window.startQrScanner = startQrScanner;
