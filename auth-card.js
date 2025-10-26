// Auth Card Component
function createAuthCard() {
    const authCard = document.createElement('div');
    authCard.className = 'auth-card';
    authCard.innerHTML = `
        <div class="auth-card-content">
            <div class="auth-status"></div>
            <div class="auth-actions">
                <button class="auth-button" id="loginButton">
                    Sign In
                </button>
            </div>
        </div>
    `;

    return authCard;
}

// Auth State Management
function updateAuthStatus() {
    const authStatus = document.querySelector('.auth-status');
    const token = localStorage.getItem('vera_token');
    const userName = localStorage.getItem('veraUserName');

    if (token && userName) {
        authStatus.innerHTML = `
            <div class="auth-welcome">
                Welcome back, ${userName}
                <button class="auth-link" onclick="handleLogout()">Sign Out</button>
            </div>
        `;
    } else {
        authStatus.innerHTML = `
            <div class="auth-welcome">
                Guest User
            </div>
        `;
    }
}

// Auto Login Check
function checkAutoLogin() {
    const token = localStorage.getItem('vera_token');
    if (token) {
        fetch('/api/auth/validate', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Invalid token');
            }
            return response.json();
        })
        .then(data => {
            if (data.valid) {
                updateAuthStatus();
            } else {
                handleLogout();
            }
        })
        .catch(() => {
            handleLogout();
        });
    }
}

// Event Handlers
function handleLogin() {
    window.location.href = '/login.html';
}

function handleLogout() {
    localStorage.removeItem('vera_token');
    localStorage.removeItem('veraUserName');
    updateAuthStatus();
}

// Initialize Auth Card
function initializeAuthCard() {
    document.addEventListener('DOMContentLoaded', () => {
        const mainContent = document.querySelector('.hero-content');
        if (mainContent) {
            const authCard = createAuthCard();
            mainContent.insertBefore(authCard, mainContent.firstChild);
            
            // Add event listeners
            document.getElementById('loginButton').addEventListener('click', handleLogin);
            
            // Check auto login
            checkAutoLogin();
            
            // Update auth status
            updateAuthStatus();
        }
    });
}

// Export for use
window.initializeAuthCard = initializeAuthCard;