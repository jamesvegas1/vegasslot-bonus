// --- Production Mode (disable debug logs) ---
const IS_PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
const debugLog = IS_PRODUCTION ? () => {} : console.log.bind(console);

// --- Auth Check ---
if (!localStorage.getItem('vegas_auth_token')) {
    window.location.href = 'login.html';
    throw new Error('Not authenticated'); // Stop script execution
}

// XSS Protection - Escape HTML entities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- State ---
let requests = [];
let currentRequestId = null;
let currentActionType = null;

// --- Elements ---
const detailModal = document.getElementById('detailModal');
const confirmModal = document.getElementById('confirmModal');
const closeModalBtn = document.querySelector('.close-modal-btn');
const cancelConfirmBtn = document.querySelector('.btn-cancel');
const confirmApproveBtn = document.querySelector('.btn-confirm');
const logoutBtn = document.querySelector('.logout-btn');

// Table and Filter Elements
const tableBody = document.getElementById('requestTableBody');
const searchInput = document.querySelector('.search-input');
const filterType = document.getElementById('filterBonus');
const filterStatus = document.getElementById('filterStatus');
const filterDate = document.getElementById('filterDate');
const exportCsvBtn = document.getElementById('exportCsvBtn');

// Stat Elements
const statPendingIndex = document.getElementById('statPendingIndex');
const statPendingBadge = document.getElementById('pendingBadge');
const statApprovedIndex = document.getElementById('statApprovedIndex');
const statRejectRate = document.getElementById('statRejectRate');

// Modal Elements
const modalReqId = document.getElementById('modalReqId');
const modalAvatar = document.getElementById('modalAvatar');
const modalUsername = document.getElementById('modalUsername');
const modalBonusType = document.getElementById('modalBonusType');
const modalTime = document.getElementById('modalTime');
const modalNote = document.getElementById('modalNote');
const modalApproveBtn = document.querySelector('.btn-approve-lg');
const modalRejectBtn = document.querySelector('.btn-reject-lg');

// Confirm Modal Elements
const confirmTitle = document.getElementById('confirmTitle');
const confirmUsername = document.getElementById('confirmUsername');
const confirmBonusType = document.getElementById('confirmBonusType');
const confirmIcon = document.getElementById('confirmIcon');
const confirmActionBtn = document.getElementById('confirmActionBtn');

// Navigation Elements (must be declared before handleNavigation is called)
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.querySelector('.page-title');

// Charts State (must be declared before loadRequests which calls updateCharts)
let volumeChart = null;
let statusChart = null;
let peakHoursChart = null;

// --- DEBUG SYSTEM ---
window.debugBonusSystem = async function() {
    debugLog('=== BONUS SYSTEM DEBUG ===');
    console.log('');
    
    // 1. Current Admin Info
    const adminId = localStorage.getItem('vegas_admin_id');
    const adminUser = localStorage.getItem('vegas_admin_user');
    const adminStatus = localStorage.getItem('vegas_admin_status');
    debugLog('📌 CURRENT ADMIN:');
    debugLog('   ID:', adminId);
    debugLog('   Username:', adminUser);
    debugLog('   LocalStorage Status:', adminStatus);
    debugLog('');
    
    // 2. Database Admin Statuses
    debugLog('📋 ALL ADMINS IN DATABASE:');
    const admins = await getAdmins();
    admins.forEach(a => {
        debugLog(`   ${a.username}: ${a.status || 'NO STATUS'} (ID: ${a.id})`);
    });
    debugLog('');
    
    // 3. Online Admins
    debugLog('✅ ONLINE ADMINS:');
    const onlineAdmins = await getOnlineAdmins();
    if (onlineAdmins.length === 0) {
        debugLog('   ⚠️ NO ONLINE ADMINS!');
    } else {
        onlineAdmins.forEach(a => debugLog(`   ${a.username} (ID: ${a.id})`));
    }
    debugLog('');
    
    // 4. Pending Requests
    debugLog('📝 PENDING REQUESTS:');
    const allRequests = await getBonusRequests();
    const pending = allRequests.filter(r => r.status === 'pending');
    if (pending.length === 0) {
        debugLog('   No pending requests');
    } else {
        pending.forEach(r => {
            const assignedAdmin = admins.find(a => a.id === r.assigned_to);
            debugLog(`   ${r.request_id}: ${r.username} → Assigned to: ${assignedAdmin ? assignedAdmin.username : 'UNASSIGNED'}`);
        });
    }
    debugLog('');
    
    // 5. Unassigned Requests
    const unassigned = pending.filter(r => !r.assigned_to);
    if (unassigned.length > 0) {
        debugLog('⚠️ UNASSIGNED REQUESTS:', unassigned.length);
        unassigned.forEach(r => debugLog(`   ${r.request_id}: ${r.username}`));
    }
    debugLog('');
    
    // 6. Requests visible to current admin
    const visiblePending = pending.filter(r => !r.assigned_to || r.assigned_to === adminId);
    debugLog('👁️ VISIBLE TO YOU:', visiblePending.length, 'pending requests');
    
    debugLog('');
    debugLog('=== END DEBUG ===');
    debugLog('');
    debugLog('💡 Quick fixes:');
    debugLog('   - Force online: await updateAdminStatus("YOUR_ID", "online")');
    debugLog('   - Reassign all: await window.forceReassignAll()');
    
    return { admins, onlineAdmins, pending, unassigned, visiblePending };
};

// Force reassign all unassigned requests
window.forceReassignAll = async function() {
    const allRequests = await getBonusRequests();
    const unassigned = allRequests.filter(r => r.status === 'pending' && !r.assigned_to);
    
    debugLog('Reassigning', unassigned.length, 'requests...');
    for (const req of unassigned) {
        await autoAssignRequest(req.id);
    }
    debugLog('Done! Refreshing...');
    await loadRequests();
};

// --- Hashtag/Note Templates State ---
let noteTemplates = [];

// --- Start Up ---
(async () => {
    // Ensure admin is online in database on page load
    const adminId = localStorage.getItem('vegas_admin_id');
    const storedStatus = localStorage.getItem('vegas_admin_status');
    const adminRole = localStorage.getItem('vegas_admin_role');
    
    debugLog('🚀 Admin Panel Starting...');
    debugLog('   Admin ID:', adminId);
    debugLog('   Stored Status:', storedStatus);
    debugLog('   Role:', adminRole);
    
    if (adminId) {
        // Always sync to online when panel opens (if user hasn't explicitly set offline)
        if (storedStatus === 'online' || !storedStatus) {
            const success = await updateAdminStatus(adminId, 'online');
            debugLog('   DB Status Update:', success ? '✅ Success' : '❌ Failed');
            localStorage.setItem('vegas_admin_status', 'online');
        }
    }
    
    // Show admin-only navigation if user is admin or senior_agent
    if (adminRole === 'admin' || adminRole === 'senior_agent') {
        document.querySelectorAll('.admin-only-nav').forEach(el => el.classList.add('visible'));
    }
    
    // Load note templates for hashtag buttons
    await loadNoteTemplates();
    
    await loadRequests();
    
    // Initialize Supabase Realtime for instant updates
    initializeRealtime();
    
    // Restore last active tab or default to dashboard
    const lastTab = sessionStorage.getItem('vegas_admin_tab') || 'dashboard';
    handleNavigation(lastTab);
    
    debugLog('✅ Admin Panel Ready');
    debugLog('💡 Run debugBonusSystem() in console for full debug info');
})();
// Realtime & notification state
let lastPendingCount = 0;
let realtimeEnabled = false;

// Notification sound function - 3 tone chime
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Three ascending notes for a pleasant notification
        const notes = [
            { freq: 523, delay: 0, duration: 0.3 },      // C5
            { freq: 659, delay: 0.15, duration: 0.3 },   // E5
            { freq: 784, delay: 0.3, duration: 0.5 }     // G5
        ];
        
        notes.forEach(note => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = note.freq;
            osc.type = 'sine';
            
            const startTime = audioCtx.currentTime + note.delay;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + note.duration);
            
            osc.start(startTime);
            osc.stop(startTime + note.duration);
        });
    } catch (e) { console.log('Audio error:', e); }
}

// Initialize Supabase Realtime subscription
function initializeRealtime() {
    if (realtimeEnabled) return;
    
    debugLog('🔌 Initializing Supabase Realtime...');
    
    subscribeToRequests({
        onInsert: (newRequest) => {
            debugLog('📥 New request received via Realtime:', newRequest.request_id);
            // Add to local state
            const adminList = adminCache || [];
            const adminMap = {};
            adminList.forEach(a => { adminMap[a.id] = a.username; });
            
            const mappedRequest = {
                id: newRequest.request_id,
                dbId: newRequest.id,
                username: newRequest.username,
                bonusType: newRequest.bonus_type,
                bonusTypeLabel: newRequest.bonus_type_label,
                note: newRequest.note || '',
                adminNote: newRequest.admin_note || '',
                timestamp: newRequest.created_at,
                status: newRequest.status,
                notified: newRequest.notified,
                assignedTo: newRequest.assigned_to,
                assignedAt: newRequest.assigned_at,
                processedBy: newRequest.processed_by,
                processedByName: adminMap[newRequest.processed_by] || null,
                processedAt: newRequest.processed_at
            };
            
            // Add to beginning of array (newest first)
            requests.unshift(mappedRequest);
            
            // Play sound and show toast
            playNotificationSound();
            showToast('Yeni Talep!', `${newRequest.username} - ${newRequest.bonus_type_label || newRequest.bonus_type}`, 'info');
            
            // Update UI
            renderTable();
            updateStats();
        },
        onUpdate: (updatedRequest, oldRequest) => {
            debugLog('📝 Request updated via Realtime:', updatedRequest.request_id);
            // Find and update in local state
            const index = requests.findIndex(r => r.dbId === updatedRequest.id);
            if (index !== -1) {
                const adminList = adminCache || [];
                const adminMap = {};
                adminList.forEach(a => { adminMap[a.id] = a.username; });
                
                requests[index] = {
                    ...requests[index],
                    status: updatedRequest.status,
                    adminNote: updatedRequest.admin_note || '',
                    assignedTo: updatedRequest.assigned_to,
                    assignedAt: updatedRequest.assigned_at,
                    processedBy: updatedRequest.processed_by,
                    processedByName: adminMap[updatedRequest.processed_by] || null,
                    processedAt: updatedRequest.processed_at
                };
                
                // Update UI
                renderTable();
                updateStats();
            }
        },
        onDelete: (deletedRequest) => {
            debugLog('🗑️ Request deleted via Realtime:', deletedRequest.request_id);
            // Remove from local state
            requests = requests.filter(r => r.dbId !== deletedRequest.id);
            renderTable();
            updateStats();
        }
    });
    
    realtimeEnabled = true;
    debugLog('✅ Realtime subscription active');
    
    // Show realtime indicator
    const indicator = document.getElementById('realtimeIndicator');
    if (indicator) indicator.classList.add('connected');
}

// No polling - using Realtime only for better performance

// Manual refresh function
async function manualRefresh() {
    const refreshBtn = document.getElementById('manualRefreshBtn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<svg class="spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Yenileniyor...';
    }
    
    await loadRequests();
    renderTable();
    
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/><path d="M21 3v9h-9"/></svg> Yenile';
    }
    
    showToast('Yenilendi', 'Talepler güncellendi.', 'success');
}

// --- Logout Modal ---
const logoutModal = document.getElementById('logoutModal');
const logoutCancelBtn = document.getElementById('logoutCancelBtn');
const logoutConfirmBtn = document.getElementById('logoutConfirmBtn');

function showLogoutModal() {
    if (logoutModal) {
        logoutModal.classList.remove('hidden');
    }
}

function hideLogoutModal() {
    if (logoutModal) {
        logoutModal.classList.add('hidden');
    }
}

function performLogout() {
    // Set status to offline before logout
    const adminId = localStorage.getItem('vegas_admin_id');
    if (adminId) {
        updateAdminStatus(adminId, 'offline');
    }
    
            localStorage.removeItem('vegas_auth_token');
    localStorage.removeItem('vegas_admin_user');
    localStorage.removeItem('vegas_admin_role');
    localStorage.removeItem('vegas_admin_id');
    localStorage.removeItem('vegas_admin_status');
            window.location.href = 'login.html';
        }

if (logoutBtn) {
    logoutBtn.addEventListener('click', showLogoutModal);
}

if (logoutCancelBtn) {
    logoutCancelBtn.addEventListener('click', hideLogoutModal);
}

if (logoutConfirmBtn) {
    logoutConfirmBtn.addEventListener('click', performLogout);
}

// Close modal on backdrop click
if (logoutModal) {
    logoutModal.querySelector('.logout-modal-backdrop').addEventListener('click', hideLogoutModal);
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && logoutModal && !logoutModal.classList.contains('hidden')) {
        hideLogoutModal();
    }
});

// --- Logic ---


async function loadRequests() {
    try {
        debugLog('📥 loadRequests() starting...');
        
        // Cleanup requests assigned to offline admins (release them back to pool)
        await cleanupOfflineAdminRequests();
        
        // Fetch last 30 days of requests (performance optimization)
        let data = await getBonusRequests(30);
        debugLog('   Requests from DB (last 30 days):', data.length);
        
        // No auto-assign - all pending requests visible to all online admins
        // First admin to click "view" will claim it
        
        // Get admin list (cached for performance)
        const adminList = await getAdminsCached();
        const adminMap = {};
        adminList.forEach(a => { adminMap[a.id] = a.username; });
        
        requests = data.map(r => ({
            id: r.request_id,
            dbId: r.id,
            username: r.username,
            bonusType: r.bonus_type,
            bonusTypeLabel: r.bonus_type_label,
            note: r.note || '',
            adminNote: r.admin_note || '',
            timestamp: r.created_at,
            status: r.status,
            notified: r.notified,
            assignedTo: r.assigned_to,
            assignedAt: r.assigned_at,
            processedBy: r.processed_by,
            processedByName: adminMap[r.processed_by] || null,
            processedAt: r.processed_at
        }));
    renderTable();
    updateStats();
    return requests;
    } catch (error) {
        console.error('Error loading requests:', error);
        requests = [];
        return requests;
    }
}

async function saveRequestStatus(dbId, status, adminNote = '') {
    try {
        const currentAdminId = localStorage.getItem('vegas_admin_id');
        await updateBonusRequestStatus(dbId, status, adminNote, currentAdminId);
        await loadRequests();
    } catch (error) {
        console.error('Error saving request:', error);
    }
}

// --- Dashboard Widgets ---
function updateDashboardWidgets() {
    if (!requests) return;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Get current admin info for filtering
    const currentAdminId = localStorage.getItem('vegas_admin_id');
    const currentStatus = localStorage.getItem('vegas_admin_status') || 'online';
    
    // Today's data
    const todayRequests = requests.filter(r => {
        if (!r.timestamp) return false;
        return new Date(r.timestamp).getTime() >= startOfToday;
    });

    // Pending count - only count requests visible to current admin
    let todayPending = 0;
    if (currentStatus === 'online') {
        todayPending = todayRequests.filter(r => {
            if (r.status !== 'pending') return false;
            return !r.assignedTo || r.assignedTo === currentAdminId;
        }).length;
    }
    const todayApproved = todayRequests.filter(r => r.status === 'approved').length;
    const todayRejected = todayRequests.filter(r => r.status === 'rejected').length;

    // Update Today Summary
    const summaryTotal = document.getElementById('summaryTotal');
    const summaryPending = document.getElementById('summaryPending');
    const summaryApproved = document.getElementById('summaryApproved');
    const summaryRejected = document.getElementById('summaryRejected');
    const todaySummaryDate = document.getElementById('todaySummaryDate');

    if (summaryTotal) summaryTotal.textContent = todayRequests.length;
    if (summaryPending) summaryPending.textContent = todayPending;
    if (summaryApproved) summaryApproved.textContent = todayApproved;
    if (summaryRejected) summaryRejected.textContent = todayRejected;
    if (todaySummaryDate) {
        todaySummaryDate.textContent = now.toLocaleDateString('tr-TR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
        });
    }

    // Update Recent Activity
    updateRecentActivity();
}

function updateRecentActivity() {
    const activityList = document.getElementById('recentActivityList');
    if (!activityList || !requests) return;

    // Get last 5 processed requests (approved or rejected)
    const processedRequests = requests
        .filter(r => r.status === 'approved' || r.status === 'rejected')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);

    if (processedRequests.length === 0) {
        activityList.innerHTML = '<div class="empty-state">Henüz işlem yapılmadı</div>';
        return;
    }

    activityList.innerHTML = processedRequests.map(req => {
        const isApproved = req.status === 'approved';
        const icon = isApproved ? '✓' : '✗';
        const statusClass = isApproved ? 'approved' : 'rejected';
        const statusText = isApproved ? 'Onaylandı' : 'Reddedildi';
        
        const date = new Date(req.timestamp);
        const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

        return `
            <div class="activity-item">
                <div class="activity-icon ${statusClass}">${icon}</div>
                <div class="activity-content">
                    <div class="activity-title">${escapeHtml(req.username)} - ${escapeHtml(req.bonusTypeLabel || req.bonusType)}</div>
                    <div class="activity-meta">${statusText}</div>
                </div>
                <div class="activity-time">${dateStr} ${timeStr}</div>
            </div>
        `;
    }).join('');
}

function updateStats() {
    if (!requests) return;

    // Get time boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    // Pending Count - Only count requests visible to current admin
    const currentAdminId = localStorage.getItem('vegas_admin_id');
    const currentStatus = localStorage.getItem('vegas_admin_status') || 'online';
    
    let pendingCount = 0;
    if (currentStatus === 'online') {
        pendingCount = requests.filter(r => {
            if (r.status !== 'pending') return false;
            // Count only if assigned to me or unassigned
            return !r.assignedTo || r.assignedTo === currentAdminId;
        }).length;
    }
    if (statPendingIndex) statPendingIndex.textContent = pendingCount;
    if (statPendingBadge) {
        statPendingBadge.textContent = pendingCount;
        statPendingBadge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
    }

    // Update Dashboard Widgets
    updateDashboardWidgets();

    // Approved Today - Only count requests approved today
    const approvedToday = requests.filter(r => {
        if (r.status !== 'approved' || !r.timestamp) return false;
        return new Date(r.timestamp).getTime() >= startOfToday;
    }).length;
    if (statApprovedIndex) statApprovedIndex.textContent = approvedToday;

    // Weekly Rejection Rate - Calculate from this week's processed requests
    const weeklyProcessed = requests.filter(r => {
        if (r.status === 'pending' || !r.timestamp) return false;
        return new Date(r.timestamp).getTime() >= weekAgo;
    });
    const weeklyRejected = weeklyProcessed.filter(r => r.status === 'rejected').length;

    if (weeklyProcessed.length > 0) {
        const rate = ((weeklyRejected / weeklyProcessed.length) * 100).toFixed(1);
        if (statRejectRate) statRejectRate.textContent = `${rate}%`;
    } else {
        if (statRejectRate) statRejectRate.textContent = '0%';
    }

    updateCharts();
}

// --- Charts Logic ---
function initCharts() {
    const ctxVolume = document.getElementById('volumeChart');
    const ctxStatus = document.getElementById('statusChart');

    if (ctxVolume) {
        Chart.defaults.color = '#9ca3af';
        Chart.defaults.font.family = "'Inter', sans-serif";

        volumeChart = new Chart(ctxVolume, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Günlük Talepler',
                    data: [],
                    backgroundColor: '#f59e0b',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2a2f3a' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    if (ctxStatus) {
        statusChart = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Bekleyen', 'Onaylanan', 'Reddedilen'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
    }

    const ctxPeak = document.getElementById('peakHoursChart');
    if (ctxPeak) {
        peakHoursChart = new Chart(ctxPeak, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Talep Yoğunluğu',
                    data: [],
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2a2f3a' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxTicksLimit: 12,
                            color: '#64748b'
                        }
                    }
                }
            }
        });
    }
}

function updateCharts() {
    if (!requests || !volumeChart || !statusChart) return;

    // Status Chart Data
    const pending = requests.filter(r => r.status === 'pending').length;
    const approved = requests.filter(r => r.status === 'approved').length;
    const rejected = requests.filter(r => r.status === 'rejected').length;

    statusChart.data.datasets[0].data = [pending, approved, rejected];
    statusChart.update();

    // Volume Chart Data (Last 7 Days)
    const days = [];
    const counts = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        days.push(label);

        // Count requests for this day
        // Simplified: Assuming req.timestamp is ms
        const startOfDay = new Date(d.setHours(0, 0, 0, 0)).getTime();
        const endOfDay = new Date(d.setHours(23, 59, 59, 999)).getTime();

        const count = requests.filter(r => {
            if (!r.timestamp) return false;
            const t = new Date(r.timestamp).getTime();
            return t >= startOfDay && t <= endOfDay;
        }).length;

        counts.push(count);
    }

    volumeChart.data.labels = days;
    volumeChart.data.datasets[0].data = counts;
    volumeChart.update();

    // --- Top Daily Bonuses Logic ---
    updateTopBonuses(requests);

    // --- Analysis Dashboard Logic ---
    updateAnalysisDashboard();

    // --- Peak Hours Logic (Last 24 Hours) ---
    if (peakHoursChart) {
        const peakCounts = new Array(24).fill(0);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1); // Last 24h context or just all time?
        // Let's do All Time for "Typical Day" analysis, or Last 7 days to be relevant

        // Filter Last 7 Days for Peak Analysis
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        requests.forEach(r => {
            if (!r.timestamp) return;
            const d = new Date(r.timestamp);
            if (d >= weekAgo) {
                const hour = d.getHours();
                peakCounts[hour]++;
            }
        });

        peakHoursChart.data.datasets[0].data = peakCounts;
        peakHoursChart.update();
    }

    // --- Top Users Logic ---
    updateTopUsers();
}

// --- Analysis Dashboard Functions ---
function updateAnalysisDashboard() {
    const dashboard = document.querySelector('.analysis-dashboard');
    if (!dashboard) return;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    // Helper: Mode function
    const getMode = (arr) => {
        if (arr.length === 0) return '--';
        const counts = {};
        let max = 0;
        let mode = null;
        arr.forEach(val => {
            counts[val] = (counts[val] || 0) + 1;
            if (counts[val] > max) {
                max = counts[val];
                mode = val;
            }
        });
        return mode;
    };

    // Helper: Uniques
    const getUniqueUsers = (arr) => new Set(arr.map(r => r.username)).size;

    // 1. Today Stats
    const todayReqs = requests.filter(r => r.timestamp && new Date(r.timestamp).getTime() >= todayStart);

    document.getElementById('dateToday').textContent = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    document.getElementById('todayTotal').textContent = todayReqs.length;
    document.getElementById('todayApproved').textContent = todayReqs.filter(r => r.status === 'approved').length;
    document.getElementById('todayUsers').textContent = getUniqueUsers(todayReqs);
    document.getElementById('todayTop').textContent = getMode(todayReqs.map(r => r.bonusTypeLabel || r.bonusType));

    // 2. Last 7 Days
    const weekReqs = requests.filter(r => r.timestamp && new Date(r.timestamp).getTime() >= weekAgo);
    const dayDiffWeek = 7;
    const weekAvg = (weekReqs.length / dayDiffWeek).toFixed(1);
    const weekApproved = weekReqs.filter(r => r.status === 'approved').length;
    const weekRate = weekReqs.length > 0 ? ((weekApproved / weekReqs.length) * 100).toFixed(0) + '%' : '0%';

    // Trend Logic (Compare last 7 days vs previous 7 days)
    const prevWeekAgo = weekAgo - 7 * 24 * 60 * 60 * 1000;
    const prevWeekReqs = requests.filter(r => {
        const t = r.timestamp && new Date(r.timestamp).getTime();
        return t >= prevWeekAgo && t < weekAgo;
    });
    const weekTrendDiff = weekReqs.length - prevWeekReqs.length;
    const weekTrendSign = weekTrendDiff >= 0 ? '+' : '';
    const weekTrendText = `${weekTrendSign}${weekTrendDiff} vs geçen hafta`;

    document.getElementById('dateWeek').textContent = 'Son 7 Gün';
    document.getElementById('weekTotal').textContent = weekReqs.length;
    document.getElementById('weekAvg').textContent = weekAvg;
    document.getElementById('weekRate').textContent = weekRate;
    document.getElementById('weekTrend').textContent = weekTrendText;

    // 3. Last 30 Days
    const monthReqs = requests.filter(r => r.timestamp && new Date(r.timestamp).getTime() >= monthAgo);

    // Growth (Compare last 30 vs previous 30)
    const prevMonthAgo = monthAgo - 30 * 24 * 60 * 60 * 1000;
    const prevMonthReqs = requests.filter(r => {
        const t = r.timestamp && new Date(r.timestamp).getTime();
        return t >= prevMonthAgo && t < monthAgo;
    });

    let monthGrowth = '0%';
    if (prevMonthReqs.length > 0) {
        const growth = ((monthReqs.length - prevMonthReqs.length) / prevMonthReqs.length) * 100;
        monthGrowth = (growth > 0 ? '+' : '') + growth.toFixed(0) + '%';
    } else if (monthReqs.length > 0) {
        monthGrowth = '+100%'; // Infinite growth if prev was 0
    }

    document.getElementById('dateMonth').textContent = 'Son 30 Gün';
    document.getElementById('monthTotal').textContent = monthReqs.length;
    document.getElementById('monthUsers').textContent = getUniqueUsers(monthReqs);
    document.getElementById('monthTop').textContent = getMode(monthReqs.map(r => r.bonusTypeLabel || r.bonusType));
    document.getElementById('monthGrowth').textContent = monthGrowth;
}

function updateTopBonuses(data) {
    const listContainer = document.getElementById('topBonusList');
    if (!listContainer) return;

    // Get today and yesterday timestamps
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    // Filter for Today
    const todaysRequests = data.filter(r => {
        if (!r.timestamp) return false;
        const t = new Date(r.timestamp).getTime();
        return t >= startOfToday;
    });

    // Filter for Yesterday (for trend comparison)
    const yesterdaysRequests = data.filter(r => {
        if (!r.timestamp) return false;
        const t = new Date(r.timestamp).getTime();
        return t >= startOfYesterday && t < startOfToday;
    });

    if (todaysRequests.length === 0) {
        listContainer.innerHTML = '<div class="empty-state-start">Bugün henüz işlem yok.</div>';
        return;
    }

    // Aggregate by Type for Today
    const todayCounts = {};
    const todayUsers = {};
    todaysRequests.forEach(r => {
        const type = r.bonusTypeLabel || r.bonusType;
        todayCounts[type] = (todayCounts[type] || 0) + 1;
        if (!todayUsers[type]) todayUsers[type] = new Set();
        todayUsers[type].add(r.username);
    });

    // Aggregate by Type for Yesterday
    const yesterdayCounts = {};
    yesterdaysRequests.forEach(r => {
        const type = r.bonusTypeLabel || r.bonusType;
        yesterdayCounts[type] = (yesterdayCounts[type] || 0) + 1;
    });

    // Calculate totals for percentage
    const totalToday = todaysRequests.length;
    const maxCount = Math.max(...Object.values(todayCounts));

    // Sort
    const sorted = Object.entries(todayCounts)
        .sort(([, a], [, b]) => b - a);

    // Render enhanced widget
    listContainer.innerHTML = sorted.map(([name, count], index) => {
        const rank = index + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'top-1';
        else if (rank === 2) rankClass = 'top-2';
        else if (rank === 3) rankClass = 'top-3';

        // Calculate percentage
        const percentage = ((count / totalToday) * 100).toFixed(0);

        // Calculate progress bar width
        const progressWidth = ((count / maxCount) * 100).toFixed(0);

        // Unique user count
        const uniqueUsers = todayUsers[name] ? todayUsers[name].size : 0;

        // Trend comparison with yesterday
        const yesterdayCount = yesterdayCounts[name] || 0;
        let trendIcon = '';
        let trendClass = '';
        if (count > yesterdayCount) {
            trendIcon = '↑';
            trendClass = 'trend-up';
        } else if (count < yesterdayCount) {
            trendIcon = '↓';
            trendClass = 'trend-down';
        } else {
            trendIcon = '→';
            trendClass = 'trend-neutral';
        }

        return `
            <div class="top-bonus-item enhanced">
                <div class="tb-header">
                    <div class="tb-rank ${rankClass}">${rank}</div>
                            <div class="tb-name">${escapeHtml(name)}</div>
                    <div class="tb-trend ${trendClass}">${trendIcon}</div>
                </div>
                <div class="tb-progress-container">
                    <div class="tb-progress-bar" style="width: ${progressWidth}%"></div>
                </div>
                <div class="tb-details">
                    <div class="tb-stat">
                        <span class="tb-stat-value">${count}</span>
                        <span class="tb-stat-label">talep</span>
                    </div>
                    <div class="tb-stat">
                        <span class="tb-stat-value">${percentage}%</span>
                        <span class="tb-stat-label">oran</span>
                    </div>
                    <div class="tb-stat">
                        <span class="tb-stat-value">${uniqueUsers}</span>
                        <span class="tb-stat-label">kullanıcı</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateTopUsers() {
    const tableBody = document.querySelector('#topUsersTable tbody');
    const filterSelect = document.getElementById('topUserFilter');
    if (!tableBody || !filterSelect) return;

    let period = filterSelect.value; // today, week, month
    const now = new Date();
    let startTime;

    // Standardize "Today" as Calendar Day (00:00)
    // Week = Last 7 Days rolling
    // Month = Last 30 Days rolling
    if (period === 'today') {
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === 'week') {
        startTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    } else {
        startTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }

    const filteredReqs = requests.filter(r => {
        if (!r.timestamp) return false;
        return new Date(r.timestamp).getTime() >= startTime;
    });

    if (filteredReqs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 1rem;">Veri yok.</td></tr>';
        return;
    }

    // Aggregate Users
    const userStats = {};
    filteredReqs.forEach(r => {
        if (!userStats[r.username]) {
            userStats[r.username] = { total: 0, approved: 0 };
        }
        userStats[r.username].total++;
        if (r.status === 'approved') userStats[r.username].approved++;
    });

    // Sort by Total Descending
    const sortedUsers = Object.entries(userStats)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 5); // Top 5

    // Render
    tableBody.innerHTML = sortedUsers.map(([username, stats]) => {
        const rate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(0) : 0;
        return `
            <tr>
                <td style="font-weight: 500; color: #fff;">${escapeHtml(username)}</td>
                <td class="text-right">${stats.total}</td>
                <td class="text-right success-text" style="color:#10b981">${stats.approved}</td>
                <td class="text-right">${rate}%</td>
            </tr>
        `;
    }).join('');
}

// Add Event Listener for Top User Filter
document.addEventListener('DOMContentLoaded', () => {
    const topUserFilter = document.getElementById('topUserFilter');
    if (topUserFilter) {
        topUserFilter.addEventListener('change', () => {
            updateTopUsers(); // Re-run only this part
        });
    }
});

function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Get current admin ID and status
    const currentAdminId = localStorage.getItem('vegas_admin_id');
    const currentAdminStatus = localStorage.getItem('vegas_admin_status') || 'online';

    debugLog('🔄 renderTable() - Admin:', currentAdminId, 'Status:', currentAdminStatus);
    debugLog('   Total requests:', requests.length);

    // Filter Logic based on admin status
    let filtered = requests.filter(req => {
        // Show all non-pending (approved/rejected) for history
        if (req.status !== 'pending') return true;
        
        // If admin is offline or on break, don't show pending requests
        if (currentAdminStatus === 'offline' || currentAdminStatus === 'break') return false;
        
        // NEW: Online admins see ALL pending requests (unclaimed + their own claimed)
        // Requests claimed by OTHER admins are hidden
        return !req.assignedTo || req.assignedTo === currentAdminId;
    });
    
    const pendingVisible = filtered.filter(r => r.status === 'pending').length;
    const unclaimedCount = filtered.filter(r => r.status === 'pending' && !r.assignedTo).length;
    debugLog('   Pending visible:', pendingVisible, '(Unclaimed:', unclaimedCount + ')');

    // Search
    if (searchInput && searchInput.value) {
        const term = searchInput.value.toLowerCase();
        filtered = filtered.filter(r =>
            r.username.toLowerCase().includes(term) ||
            r.id.toLowerCase().includes(term)
        );
    }

    // Type Filter
    if (filterType && filterType.value !== 'all') {
        filtered = filtered.filter(r => r.bonusType === filterType.value);
    }

    // Status Filter
    if (filterStatus && filterStatus.value !== 'all') {
        filtered = filtered.filter(r => r.status === filterStatus.value);
    }

    // Date Filter
    if (filterDate && filterDate.value !== 'all') {
        const now = new Date();
        let startDate;

        if (filterDate.value === 'today') {
            startDate = new Date(now.setHours(0, 0, 0, 0));
        } else if (filterDate.value === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (filterDate.value === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (startDate) {
            filtered = filtered.filter(r => {
                if (!r.timestamp) return false;
                return new Date(r.timestamp) >= startDate;
            });
        }
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">Kayıt bulunamadı.</td></tr>';
        return;
    }

    filtered.forEach(req => {
        const row = document.createElement('tr');

        // Format Date
        const dateObj = new Date(req.timestamp);
        const dateStr = dateObj.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        // Status Class
        let statusClass = 'status-pending';
        let statusText = 'Beklemede';
        let processedByText = '';
        
        if (req.status === 'approved') {
            statusClass = 'status-approved';
            statusText = 'Onaylandı';
            if (req.processedByName) processedByText = req.processedByName;
        } else if (req.status === 'rejected') {
            statusClass = 'status-rejected';
            statusText = 'Reddedildi';
            if (req.processedByName) processedByText = req.processedByName;
        } else if (req.status === 'pending' && !req.assignedTo) {
            statusClass = 'status-new';
            statusText = '🆕 Yeni';
        } else if (req.status === 'pending' && req.assignedTo === localStorage.getItem('vegas_admin_id')) {
            statusClass = 'status-pending';
            statusText = '📋 Sizde';
        }

        // Bonus Tag Class (Simplified)
        let tagClass = 'tag-welcome';
        if (req.bonusType === 'loss') tagClass = 'tag-loss';
        if (req.bonusType === 'freespins') tagClass = 'tag-spins';

        // Truncate Note - Show admin note for processed requests, user note for pending
        let noteDisplay = '-';
        if (req.status === 'approved' || req.status === 'rejected') {
            noteDisplay = req.adminNote ? req.adminNote : '-';
        } else {
            noteDisplay = req.note ? req.note : '-';
        }
        if (noteDisplay.length > 50) noteDisplay = noteDisplay.substring(0, 50) + '...';

        row.innerHTML = `
                <td class="col-check">
                    <input type="checkbox" class="row-checkbox" value="${req.id}">
                </td>
                <td class="col-id">${req.id}</td>
                <td class="col-user">
                    <div class="user-cell">
                        <div class="avatar-sm">${req.username.substring(0, 2).toUpperCase()}</div>
                        <span>${escapeHtml(req.username)}</span>
                    </div>
                </td>
                <td><span class="bonus-tag ${tagClass}">${escapeHtml(req.bonusTypeLabel)}</span></td>
                <td class="col-note">
                    <span class="note-truncate">${escapeHtml(noteDisplay)}</span>
                </td>
                <td class="col-date">${dateStr}</td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${processedByText ? `<div class="processed-by-label">👤 ${escapeHtml(processedByText)}</div>` : ''}
                </td>
                <td class="col-actions">
                    <button class="action-btn btn-view" data-id="${req.id}" title="Detaylar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    ${req.status === 'pending' ? `
                    <button class="action-btn btn-approve" data-id="${req.id}" title="Onayla">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button class="action-btn btn-reject" data-id="${req.id}" title="Reddet">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    ` : ''}
                </td>
            `;
        tableBody.appendChild(row);
    });
}

async function viewRequest(id) {
    const req = requests.find(r => r.id === id);
    if (!req) return;

    const currentAdminId = localStorage.getItem('vegas_admin_id');
    
    // Check if request is claimed by another admin
    if (req.assignedTo && req.assignedTo !== currentAdminId) {
        showToast('Talep Alınmış', 'Bu talep başka bir admin tarafından işleniyor.', 'warning');
        await loadRequests(); // Refresh to update list
        return;
    }
    
    // If unclaimed and pending, claim it for this admin
    if (!req.assignedTo && req.status === 'pending') {
        debugLog('Claiming request', req.dbId, 'for admin', currentAdminId);
        const success = await assignRequestToAdmin(req.dbId, currentAdminId);
        if (success) {
            req.assignedTo = currentAdminId;
            showToast('Talep Alındı', 'Bu talep size atandı.', 'success');
            await loadRequests(); // Refresh to update counts
        }
    }

    currentRequestId = id;

    // Populate Modal
    if (modalReqId) modalReqId.textContent = req.id;
    if (modalAvatar) modalAvatar.textContent = req.username.substring(0, 2).toUpperCase();
    if (modalUsername) modalUsername.textContent = req.username;
    if (modalBonusType) modalBonusType.textContent = req.bonusTypeLabel;
    if (modalTime) {
        const d = new Date(req.timestamp);
        modalTime.textContent = d.toLocaleString('tr-TR');
    }
    if (modalNote) modalNote.textContent = req.note || 'Not yok.';
    
    // Show Admin Note if exists (for processed requests)
    const modalAdminNote = document.getElementById('modalAdminNote');
    const modalAdminNoteSection = document.getElementById('modalAdminNoteSection');
    if (modalAdminNoteSection && modalAdminNote) {
        if (req.adminNote && req.adminNote.trim()) {
            modalAdminNote.textContent = req.adminNote;
            modalAdminNoteSection.style.display = 'block';
        } else {
            modalAdminNoteSection.style.display = 'none';
        }
    }
    
    // Show who processed the request
    const modalProcessedBy = document.getElementById('modalProcessedBy');
    const modalProcessedBySection = document.getElementById('modalProcessedBySection');
    if (modalProcessedBySection && modalProcessedBy) {
        if (req.processedByName && req.status !== 'pending') {
            const processedDate = req.processedAt ? new Date(req.processedAt).toLocaleString('tr-TR') : '';
            modalProcessedBy.innerHTML = `<strong>${escapeHtml(req.processedByName)}</strong>${processedDate ? ' - ' + processedDate : ''}`;
            modalProcessedBySection.style.display = 'block';
        } else {
            modalProcessedBySection.style.display = 'none';
        }
    }

    // Populate History
    const modalHistory = document.getElementById('modalHistory');
    if (modalHistory) {
        const userHistory = requests.filter(r => r.username === req.username && r.id !== req.id);
        userHistory.sort((a, b) => b.timestamp - a.timestamp); // Newest first

        if (userHistory.length === 0) {
            modalHistory.innerHTML = '<div style="padding:12px; color: #64748b; text-align:center;">Başka kayıt yok.</div>';
        } else {
            modalHistory.innerHTML = userHistory.map(h => {
                const date = new Date(h.timestamp).toLocaleDateString('tr-TR');
                let stClass = 'pending';
                let stText = 'Bekliyor';
                if (h.status === 'approved') { stClass = 'approved'; stText = 'Onay'; }
                if (h.status === 'rejected') { stClass = 'rejected'; stText = 'Red'; }

                return `
                    <div class="history-item">
                        <span class="h-date">${date}</span>
                        <span class="h-type">${h.bonusTypeLabel}</span>
                        <span class="h-status ${stClass}">${stText}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // Show/Hide buttons based on status
    if (req.status !== 'pending') {
        modalApproveBtn.style.display = 'none';
        modalRejectBtn.style.display = 'none';
    } else {
        modalApproveBtn.style.display = 'inline-flex';
        modalRejectBtn.style.display = 'inline-flex';
    }

    detailModal.classList.remove('hidden');
}

function openConfirm(id, actionType) {
    const req = requests.find(r => r.id === id);
    if (!req) return;

    currentRequestId = id;
    currentActionType = actionType;

    if (confirmUsername) confirmUsername.textContent = req.username;
    if (confirmBonusType) confirmBonusType.textContent = req.bonusTypeLabel;

    if (actionType === 'reject') {
        if (confirmTitle) confirmTitle.textContent = 'Talebi Reddet?';
        if (confirmActionBtn) {
            confirmActionBtn.textContent = 'Reddet';
            confirmActionBtn.className = 'btn-confirm btn-reject-lg'; // Style as reject
            // Make sure we have CSS for btn-reject-lg or use inline style/class swap
            confirmActionBtn.style.backgroundColor = '#ef4444'; // Force red for now or rely on class
        }
        if (confirmIcon) {
            confirmIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        }
    } else {
        // Default to Approve
        if (confirmTitle) confirmTitle.textContent = 'Talebi Onayla?';
        if (confirmActionBtn) {
            confirmActionBtn.textContent = 'Onayla';
            confirmActionBtn.className = 'btn-confirm'; // Reset/Standard style
            confirmActionBtn.style.backgroundColor = '';
        }
        if (confirmIcon) {
            confirmIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        }
    }

    // Render hashtag buttons based on action type
    renderHashtagButtons(actionType);

    // Show/hide block user checkbox (only for reject action)
    const blockUserSection = document.getElementById('blockUserSection');
    const blockUserCheckbox = document.getElementById('blockUserCheckbox');
    if (blockUserSection) {
        if (actionType === 'reject') {
            blockUserSection.classList.remove('hidden');
        } else {
            blockUserSection.classList.add('hidden');
        }
    }
    if (blockUserCheckbox) blockUserCheckbox.checked = false;

    confirmModal.classList.remove('hidden');
    // Clear admin note input
    const noteInput = document.getElementById('adminNoteInput');
    if (noteInput) noteInput.value = '';
}

async function rejectRequest(id) {
    const req = requests.find(r => r.id === id);
    if (req && req.dbId) {
        const adminNote = document.getElementById('adminNoteInput')?.value || '';
        await saveRequestStatus(req.dbId, 'rejected', adminNote);
        
        // Check if block checkbox is checked
        const blockUserCheckbox = document.getElementById('blockUserCheckbox');
        if (blockUserCheckbox && blockUserCheckbox.checked) {
            const currentAdminId = localStorage.getItem('vegas_admin_id');
            const reason = adminNote || 'Spam/gereksiz talep';
            await blockUser(req.username.toLowerCase(), currentAdminId, reason, 60); // 60 minutes = 1 hour
            showToast('Talep Reddedildi & Kullanıcı Engellendi', `${req.username} 1 saat engellendi.`, 'error');
            // Update blocked badge
            loadBlockedUsersBadge();
        } else {
            showToast('Talep Reddedildi', `${id} başarıyla reddedildi.`, 'error');
        }
        
        closeConfirmModal();
        closeDetailModal();
    }
}

async function approveRequest(id) {
    const req = requests.find(r => r.id === id);
    if (req && req.dbId) {
        const adminNote = document.getElementById('adminNoteInput')?.value || '';
        await saveRequestStatus(req.dbId, 'approved', adminNote);
        showToast('Talep Onaylandı', `${id} başarıyla onaylandı.`, 'success');
        closeConfirmModal();
        closeDetailModal();
    }
}

// --- Modal Actions ---
function closeDetailModal() {
    if (detailModal) detailModal.classList.add('hidden');
    currentRequestId = null;
}

function closeConfirmModal() {
    if (confirmModal) confirmModal.classList.add('hidden');
}

// Modal Buttons from Detail View
if (modalApproveBtn) {
    modalApproveBtn.addEventListener('click', () => {
        if (currentRequestId) openConfirm(currentRequestId, 'approve');
    });
}

if (modalRejectBtn) {
    modalRejectBtn.addEventListener('click', () => {
        if (currentRequestId) openConfirm(currentRequestId, 'reject');
    });
}

// Main Confirm Action
if (confirmActionBtn) {
    confirmActionBtn.addEventListener('click', () => {
        if (currentActionType === 'reject') {
            rejectRequest(currentRequestId);
        } else {
            approveRequest(currentRequestId);
        }
    });
}

// Listeners
if (closeModalBtn) closeModalBtn.addEventListener('click', closeDetailModal);
if (cancelConfirmBtn) cancelConfirmBtn.addEventListener('click', closeConfirmModal);
if (searchInput) searchInput.addEventListener('input', renderTable);
if (filterType) filterType.addEventListener('change', renderTable);
if (filterStatus) filterStatus.addEventListener('change', renderTable);
if (filterDate) filterDate.addEventListener('change', renderTable);

// CSV Export
if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
        exportToCsv();
    });
}

function exportToCsv() {
    if (!requests || requests.length === 0) {
        showToast('Uyarı', 'Dışa aktarılacak veri bulunamadı.', 'info');
        return;
    }

    // Apply current filters
    let filtered = requests;

    if (searchInput && searchInput.value) {
        const term = searchInput.value.toLowerCase();
        filtered = filtered.filter(r =>
            r.username.toLowerCase().includes(term) ||
            r.id.toLowerCase().includes(term)
        );
    }

    if (filterType && filterType.value !== 'all') {
        filtered = filtered.filter(r => r.bonusType === filterType.value);
    }

    if (filterStatus && filterStatus.value !== 'all') {
        filtered = filtered.filter(r => r.status === filterStatus.value);
    }

    if (filterDate && filterDate.value !== 'all') {
        const now = new Date();
        let startDate;

        if (filterDate.value === 'today') {
            startDate = new Date(now.setHours(0, 0, 0, 0));
        } else if (filterDate.value === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (filterDate.value === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (startDate) {
            filtered = filtered.filter(r => {
                if (!r.timestamp) return false;
                return new Date(r.timestamp) >= startDate;
            });
        }
    }

    if (filtered.length === 0) {
        showToast('Uyarı', 'Filtrelenen sonuçta veri yok.', 'info');
        return;
    }

    // Build CSV content
    const headers = ['Talep ID', 'Kullanıcı Adı', 'Bonus Türü', 'Not', 'Tarih', 'Durum'];
    const rows = filtered.map(r => {
        const date = new Date(r.timestamp).toLocaleString('tr-TR');
        let status = 'Beklemede';
        if (r.status === 'approved') status = 'Onaylandı';
        if (r.status === 'rejected') status = 'Reddedildi';

        // Escape quotes in fields
        const note = (r.note || '').replace(/"/g, '""');

        return [
            r.id,
            r.username,
            r.bonusTypeLabel || r.bonusType,
            `"${escapeHtml(note)}"`,
            date,
            status
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create and download file
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `bonus_talepleri_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Başarılı', `${filtered.length} kayıt CSV olarak indirildi.`, 'success');
}

// Table Actions Listener
if (tableBody) {
    tableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn) return;

        const id = btn.dataset.id;
        if (!id) return;

        if (btn.classList.contains('btn-view')) {
            viewRequest(id);
        } else if (btn.classList.contains('btn-approve')) {
            openConfirm(id, 'approve');
        } else if (btn.classList.contains('btn-reject')) {
            openConfirm(id, 'reject');
        }
    });
}

// Sidebar Navigation Event Listeners
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        handleNavigation(view);
    });
});

function handleNavigation(view) {
    // Save current tab to restore after refresh
    sessionStorage.setItem('vegas_admin_tab', view);
    
    // Update Active State
    navItems.forEach(nav => nav.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Default Elements
    const statsGrid = document.querySelector('.stats-grid');
    const analyticsSection = document.getElementById('analyticsSection');
    const filterBar = document.querySelector('.filter-bar');
    const tableContainer = document.querySelector('.table-container');
    const paginationBar = document.querySelector('.pagination-bar');
    const bulkActionBar = document.getElementById('bulkActionBar');

    const dashboardWidgets = document.getElementById('dashboardWidgets');

    const settingsSection = document.getElementById('settingsSection');
    const bonusManagementSection = document.getElementById('bonusManagementSection');
    const personnelManagementSection = document.getElementById('personnelManagementSection');
    const hashtagManagementSection = document.getElementById('hashtagManagementSection');
    const performanceSection = document.getElementById('performanceSection');
    const blockedUsersSection = document.getElementById('blockedUsersSection');

    // Reset All Views First
    if (statsGrid) statsGrid.style.display = 'none';
    if (dashboardWidgets) dashboardWidgets.style.display = 'none';
    if (settingsSection) settingsSection.style.display = 'none';
    if (bonusManagementSection) bonusManagementSection.style.display = 'none';
    if (personnelManagementSection) personnelManagementSection.style.display = 'none';
    if (hashtagManagementSection) hashtagManagementSection.style.display = 'none';
    if (performanceSection) performanceSection.style.display = 'none';
    if (blockedUsersSection) blockedUsersSection.style.display = 'none';
    if (analyticsSection) {
        analyticsSection.classList.add('hidden');
        analyticsSection.style.display = 'none';
    }

    // Hide table elements by default
    if (filterBar) filterBar.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'none';
    if (paginationBar) paginationBar.style.display = 'none';
    if (bulkActionBar) bulkActionBar.style.display = 'none';

    // Show View Logic
    if (view === 'dashboard') {
        if (pageTitle) pageTitle.textContent = 'Yönetim Paneli';

        if (statsGrid) statsGrid.style.display = 'grid';
        if (dashboardWidgets) dashboardWidgets.style.display = 'grid';

        // Table hidden on dashboard

    } else if (view === 'analytics') {
        if (pageTitle) pageTitle.textContent = 'Analiz Merkezi';

        if (analyticsSection) {
            analyticsSection.classList.remove('hidden');
            analyticsSection.style.display = 'block';
        }

        // Init/Update Charts when entering Analytics
        setTimeout(() => {
            if (!volumeChart) initCharts();
            updateCharts();
        }, 50);

    } else if (view === 'requests') {
        if (pageTitle) pageTitle.textContent = 'Tüm Talepler';
        showReqTable('all');
    } else if (view === 'approved') {
        if (pageTitle) pageTitle.textContent = 'Onaylananlar';
        showReqTable('approved');
    } else if (view === 'rejected') {
        if (pageTitle) pageTitle.textContent = 'Reddedilenler';
        showReqTable('rejected');
    } else if (view === 'settings') {
        if (pageTitle) pageTitle.textContent = 'Ayarlar';
        const settingsSection = document.getElementById('settingsSection');
        if (settingsSection) {
            settingsSection.style.display = 'grid';
            loadAdminList();
        }
    } else if (view === 'bonusManagement') {
        if (pageTitle) pageTitle.textContent = 'Bonus Yönetimi';
        const bonusManagementSection = document.getElementById('bonusManagementSection');
        if (bonusManagementSection) {
            bonusManagementSection.style.display = 'block';
            loadBonusTypesList();
        }
    } else if (view === 'personnelManagement') {
        if (pageTitle) pageTitle.textContent = 'Personel Yönetimi';
        const personnelManagementSection = document.getElementById('personnelManagementSection');
        if (personnelManagementSection) {
            personnelManagementSection.style.display = 'block';
            loadPersonnelList();
        }
    } else if (view === 'hashtagManagement') {
        if (pageTitle) pageTitle.textContent = 'Not Şablonları';
        const hashtagManagementSection = document.getElementById('hashtagManagementSection');
        if (hashtagManagementSection) {
            hashtagManagementSection.style.display = 'block';
            loadHashtagManagement();
        }
    } else if (view === 'performance') {
        if (pageTitle) pageTitle.textContent = 'Performans İstatistikleri';
        const performanceSection = document.getElementById('performanceSection');
        if (performanceSection) {
            performanceSection.style.display = 'block';
            loadPerformanceStats();
        }
    } else if (view === 'blockedUsers') {
        if (pageTitle) pageTitle.textContent = 'Engelli Üyeler';
        const blockedUsersSection = document.getElementById('blockedUsersSection');
        if (blockedUsersSection) {
            blockedUsersSection.style.display = 'block';
            loadBlockedUsers();
        }
    }
}

function showReqTable(status) {
    const filterBar = document.querySelector('.filter-bar');
    const tableContainer = document.querySelector('.table-container');
    const paginationBar = document.querySelector('.pagination-bar');
    const filterStatus = document.getElementById('filterStatus');

    if (filterBar) filterBar.style.display = 'flex';
    if (tableContainer) tableContainer.style.display = 'block';
    if (paginationBar) paginationBar.style.display = 'flex';

    if (filterStatus && status !== 'all') {
        filterStatus.value = status;
    } else if (filterStatus) {
        filterStatus.value = 'all';
    }

    renderTable();
}


// Click outside
window.onclick = function (event) {
    if (event.target == detailModal) closeDetailModal();
    if (event.target == confirmModal) closeConfirmModal();
}

// Toast
function showToast(title, message, type = 'info') {
    const container = document.querySelector('.toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
            <div class="toast-icon">${iconSvg}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;

    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.4s forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}

// --- Admin User Management ---

// Admin functions now use Supabase via supabase.js

async function getAdminsList() {
    return await getAdmins();
}

function getCurrentUserRole() {
    return localStorage.getItem('vegas_admin_role') || 'admin';
}



function canManageUsers() {
    const role = getCurrentUserRole();
    return role === 'admin';
}

function getRoleLabel(role) {
    const labels = {
        'admin': 'Admin',
        'senior_agent': 'Senior Agent'
    };
    return labels[role] || role;
}

async function loadAdminList() {
    const adminList = document.getElementById('adminList');
    const adminCount = document.getElementById('adminCount');
    if (!adminList) return;

    // Hide add form for Senior Agents
    const addAdminFormEl = document.getElementById('addAdminForm');
    if (addAdminFormEl) {
        addAdminFormEl.style.display = canManageUsers() ? 'block' : 'none';
    }

    const admins = await getAdmins();
    const currentUser = localStorage.getItem('vegas_admin_user');

    if (adminCount) adminCount.textContent = admins.length;

    if (admins.length === 0) {
        adminList.innerHTML = '<div class="empty-state">Henüz admin yok</div>';
        return;
    }

    adminList.innerHTML = admins.map(admin => {
        const isCurrentUser = admin.username === currentUser;
        const isSuperAdmin = admin.isDefault;
        
        return `
            <div class="admin-item ${isCurrentUser ? 'current-user' : ''}">
                <div class="admin-avatar">${admin.username.substring(0, 2).toUpperCase()}</div>
                <div class="admin-info">
                    <div class="admin-name">
                        ${escapeHtml(admin.username)}
                        ${isCurrentUser ? '<span class="badge-you">Sen</span>' : ''}
                        ${isSuperAdmin ? '<span class="badge-super">Süper Admin</span>' : '<span class="badge-role">' + getRoleLabel(admin.role || 'admin') + '</span>'}
                    </div>
                    <div class="admin-meta">Oluşturulma: ${new Date(admin.createdAt).toLocaleDateString('tr-TR')}</div>
                </div>
                <div class="admin-actions">
                    ${!isSuperAdmin ? `
                        <button class="btn-delete-admin" onclick="deleteAdminUser('${admin.id}')" title="Sil">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    ` : '<span class="protected-badge">Korumalı</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function addAdmin(username, password, role = 'admin') {
    const admins = getAdmins();
    
    // Check if username already exists
    if (admins.find(a => a.username.toLowerCase() === username.toLowerCase())) {
        showToast('Hata', 'Bu kullanıcı adı zaten mevcut.', 'error');
        return false;
    }

    const newAdmin = {
        id: 'admin_' + Date.now(),
        username: username,
        password: password,
        role: role,
        createdAt: new Date().toISOString(),
        isDefault: false
    };

    admins.push(newAdmin);
    saveAdmins(admins);
    loadAdminList();
    showToast('Başarılı', `${escapeHtml(username)} admin olarak eklendi.`, 'success');
    return true;
}

async function deleteAdminUser(adminId) {
    const admins = await getAdmins();
    const admin = admins.find(a => a.id === adminId);
    
    if (!admin) return;
    
    if (admin.is_default) {
        showToast('Hata', 'Süper admin silinemez.', 'error');
        return;
    }

    const currentUser = localStorage.getItem('vegas_admin_user');
    if (admin.username === currentUser) {
        showToast('Hata', 'Kendinizi silemezsiniz.', 'error');
        return;
    }

    if (!confirm(`${escapeHtml(admin.username)} adlı admini silmek istediğinize emin misiniz?`)) {
        return;
    }

    const success = await deleteAdmin(adminId);
    if (success) {
        await loadAdminList();
        showToast('Başarılı', `${escapeHtml(admin.username)} silindi.`, 'success');
    }
}

// Add Admin Form Handler
const addAdminForm = document.getElementById('addAdminForm');
if (addAdminForm) {
    addAdminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newAdminUsername').value.trim();
        const password = document.getElementById('newAdminPassword').value.trim();
        const role = document.getElementById('newAdminRole').value;

        if (username.length < 3) {
            showToast('Hata', 'Kullanıcı adı en az 3 karakter olmalı.', 'error');
            return;
        }

        if (password.length < 4) {
            showToast('Hata', 'Şifre en az 4 karakter olmalı.', 'error');
            return;
        }

        const result = await addAdminSecure(username, password, role);
        if (result) {
            addAdminForm.reset();
            showToast('Başarılı', username + ' eklendi.', 'success');
            await loadAdminList();
        } else {
            showToast('Hata', 'Admin eklenemedi.', 'error');
        }
    });
}

// --- Profile Settings (Change Password) ---
const profileForm = document.getElementById('profileForm');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        const currentUser = localStorage.getItem('vegas_admin_user');
        const admins = await getAdmins();
        const admin = admins.find(a => a.username === currentUser);

        if (!admin) {
            showToast('Hata', 'Kullanıcı bulunamadı.', 'error');
            return;
        }

        if (admin.password !== currentPassword) {
            showToast('Hata', 'Mevcut şifre yanlış.', 'error');
            return;
        }

        if (newPassword.length < 4) {
            showToast('Hata', 'Yeni şifre en az 4 karakter olmalı.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('Hata', 'Yeni şifreler eşleşmiyor.', 'error');
            return;
        }

        // Update password via Supabase
        const adminId = localStorage.getItem('vegas_admin_id');
        const success = await updateAdminPasswordSecure(adminId, newPassword);
        if (success) {
            profileForm.reset();
            showToast('Başarılı', 'Şifreniz güncellendi.', 'success');
        } else {
            showToast('Hata', 'Şifre güncellenirken hata oluştu.', 'error');
        }
    });
}

// ============================================
// BONUS MANAGEMENT
// ============================================

async function loadBonusTypesList() {
    const container = document.getElementById('bonusTypesList');
    if (!container) return;
    
    try {
        const types = await getAllBonusTypes();
        
        if (types.length === 0) {
            container.innerHTML = '<div class="empty-state">Henüz bonus türü yok.</div>';
            return;
        }
        
        container.innerHTML = types.map(t => `
            <div class="bonus-type-item" data-id="${t.id}">
                <div class="bonus-type-info">
                    <span class="bonus-type-icon">${escapeHtml(t.icon) || '🎁'}</span>
                    <div>
                        <div class="bonus-type-name">${escapeHtml(t.label)}</div>
                        <div class="bonus-type-code">${escapeHtml(t.name)}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span class="bonus-type-status ${t.is_active ? 'active' : 'inactive'}">
                        ${t.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                    <div class="bonus-type-actions">
                        <button class="btn-icon view" onclick="toggleBonusStatus('${t.id}', ${!t.is_active})" title="${t.is_active ? 'Pasifleştir' : 'Aktifleştir'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="btn-icon edit" onclick="editBonusType('${t.id}')" title="Düzenle">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="deleteBonusTypeItem('${t.id}')" title="Sil">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error loading bonus types:', e);
        container.innerHTML = '<div class="empty-state">Yüklenirken hata oluştu.</div>';
    }
}

let bonusTypesCache = [];

async function editBonusType(id) {
    const types = await getAllBonusTypes();
    const type = types.find(t => t.id === id);
    if (!type) return;
    
    document.getElementById('bonusModalTitle').textContent = 'Bonus Düzenle';
    document.getElementById('bonusTypeId').value = id;
    document.getElementById('bonusTypeName').value = type.name;
    document.getElementById('bonusTypeLabel').value = type.label;
    document.getElementById('bonusTypeIcon').value = type.icon || '';
    document.getElementById('bonusTypeDesc').value = type.description || '';
    document.getElementById('bonusTypeActive').checked = type.is_active;
    
    document.getElementById('bonusModal').classList.remove('hidden');
}

async function toggleBonusStatus(id, newStatus) {
    const success = await updateBonusType(id, { is_active: newStatus });
    if (success) {
        showToast('Başarılı', 'Bonus durumu güncellendi.', 'success');
        loadBonusTypesList();
    }
}

async function deleteBonusTypeItem(id) {
    if (!confirm('Bu bonus türünü silmek istediğinize emin misiniz?')) return;
    
    const success = await deleteBonusType(id);
    if (success) {
        showToast('Başarılı', 'Bonus türü silindi.', 'success');
        loadBonusTypesList();
    } else {
        showToast('Hata', 'Silinemedi.', 'error');
    }
}

// Bonus Modal Events
document.getElementById('addBonusTypeBtn')?.addEventListener('click', () => {
    document.getElementById('bonusModalTitle').textContent = 'Yeni Bonus Ekle';
    document.getElementById('bonusTypeForm').reset();
    document.getElementById('bonusTypeId').value = '';
    document.getElementById('bonusTypeActive').checked = true;
    document.getElementById('bonusModal').classList.remove('hidden');
});

document.getElementById('closeBonusModal')?.addEventListener('click', () => {
    document.getElementById('bonusModal').classList.add('hidden');
});

document.getElementById('bonusTypeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('bonusTypeId').value;
    const name = document.getElementById('bonusTypeName').value.trim();
    const label = document.getElementById('bonusTypeLabel').value.trim();
    const icon = document.getElementById('bonusTypeIcon').value.trim() || '🎁';
    const description = document.getElementById('bonusTypeDesc').value.trim();
    const isActive = document.getElementById('bonusTypeActive').checked;
    
    if (!name || !label) {
        showToast('Hata', 'Ad ve görünen ad zorunludur.', 'error');
        return;
    }
    
    let success;
    if (id) {
        success = await updateBonusType(id, { name, label, icon, description, is_active: isActive });
    } else {
        success = await addBonusType(name, label, icon, description);
    }
    
    if (success) {
        showToast('Başarılı', id ? 'Bonus güncellendi.' : 'Bonus eklendi.', 'success');
        document.getElementById('bonusModal').classList.add('hidden');
        loadBonusTypesList();
    } else {
        showToast('Hata', 'İşlem başarısız.', 'error');
    }
});

// ============================================
// PERSONNEL MANAGEMENT
// ============================================

async function loadPersonnelList() {
    const tbody = document.getElementById('personnelTableBody');
    if (!tbody) return;
    
    try {
        const admins = await getAdmins();
        
        if (admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Henüz personel yok.</td></tr>';
            return;
        }
        
        tbody.innerHTML = admins.map(a => {
            const date = new Date(a.created_at);
            const dateStr = date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'});
            const roleLabel = a.role === 'admin' ? 'Admin' : 'Senior Agent';
            const status = a.status || 'offline';
            const statusLabels = { online: 'Online', break: 'Mola', offline: 'Offline' };
            
            return `
                <tr>
                    <td><strong>${escapeHtml(a.username)}</strong></td>
                    <td>${escapeHtml(a.fullname) || '-'}</td>
                    <td><span class="role-badge ${a.role}">${roleLabel}</span></td>
                    <td>
                        <div class="personnel-status">
                            <span class="status-dot ${status}"></span>
                            <span>${statusLabels[status]}</span>
                        </div>
                    </td>
                    <td>${dateStr}</td>
                    <td>
                        <div class="bonus-type-actions">
                            <button class="btn-icon edit" onclick="editPersonnel('${a.id}')" title="Düzenle">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            ${!a.is_default ? `
                            <button class="btn-icon delete" onclick="deletePersonnel('${a.id}')" title="Sil">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading personnel:', e);
    }
}

let personnelCache = [];

async function editPersonnel(id) {
    const admins = await getAdmins();
    const person = admins.find(a => a.id === id);
    if (!person) return;
    
    document.getElementById('personnelModalTitle').textContent = 'Personel Düzenle';
    document.getElementById('personnelId').value = id;
    document.getElementById('personnelUsername').value = person.username;
    document.getElementById('personnelUsername').disabled = true;
    document.getElementById('personnelFullname').value = person.fullname || '';
    document.getElementById('personnelPassword').value = '';
    document.getElementById('personnelPassword').placeholder = 'Değiştirmek için yeni şifre girin';
    document.getElementById('personnelRole').value = person.role;
    
    document.getElementById('personnelModal').classList.remove('hidden');
}

async function deletePersonnel(id) {
    const admins = await getAdmins();
    const person = admins.find(a => a.id === id);
    if (!person) return;
    
    if (person.is_default) {
        showToast('Hata', 'Varsayılan admin silinemez.', 'error');
        return;
    }
    
    if (!confirm(`${person.username} adlı personeli silmek istediğinize emin misiniz?`)) return;
    
    const success = await deleteAdmin(id);
    if (success) {
        showToast('Başarılı', 'Personel silindi.', 'success');
        loadPersonnelList();
    } else {
        showToast('Hata', 'Silinemedi.', 'error');
    }
}

// Personnel Modal Events
document.getElementById('addPersonnelBtn')?.addEventListener('click', () => {
    document.getElementById('personnelModalTitle').textContent = 'Yeni Personel Ekle';
    document.getElementById('personnelForm').reset();
    document.getElementById('personnelId').value = '';
    document.getElementById('personnelUsername').disabled = false;
    document.getElementById('personnelPassword').placeholder = 'Zorunlu';
    document.getElementById('personnelModal').classList.remove('hidden');
});

document.getElementById('closePersonnelModal')?.addEventListener('click', () => {
    document.getElementById('personnelModal').classList.add('hidden');
});

document.getElementById('personnelForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('personnelId').value;
    const username = document.getElementById('personnelUsername').value.trim();
    const fullname = document.getElementById('personnelFullname').value.trim();
    const password = document.getElementById('personnelPassword').value;
    const role = document.getElementById('personnelRole').value;
    
    if (!username) {
        showToast('Hata', 'Kullanıcı adı zorunludur.', 'error');
        return;
    }
    
    let success;
    if (id) {
        // Update existing
        const updates = { role };
        if (fullname) updates.fullname = fullname;
        if (password) updates.password = password;
        success = await updateAdmin(id, updates);
    } else {
        // Create new
        if (!password) {
            showToast('Hata', 'Yeni personel için şifre zorunludur.', 'error');
            return;
        }
        success = await addAdminSecure(username, password, role);
        if (success && fullname) {
            await updateAdmin(success.id, { fullname });
        }
    }
    
    if (success) {
        showToast('Başarılı', id ? 'Personel güncellendi.' : 'Personel eklendi.', 'success');
        document.getElementById('personnelModal').classList.add('hidden');
        loadPersonnelList();
    } else {
        showToast('Hata', 'İşlem başarısız.', 'error');
    }
});

// ============================================
// ADMIN STATUS MANAGEMENT
// ============================================

let currentAdminStatus = 'offline';

async function initAdminStatus() {
    const adminId = localStorage.getItem('vegas_admin_id');
    if (!adminId) return;
    
    // Get current status from DB
    const admins = await getAdmins();
    const currentAdmin = admins.find(a => a.id === adminId);
    if (currentAdmin) {
        currentAdminStatus = currentAdmin.status || 'offline';
        localStorage.setItem('vegas_admin_status', currentAdminStatus);
        updateStatusUI(currentAdminStatus);
    }
}

function updateStatusUI(status) {
    const statusLabel = document.getElementById('statusLabel');
    const statusBtns = document.querySelectorAll('.status-btn');
    
    statusBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.status === status) {
            btn.classList.add('active');
        }
    });
    
    if (statusLabel) {
        statusLabel.className = 'status-label ' + status;
        if (status === 'online') {
            statusLabel.textContent = 'Online';
        } else if (status === 'break') {
            statusLabel.textContent = 'Mola';
        } else {
            statusLabel.textContent = 'Offline';
        }
    }
}

async function setAdminStatus(status) {
    const adminId = localStorage.getItem('vegas_admin_id');
    if (!adminId) return;
    
    const success = await updateAdminStatus(adminId, status);
    if (success) {
        currentAdminStatus = status;
        localStorage.setItem('vegas_admin_status', status);
        updateStatusUI(status);
        
        // If going offline or on break, unassign pending requests
        if (status === 'offline' || status === 'break') {
            await unassignAdminRequests(adminId);
        }
        
        renderTable(); // Refresh to apply status filter
        
        const statusMessages = {
            'online': 'Artık talep alabilirsiniz.',
            'break': 'Mola modundasınız. Talepleriniz başka adminine aktarıldı.',
            'offline': 'Çevrimdışısınız. Talepleriniz başka adminine aktarıldı.'
        };
        showToast('Durum Güncellendi', statusMessages[status], 'info');
        
        // Reload personnel list if visible
        if (document.getElementById('personnelManagementSection')?.style.display !== 'none') {
            loadPersonnelList();
        }
    }
}

// Status button click handlers
document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setAdminStatus(btn.dataset.status);
    });
});

// Initialize status on page load
initAdminStatus();

// Update last_seen every minute when online
setInterval(async () => {
    if (currentAdminStatus === 'online') {
        const adminId = localStorage.getItem('vegas_admin_id');
        if (adminId) {
            await updateAdmin(adminId, { last_seen: new Date().toISOString() });
        }
    }
}, 60000);

// Set offline when leaving page
window.addEventListener('beforeunload', () => {
    const adminId = localStorage.getItem('vegas_admin_id');
    if (adminId && currentAdminStatus === 'online') {
        // Use sendBeacon for reliable delivery
        navigator.sendBeacon && navigator.sendBeacon(
            SUPABASE_URL + '/rest/v1/admins?id=eq.' + adminId,
            JSON.stringify({ status: 'offline' })
        );
    }
});

// ============================================
// REQUEST ASSIGNMENT
// ============================================

async function takeRequest(requestDbId) {
    const adminId = localStorage.getItem('vegas_admin_id');
    if (!adminId) return;
    
    const success = await assignRequestToAdmin(requestDbId, adminId);
    if (success) {
        showToast('Talep Alındı', 'Talep size atandı.', 'success');
        await loadRequests();
    } else {
        showToast('Hata', 'Talep atanamadı.', 'error');
    }
}

// ============================================
// HASHTAG / NOTE TEMPLATE SYSTEM
// ============================================

let currentTemplatePreference = 'global';

async function loadNoteTemplates() {
    try {
        const adminId = localStorage.getItem('vegas_admin_id');
        
        // Get user's preference
        currentTemplatePreference = await getTemplatePreference(adminId);
        debugLog('📝 Template preference:', currentTemplatePreference);
        
        // Load templates based on preference
        noteTemplates = await getNoteTemplates(adminId, currentTemplatePreference);
        debugLog('📝 Loaded', noteTemplates.length, 'note templates');
    } catch (e) {
        console.error('Error loading note templates:', e);
        noteTemplates = [];
    }
}

// Render hashtag buttons in confirm modal based on action type
function renderHashtagButtons(actionType) {
    const container = document.getElementById('hashtagButtons');
    if (!container) return;
    
    // Filter templates by action type
    const relevantCategories = actionType === 'reject' 
        ? ['rejected', 'general'] 
        : ['approved', 'general'];
    
    const filtered = noteTemplates.filter(t => relevantCategories.includes(t.category));
    
    if (filtered.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 11px;">Şablon yok</span>';
        return;
    }
    
    container.innerHTML = filtered.map(t => `
        <button type="button" class="hashtag-btn category-${t.category}" 
                data-text="${escapeHtml(t.text)}" 
                title="${escapeHtml(t.text)}">
            <span class="hashtag-icon">${t.icon}</span>
            <span>${escapeHtml(t.tag)}</span>
        </button>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.hashtag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const noteInput = document.getElementById('adminNoteInput');
            if (noteInput) {
                noteInput.value = btn.dataset.text;
                noteInput.focus();
            }
        });
    });
}

// ============================================
// HASHTAG MANAGEMENT (Admin/Senior Agent)
// ============================================

async function loadHashtagManagement() {
    const rejectedList = document.getElementById('rejectedHashtags');
    const approvedList = document.getElementById('approvedHashtags');
    const generalList = document.getElementById('generalHashtags');
    const personalList = document.getElementById('personalHashtags');
    const preferenceSelect = document.getElementById('templatePreferenceSelect');
    
    if (!rejectedList) return;
    
    const adminId = localStorage.getItem('vegas_admin_id');
    const currentRole = localStorage.getItem('vegas_admin_role');
    const isAdmin = currentRole === 'admin';
    
    try {
        // Load and set current preference
        const preference = await getTemplatePreference(adminId);
        if (preferenceSelect) {
            preferenceSelect.value = preference;
        }
        
        // Load global templates (only admins can edit these)
        const globalTemplates = await getGlobalNoteTemplates();
        
        // Load personal templates for this user
        const personalTemplates = await getPersonalNoteTemplates(adminId);
        
        const renderCategory = (container, templates, isPersonal = false) => {
            if (templates.length === 0) {
                container.innerHTML = '<div class="empty-state">Bu kategoride şablon yok</div>';
                return;
            }
            
            container.innerHTML = templates.map(t => `
                <div class="hashtag-item ${!t.is_active ? 'inactive' : ''}">
                    <div class="hashtag-item-icon">${t.icon}</div>
                    <div class="hashtag-item-content">
                        <div class="hashtag-item-tag">${escapeHtml(t.tag)}</div>
                        <div class="hashtag-item-text">${escapeHtml(t.text)}</div>
                    </div>
                    <div class="hashtag-item-actions">
                        ${isPersonal || isAdmin ? `
                        <button class="btn-icon edit" onclick="editHashtag('${t.id}', ${isPersonal})" title="Düzenle">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="deleteHashtagItem('${t.id}', ${isPersonal})" title="Sil">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                        ` : '<span class="readonly-badge">Salt okunur</span>'}
                    </div>
                </div>
            `).join('');
        };
        
        // Render global templates (by category)
        renderCategory(rejectedList, globalTemplates.filter(t => t.category === 'rejected'), false);
        renderCategory(approvedList, globalTemplates.filter(t => t.category === 'approved'), false);
        renderCategory(generalList, globalTemplates.filter(t => t.category === 'general'), false);
        
        // Render personal templates
        if (personalList) {
            renderCategory(personalList, personalTemplates, true);
        }
        
        // Show/hide global add button based on role
        const addGlobalBtn = document.getElementById('addHashtagBtn');
        if (addGlobalBtn) {
            addGlobalBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        }
        
    } catch (e) {
        console.error('Error loading hashtag management:', e);
    }
}

// Update preference when changed
async function updatePreference(newPreference) {
    const adminId = localStorage.getItem('vegas_admin_id');
    const success = await updateTemplatePreference(adminId, newPreference);
    if (success) {
        currentTemplatePreference = newPreference;
        showToast('Başarılı', 'Tercih kaydedildi.', 'success');
        await loadNoteTemplates(); // Reload templates with new preference
    } else {
        showToast('Hata', 'Tercih kaydedilemedi.', 'error');
    }
}

// Make updatePreference globally accessible
window.updatePreference = updatePreference;

async function editHashtag(id, isPersonal = false) {
    const adminId = localStorage.getItem('vegas_admin_id');
    
    // Get the template from appropriate source
    let template;
    if (isPersonal) {
        const personalTemplates = await getPersonalNoteTemplates(adminId);
        template = personalTemplates.find(t => t.id === id);
    } else {
        const allTemplates = await getAllNoteTemplates();
        template = allTemplates.find(t => t.id === id);
    }
    
    if (!template) return;
    
    document.getElementById('hashtagModalTitle').textContent = isPersonal ? 'Kişisel Şablonu Düzenle' : 'Şablonu Düzenle';
    document.getElementById('hashtagId').value = id;
    document.getElementById('hashtagTag').value = template.tag;
    document.getElementById('hashtagText').value = template.text;
    document.getElementById('hashtagCategory').value = template.category;
    document.getElementById('hashtagIcon').value = template.icon || '';
    document.getElementById('hashtagActive').checked = template.is_active;
    document.getElementById('hashtagIsPersonal').value = isPersonal ? 'true' : 'false';
    
    document.getElementById('hashtagModal').classList.remove('hidden');
}

async function deleteHashtagItem(id, isPersonal = false) {
    const confirmMsg = isPersonal ? 'Bu kişisel şablonu silmek istediğinize emin misiniz?' : 'Bu şablonu silmek istediğinize emin misiniz?';
    if (!confirm(confirmMsg)) return;
    
    const success = await deleteNoteTemplate(id);
    if (success) {
        showToast('Başarılı', 'Şablon silindi.', 'success');
        await loadHashtagManagement();
        await loadNoteTemplates(); // Refresh for confirm modal
    } else {
        showToast('Hata', 'Silinemedi.', 'error');
    }
}

// Hashtag Modal Events
document.getElementById('addHashtagBtn')?.addEventListener('click', () => {
    document.getElementById('hashtagModalTitle').textContent = 'Yeni Genel Şablon Ekle';
    document.getElementById('hashtagForm').reset();
    document.getElementById('hashtagId').value = '';
    document.getElementById('hashtagIsPersonal').value = 'false';
    document.getElementById('hashtagActive').checked = true;
    document.getElementById('hashtagModal').classList.remove('hidden');
});

// Add personal template button
document.getElementById('addPersonalHashtagBtn')?.addEventListener('click', () => {
    document.getElementById('hashtagModalTitle').textContent = 'Yeni Kişisel Şablon Ekle';
    document.getElementById('hashtagForm').reset();
    document.getElementById('hashtagId').value = '';
    document.getElementById('hashtagIsPersonal').value = 'true';
    document.getElementById('hashtagActive').checked = true;
    document.getElementById('hashtagModal').classList.remove('hidden');
});

document.getElementById('closeHashtagModal')?.addEventListener('click', () => {
    document.getElementById('hashtagModal').classList.add('hidden');
});

// Icon picker dropdown toggle
const iconInput = document.getElementById('hashtagIcon');
const iconDropdown = document.getElementById('iconPickerDropdown');

if (iconInput && iconDropdown) {
    iconInput.addEventListener('click', (e) => {
        e.stopPropagation();
        iconDropdown.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.icon-picker-wrapper')) {
            iconDropdown.classList.add('hidden');
        }
    });
}

// Icon picker click handlers
document.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const icon = btn.dataset.icon;
        const iconInput = document.getElementById('hashtagIcon');
        const iconDropdown = document.getElementById('iconPickerDropdown');
        
        if (iconInput) {
            iconInput.value = icon;
        }
        // Update selected state
        document.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        // Close dropdown
        if (iconDropdown) {
            iconDropdown.classList.add('hidden');
        }
    });
});

document.getElementById('hashtagForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('hashtagId').value;
    let tag = document.getElementById('hashtagTag').value.trim();
    const text = document.getElementById('hashtagText').value.trim();
    const category = document.getElementById('hashtagCategory').value;
    const icon = document.getElementById('hashtagIcon').value.trim() || '📝';
    const isActive = document.getElementById('hashtagActive').checked;
    const isPersonal = document.getElementById('hashtagIsPersonal').value === 'true';
    
    // Ensure tag starts with #
    if (!tag.startsWith('#')) tag = '#' + tag;
    
    if (!tag || !text) {
        showToast('Hata', 'Hashtag ve metin zorunludur.', 'error');
        return;
    }
    
    const adminId = localStorage.getItem('vegas_admin_id');
    
    let success;
    if (id) {
        success = await updateNoteTemplate(id, { tag, text, category, icon, is_active: isActive });
    } else {
        // For new templates, pass createdBy (null for global, adminId for personal)
        const createdBy = isPersonal ? adminId : null;
        success = await addNoteTemplate(tag, text, category, icon, createdBy);
    }
    
    if (success) {
        const msg = isPersonal ? 'Kişisel şablon' : 'Şablon';
        showToast('Başarılı', id ? `${msg} güncellendi.` : `${msg} eklendi.`, 'success');
        document.getElementById('hashtagModal').classList.add('hidden');
        await loadHashtagManagement();
        await loadNoteTemplates(); // Refresh for confirm modal
    } else {
        showToast('Hata', 'İşlem başarısız.', 'error');
    }
});

// ============================================
// PERFORMANCE STATISTICS
// ============================================

let currentPerformancePeriod = 'today';
let performanceTrendChart = null;
let avgTimeChart = null;
let adminsCache = [];

async function loadPerformanceStats() {
    const leaderboardBody = document.getElementById('leaderboardBody');
    const performanceGrid = document.getElementById('performanceGrid');
    const updateTime = document.getElementById('leaderboardUpdateTime');
    
    if (!leaderboardBody) return;
    
    try {
        // Get all admins
        adminsCache = await getAdmins();
        
        // Get time boundaries based on period
        const now = new Date();
        let startTime;
        
        if (currentPerformancePeriod === 'today') {
            startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        } else if (currentPerformancePeriod === 'week') {
            startTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        } else {
            startTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
        }
        
        // Filter processed requests in period
        const processedRequests = requests.filter(r => {
            if (!r.processedAt || !r.processedBy) return false;
            return new Date(r.processedAt).getTime() >= startTime;
        });
        
        // Calculate stats per admin
        const adminStats = {};
        
        adminsCache.forEach(admin => {
            adminStats[admin.id] = {
                id: admin.id,
                username: admin.username,
                role: admin.role,
                status: admin.status || 'offline',
                total: 0,
                approved: 0,
                rejected: 0,
                totalTime: 0,
                avgTime: 0
            };
        });
        
        processedRequests.forEach(req => {
            if (!adminStats[req.processedBy]) return;
            
            const stats = adminStats[req.processedBy];
            stats.total++;
            
            if (req.status === 'approved') stats.approved++;
            if (req.status === 'rejected') stats.rejected++;
            
            // Calculate processing time (from created to processed)
            if (req.timestamp && req.processedAt) {
                const created = new Date(req.timestamp).getTime();
                const processed = new Date(req.processedAt).getTime();
                const timeDiff = (processed - created) / 60000; // minutes
                if (timeDiff > 0 && timeDiff < 1440) { // Max 24 hours
                    stats.totalTime += timeDiff;
                }
            }
        });
        
        // Calculate averages and sort by total
        const sortedStats = Object.values(adminStats)
            .map(s => {
                s.avgTime = s.total > 0 ? s.totalTime / s.total : 0;
                // Speed-based success rate: 
                // ≤3 dk = 100%, 5 dk = 80%, 10 dk = 50%, 15+ dk = 20%
                if (s.avgTime <= 0 || s.total === 0) {
                    s.successRate = 0;
                } else if (s.avgTime <= 3) {
                    s.successRate = 100;
                } else if (s.avgTime <= 5) {
                    s.successRate = 100 - ((s.avgTime - 3) * 10); // 100→80
                } else if (s.avgTime <= 10) {
                    s.successRate = 80 - ((s.avgTime - 5) * 6); // 80→50
                } else if (s.avgTime <= 15) {
                    s.successRate = 50 - ((s.avgTime - 10) * 6); // 50→20
                } else {
                    s.successRate = Math.max(10, 20 - (s.avgTime - 15)); // min 10%
                }
                return s;
            })
            .sort((a, b) => b.total - a.total);
        
        // Render leaderboard
        renderLeaderboard(sortedStats);
        
        // Render individual stat cards
        renderPerformanceGrid(sortedStats);
        
        // Render charts
        renderPerformanceCharts(sortedStats);
        
        // Update time
        if (updateTime) {
            updateTime.textContent = 'Güncellendi: ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        }
        
    } catch (e) {
        console.error('Error loading performance stats:', e);
    }
}

function renderLeaderboard(stats) {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    
    if (stats.length === 0 || stats.every(s => s.total === 0)) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="performance-empty">
                    <div>Bu dönemde işlem yapılmamış</div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = stats.map((s, idx) => {
        const rank = idx + 1;
        let rankClass = 'rank-other';
        if (rank === 1) rankClass = 'rank-1';
        else if (rank === 2) rankClass = 'rank-2';
        else if (rank === 3) rankClass = 'rank-3';
        
        const avgTimeStr = s.avgTime > 0 ? s.avgTime.toFixed(1) + ' dk' : '-';
        
        let successClass = 'high';
        if (s.successRate < 70) successClass = 'low';
        else if (s.successRate < 85) successClass = 'medium';
        
        const roleLabel = s.role === 'admin' ? 'Admin' : 'Agent';
        
        return `
            <tr>
                <td class="rank-col">
                    <span class="rank-badge ${rankClass}">${rank}</span>
                </td>
                <td>
                    <div class="personnel-cell">
                        <span class="status-dot-sm ${s.status}"></span>
                        <div class="personnel-avatar">${s.username.substring(0, 2).toUpperCase()}</div>
                        <div>
                            <div class="personnel-name">${escapeHtml(s.username)}</div>
                            <div class="personnel-role">${roleLabel}</div>
                        </div>
                    </div>
                </td>
                <td class="num-col"><strong>${s.total}</strong></td>
                <td class="num-col stat-approved">${s.approved}</td>
                <td class="num-col stat-rejected">${s.rejected}</td>
                <td class="num-col stat-time">${avgTimeStr}</td>
                <td class="num-col">
                    <div class="success-rate">
                        <div class="success-bar">
                            <div class="success-bar-fill ${successClass}" style="width: ${s.successRate}%"></div>
                        </div>
                        <span class="success-percent">${s.successRate.toFixed(0)}%</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPerformanceGrid(stats) {
    const grid = document.getElementById('performanceGrid');
    if (!grid) return;
    
    // Only show admins with activity
    const activeStats = stats.filter(s => s.total > 0);
    
    if (activeStats.length === 0) {
        grid.innerHTML = '';
        return;
    }
    
    grid.innerHTML = activeStats.slice(0, 6).map(s => {
        const roleLabel = s.role === 'admin' ? 'Admin' : 'Senior Agent';
        const avgTimeStr = s.avgTime > 0 ? s.avgTime.toFixed(1) : '0';
        
        return `
            <div class="agent-stat-card">
                <div class="agent-stat-header">
                    <div class="agent-stat-avatar">${s.username.substring(0, 2).toUpperCase()}</div>
                    <div class="agent-stat-info">
                        <h4>${escapeHtml(s.username)}</h4>
                        <span><span class="status-dot-sm ${s.status}"></span>${roleLabel}</span>
                    </div>
                </div>
                <div class="agent-stat-metrics">
                    <div class="metric-item">
                        <div class="metric-value">${s.total}</div>
                        <div class="metric-label">İşlem</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value approved">${s.approved}</div>
                        <div class="metric-label">Onay</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value time">${avgTimeStr} dk</div>
                        <div class="metric-label">Ort. Süre</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value rate">${s.successRate.toFixed(0)}%</div>
                        <div class="metric-label">Hız</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPerformanceCharts(stats) {
    // Trend Chart - Last 7 days by admin
    const trendCtx = document.getElementById('performanceTrendChart');
    const avgTimeCtx = document.getElementById('avgTimeChart');
    
    if (!trendCtx || !avgTimeCtx) return;
    
    // Get active admins (top 5 by total)
    const topAdmins = stats.filter(s => s.total > 0).slice(0, 5);
    
    if (topAdmins.length === 0) {
        // Clear charts if no data
        if (performanceTrendChart) {
            performanceTrendChart.destroy();
            performanceTrendChart = null;
        }
        if (avgTimeChart) {
            avgTimeChart.destroy();
            avgTimeChart = null;
        }
        return;
    }
    
    // Generate last 7 days labels
    const days = [];
    const dayLabels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d);
        dayLabels.push(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
    }
    
    // Calculate daily counts per admin
    const datasets = topAdmins.map((admin, idx) => {
        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
        
        const dailyCounts = days.map(day => {
            const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            
            return requests.filter(r => {
                if (!r.processedAt || r.processedBy !== admin.id) return false;
                const t = new Date(r.processedAt).getTime();
                return t >= dayStart && t < dayEnd;
            }).length;
        });
        
        return {
            label: admin.username,
            data: dailyCounts,
            borderColor: colors[idx % colors.length],
            backgroundColor: colors[idx % colors.length] + '20',
            tension: 0.3,
            fill: false
        };
    });
    
    // Destroy existing chart
    if (performanceTrendChart) {
        performanceTrendChart.destroy();
    }
    
    performanceTrendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: dayLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#2a2f3a' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
    
    // Avg Time Chart (Bar)
    if (avgTimeChart) {
        avgTimeChart.destroy();
    }
    
    avgTimeChart = new Chart(avgTimeCtx, {
        type: 'bar',
        data: {
            labels: topAdmins.map(a => a.username),
            datasets: [{
                label: 'Ort. Süre (dk)',
                data: topAdmins.map(a => a.avgTime.toFixed(1)),
                backgroundColor: topAdmins.map(a => {
                    if (a.avgTime <= 3) return '#10b981';
                    if (a.avgTime <= 5) return '#f59e0b';
                    return '#ef4444';
                }),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#2a2f3a' },
                    title: {
                        display: true,
                        text: 'Dakika'
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// Period filter handlers
document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPerformancePeriod = btn.dataset.period;
        loadPerformanceStats();
    });
});

// ============================================
// BLOCKED USERS MANAGEMENT
// ============================================

// Load blocked users badge count
async function loadBlockedUsersBadge() {
    try {
        const blockedUsers = await getBlockedUsers();
        const badge = document.getElementById('blockedBadge');
        if (badge) {
            badge.textContent = blockedUsers.length;
            badge.style.display = blockedUsers.length > 0 ? 'inline-flex' : 'none';
        }
    } catch (e) {
        console.error('Error loading blocked badge:', e);
    }
}

// Load and render blocked users list
async function loadBlockedUsers() {
    const tableBody = document.getElementById('blockedUsersTableBody');
    const emptyState = document.getElementById('emptyBlockedState');
    const tableWrapper = document.querySelector('.blocked-users-table-wrapper');
    
    if (!tableBody) return;
    
    try {
        const blockedUsers = await getBlockedUsers();
        
        if (blockedUsers.length === 0) {
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }
        
        if (tableWrapper) tableWrapper.style.display = 'block';
        if (emptyState) emptyState.classList.add('hidden');
        
        tableBody.innerHTML = blockedUsers.map(block => {
            const blockedAt = new Date(block.blocked_at);
            const blockedUntil = new Date(block.blocked_until);
            const now = new Date();
            const remainingMs = blockedUntil - now;
            const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
            
            const blockedByName = block.admins?.username || 'Bilinmiyor';
            const reason = block.reason || '-';
            
            return `
                <tr data-block-id="${block.id}">
                    <td><strong>${escapeHtml(block.username)}</strong></td>
                    <td>${escapeHtml(blockedByName)}</td>
                    <td class="reason-cell">${escapeHtml(reason)}</td>
                    <td>${blockedAt.toLocaleDateString('tr-TR')} ${blockedAt.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}</td>
                    <td>
                        <span class="remaining-time ${remainingMinutes < 10 ? 'expiring-soon' : ''}">${remainingMinutes} dk</span>
                    </td>
                    <td>
                        <button class="btn-unblock" onclick="unblockUserAction('${escapeHtml(block.username)}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"></path>
                            </svg>
                            Engeli Kaldır
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Update badge
        loadBlockedUsersBadge();
        
    } catch (e) {
        console.error('Error loading blocked users:', e);
        tableBody.innerHTML = '<tr><td colspan="6" class="error-cell">Yüklenirken hata oluştu.</td></tr>';
    }
}

// Unblock user action
async function unblockUserAction(username) {
    if (!confirm(`${username} kullanıcısının engelini kaldırmak istediğinize emin misiniz?`)) {
        return;
    }
    
    try {
        const success = await unblockUser(username);
        if (success) {
            showToast('Engel Kaldırıldı', `${username} artık talep verebilir.`, 'success');
            loadBlockedUsers();
            loadBlockedUsersBadge();
        } else {
            showToast('Hata', 'Engel kaldırılamadı.', 'error');
        }
    } catch (e) {
        console.error('Error unblocking user:', e);
        showToast('Hata', 'Bir hata oluştu.', 'error');
    }
}

// Make unblockUserAction globally accessible
window.unblockUserAction = unblockUserAction;

// Load blocked badge on init
loadBlockedUsersBadge();
