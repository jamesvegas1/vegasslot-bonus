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

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        // Reset Error
        errorMsg.style.display = 'none';

        // Loading State
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;

        try {
            const admin = await validateLogin(username, password);
            
            if (admin) {
                // Success
                localStorage.setItem('vegas_auth_token', 'true');
                localStorage.setItem('vegas_admin_user', admin.username);
                localStorage.setItem('vegas_admin_role', admin.role);
                localStorage.setItem('vegas_admin_id', admin.id);
                window.location.href = 'admin.html';
            } else {
                // Failure
                errorMsg.style.display = 'block';
                loginBtn.classList.remove('loading');
                loginBtn.disabled = false;
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMsg.style.display = 'block';
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    });
});
