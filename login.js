document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('errorMsg');

    // Check if already logged in
    if (localStorage.getItem('vegas_auth_token')) {
        window.location.href = 'admin.html';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = sanitizeInput(usernameInput.value.trim());
        const password = passwordInput.value.trim();

        // Reset Error
        errorMsg.style.display = 'none';

        // Client-side rate limiting
        if (!checkClientRateLimit('login_' + username, 5, 60000)) {
            errorMsg.textContent = 'Çok fazla deneme. 1 dakika bekleyin.';
            errorMsg.style.display = 'block';
            return;
        }

        // Loading State
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;

        try {
            // Hash password before sending
            const passwordHash = await hashPassword(password);
            const admin = await validateLoginSecure(username, passwordHash, password);
            
            if (admin) {
                // Generate secure session token
                const sessionToken = generateSecureToken();
                
                // Success
                localStorage.setItem('vegas_auth_token', sessionToken);
                localStorage.setItem('vegas_admin_user', admin.username);
                localStorage.setItem('vegas_admin_role', admin.role);
                localStorage.setItem('vegas_admin_id', admin.id);
                localStorage.setItem('vegas_admin_status', 'online');
                
                // Set admin status to online in database
                await updateAdminStatus(admin.id, 'online');
                
                window.location.href = 'admin.html';
            } else {
                // Failure
                errorMsg.textContent = 'Kullanıcı adı veya şifre hatalı.';
                errorMsg.style.display = 'block';
                loginBtn.classList.remove('loading');
                loginBtn.disabled = false;
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMsg.textContent = 'Bağlantı hatası. Tekrar deneyin.';
            errorMsg.style.display = 'block';
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    });
});
