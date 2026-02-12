const API_BASE = "http://127.0.0.1:5000";

// ================= VALIDATION RULES =================
const ValidationRules = {
    name: {
        minLength: 2,
        maxLength: 50,
        pattern: /^[a-zA-Z\s]+$/,
        messages: {
            required: "Full name is required",
            minLength: "Name must be at least 2 characters",
            maxLength: "Name cannot exceed 50 characters",
            pattern: "Name can only contain letters and spaces"
        }
    },
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
        minLength: 8,
        maxLength: 128,
        patterns: {
            uppercase: /[A-Z]/,
            lowercase: /[a-z]/,
            number: /[0-9]/
        },
        messages: {
            required: "Password is required",
            minLength: "Password must be at least 8 characters",
            maxLength: "Password cannot exceed 128 characters",
            uppercase: "Password must contain at least one uppercase letter",
            lowercase: "Password must contain at least one lowercase letter",
            number: "Password must contain at least one number"
        }
    }
};

// ================= VALIDATION FUNCTIONS =================
function validateName(name) {
    const rules = ValidationRules.name;
    const errors = [];

    if (!name || name.trim() === "") {
        errors.push(rules.messages.required);
        return errors;
    }

    const trimmed = name.trim();
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

    if (password.length < rules.minLength) {
        errors.push(rules.messages.minLength);
    }
    if (password.length > rules.maxLength) {
        errors.push(rules.messages.maxLength);
    }
    if (!rules.patterns.uppercase.test(password)) {
        errors.push(rules.messages.uppercase);
    }
    if (!rules.patterns.lowercase.test(password)) {
        errors.push(rules.messages.lowercase);
    }
    if (!rules.patterns.number.test(password)) {
        errors.push(rules.messages.number);
    }

    return errors;
}

function showFieldError(inputEl, errors) {
    // Remove existing error
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

// ================= REAL-TIME VALIDATION =================
document.addEventListener('DOMContentLoaded', () => {
    const suname = document.getElementById('suname');
    const suid = document.getElementById('suid');
    const spwd = document.getElementById('spwd');

    if (suname) {
        suname.addEventListener('blur', () => {
            showFieldError(suname, validateName(suname.value));
        });
        suname.addEventListener('input', () => {
            if (suname.classList.contains('is-invalid')) {
                showFieldError(suname, validateName(suname.value));
            }
        });
    }

    if (suid) {
        suid.addEventListener('blur', () => {
            showFieldError(suid, validateUserId(suid.value));
        });
        suid.addEventListener('input', () => {
            if (suid.classList.contains('is-invalid')) {
                showFieldError(suid, validateUserId(suid.value));
            }
        });
    }

    if (spwd) {
        // Create password strength indicator
        createPasswordStrengthIndicator(spwd);

        spwd.addEventListener('blur', () => {
            showFieldError(spwd, validatePassword(spwd.value));
        });
        spwd.addEventListener('input', () => {
            // Update strength indicator on every keystroke
            updatePasswordStrength(spwd.value);

            if (spwd.classList.contains('is-invalid')) {
                showFieldError(spwd, validatePassword(spwd.value));
            }
        });
    }
});

// ================= PASSWORD STRENGTH INDICATOR =================
function createPasswordStrengthIndicator(passwordInput) {
    // Create container
    const container = document.createElement('div');
    container.className = 'password-strength-container';
    container.innerHTML = `
        <div class="password-strength">
            <div class="password-strength-bar" id="strengthBar"></div>
        </div>
        <div class="password-strength-text" id="strengthText"></div>
    `;

    // Insert after password input (or after its error message area)
    passwordInput.parentNode.insertBefore(container, passwordInput.nextSibling);
}

function calculatePasswordStrength(password) {
    if (!password) return { score: 0, label: '', class: '' };

    let score = 0;
    const checks = {
        length: password.length >= 8,
        longLength: password.length >= 12,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~]/.test(password)
    };

    // Basic scoring
    if (checks.length) score += 1;
    if (checks.longLength) score += 1;
    if (checks.uppercase) score += 1;
    if (checks.lowercase) score += 1;
    if (checks.number) score += 1;
    if (checks.special) score += 1;

    // Determine strength level
    if (score <= 2) {
        return { score: 1, label: 'Weak', class: 'weak', color: '#dc3545' };
    } else if (score <= 4) {
        return { score: 2, label: 'Medium', class: 'medium', color: '#ffc107' };
    } else {
        return { score: 3, label: 'Strong', class: 'strong', color: '#28a745' };
    }
}

function updatePasswordStrength(password) {
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');

    if (!strengthBar || !strengthText) return;

    const strength = calculatePasswordStrength(password);

    if (!password) {
        strengthBar.style.width = '0%';
        strengthBar.className = 'password-strength-bar';
        strengthText.textContent = '';
        strengthText.style.color = '';
        return;
    }

    // Update bar
    strengthBar.className = `password-strength-bar ${strength.class}`;

    // Animate width based on strength
    const widthMap = { weak: '33%', medium: '66%', strong: '100%' };
    strengthBar.style.width = widthMap[strength.class] || '0%';

    // Update text
    strengthText.textContent = `Password Strength: ${strength.label}`;
    strengthText.style.color = strength.color;
}

// Avatar Preview Logic
const suFile = document.getElementById('suFile');
const avatarPreview = document.getElementById('avatarPreview');
let uploadedAvatarUrl = null;

if (suFile) {
    suFile.addEventListener('change', async () => {
        const file = suFile.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert("Please select an image file");
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("Image size must be less than 5MB");
            return;
        }

        // Preview local
        const reader = new FileReader();
        reader.onload = (e) => {
            avatarPreview.src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Upload immediately (or could do at signup, but immediate is easier for state)
        const formData = new FormData();
        formData.append('file', file);

        try {
            const r = await fetch(`${API_BASE}/upload`, {
                method: "POST",
                body: formData
            });
            const data = await r.json();
            if (data.file_url) {
                uploadedAvatarUrl = data.file_url; // Store relative path
            }
        } catch (e) {
            console.error("Avatar upload failed", e);
            alert("Failed to upload avatar image");
        }
    });
}

function updateAvatarPreview(name) {
    // Only update if no custom file uploaded
    if (!uploadedAvatarUrl && suFile && !suFile.files.length) {
        avatarPreview.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(name || "User");
    }
}

async function signup() {
    const suname = document.getElementById('suname');
    const suid = document.getElementById('suid');
    const spwd = document.getElementById('spwd');

    // Run all validations
    const nameErrors = validateName(suname.value);
    const userIdErrors = validateUserId(suid.value);
    const passwordErrors = validatePassword(spwd.value);

    // Show errors for all fields
    const nameValid = showFieldError(suname, nameErrors);
    const userIdValid = showFieldError(suid, userIdErrors);
    const passwordValid = showFieldError(spwd, passwordErrors);

    // Stop if any validation failed
    if (!nameValid || !userIdValid || !passwordValid) {
        return;
    }

    // Determine Final Avatar URL
    let finalAvatar = uploadedAvatarUrl;
    if (!finalAvatar) {
        finalAvatar = "https://ui-avatars.com/api/?name=" + encodeURIComponent(suname.value);
    }
    // Fix relative URL for DB
    if (finalAvatar.startsWith("/")) {
        finalAvatar = API_BASE + finalAvatar;
    }

    try {
        const response = await fetch(`${API_BASE}/signup`, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: suname.value,
                userId: suid.value,
                password: spwd.value,
                avatar: finalAvatar
            })
        });

        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        alert("Signup successful! Please login.");
        window.location.href = "login.html";
    } catch (err) {
        alert("Signup failed: " + err.message);
    }
}

// ================= SOCIAL SIGNUP =================
// Note: For production, you need to set up OAuth credentials

function signupWithGoogle() {
    // Google OAuth 2.0 Configuration
    const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
    const REDIRECT_URI = encodeURIComponent(window.location.origin + '/frontend/pages/oauth-callback.html');
    const SCOPE = encodeURIComponent('email profile');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=token` +
        `&scope=${SCOPE}` +
        `&prompt=select_account`;

    if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
        alert('Google OAuth Setup Required\n\n' +
            'To enable Google signup:\n' +
            '1. Go to Google Cloud Console\n' +
            '2. Create OAuth 2.0 credentials\n' +
            '3. Replace GOOGLE_CLIENT_ID in signup.js\n\n' +
            'For now, please use email/password signup.');
        return;
    }

    const popup = window.open(authUrl, 'Google Signup',
        'width=500,height=600,scrollbars=yes');

    window.addEventListener('message', handleOAuthSignup);
}

function signupWithGithub() {
    const GITHUB_CLIENT_ID = 'YOUR_GITHUB_CLIENT_ID';
    const REDIRECT_URI = encodeURIComponent(window.location.origin + '/frontend/pages/oauth-callback.html');
    const SCOPE = encodeURIComponent('user:email');

    const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${GITHUB_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&scope=${SCOPE}`;

    if (GITHUB_CLIENT_ID === 'YOUR_GITHUB_CLIENT_ID') {
        alert('GitHub OAuth Setup Required\n\n' +
            'To enable GitHub signup:\n' +
            '1. Go to GitHub Developer Settings\n' +
            '2. Create a new OAuth App\n' +
            '3. Replace GITHUB_CLIENT_ID in signup.js\n\n' +
            'For now, please use email/password signup.');
        return;
    }

    const popup = window.open(authUrl, 'GitHub Signup',
        'width=500,height=600,scrollbars=yes');

    window.addEventListener('message', handleOAuthSignup);
}

async function handleOAuthSignup(event) {
    if (event.origin !== window.location.origin) return;

    const { provider, token, user } = event.data || {};

    if (token && user) {
        try {
            // OAuth signup creates account and logs in
            const r = await fetch(`${API_BASE}/signup/oauth`, {
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
                alert("OAuth Signup Failed: " + data.error);
            } else {
                localStorage.setItem("currentUser", JSON.stringify(data));
                window.location.href = "chat.html";
            }
        } catch (err) {
            alert("OAuth signup failed: " + err.message);
        }
    }

    window.removeEventListener('message', handleOAuthSignup);
}


// Handle Enter key
document.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') signup();
});
