// --- Auth Check ---
if (!localStorage.getItem('vegas_auth_token')) {
    window.location.href = 'login.html';
    throw new Error('Not authenticated'); // Stop script execution
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

// --- Start Up ---
(async () => {
    await loadRequests();
    handleNavigation('dashboard');
})();
// Auto-refresh every 5 seconds to catch new requests
setInterval(loadRequests, 5000);

// --- Logout ---
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm('Çıkış yapmak istediğinize emin misiniz?')) {
            localStorage.removeItem('vegas_auth_token');
            localStorage.removeItem('vegas_admin_user');
            localStorage.removeItem('vegas_admin_role');
            localStorage.removeItem('vegas_admin_id');
            window.location.href = 'login.html';
        }
    });
}

// --- Logic ---

async function loadRequests() {
    try {
        const data = await getBonusRequests();
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
            notified: r.notified
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
        await updateBonusRequestStatus(dbId, status, adminNote);
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

    // Today's data
    const todayRequests = requests.filter(r => {
        if (!r.timestamp) return false;
        return new Date(r.timestamp).getTime() >= startOfToday;
    });

    const todayPending = todayRequests.filter(r => r.status === 'pending').length;
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
                    <div class="activity-title">${req.username} - ${req.bonusTypeLabel || req.bonusType}</div>
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

    // Pending Count
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    if (statPendingIndex) statPendingIndex.textContent = pendingCount;
    if (statPendingBadge) statPendingBadge.textContent = pendingCount;

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
                    <div class="tb-name">${name}</div>
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
                <td style="font-weight: 500; color: #fff;">${username}</td>
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

    // Filter Logic
    let filtered = requests;

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
        if (req.status === 'approved') {
            statusClass = 'status-approved';
            statusText = 'Onaylandı';
        } else if (req.status === 'rejected') {
            statusClass = 'status-rejected';
            statusText = 'Reddedildi';
        }

        // Bonus Tag Class (Simplified)
        let tagClass = 'tag-welcome';
        if (req.bonusType === 'loss') tagClass = 'tag-loss';
        if (req.bonusType === 'freespins') tagClass = 'tag-spins';

        // Truncate Note
        let noteDisplay = req.note ? req.note : '-';
        if (noteDisplay.length > 25) noteDisplay = noteDisplay.substring(0, 25) + '...';

        row.innerHTML = `
                <td class="col-check">
                    <input type="checkbox" class="row-checkbox" value="${req.id}">
                </td>
                <td class="col-id">${req.id}</td>
                <td class="col-user">
                    <div class="user-cell">
                        <div class="avatar-sm">${req.username.substring(0, 2).toUpperCase()}</div>
                        <span>${req.username}</span>
                    </div>
                </td>
                <td><span class="bonus-tag ${tagClass}">${req.bonusTypeLabel}</span></td>
                <td class="col-note">
                    <span class="note-truncate">${noteDisplay}</span>
                </td>
                <td class="col-date">${dateStr}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
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

function viewRequest(id) {
    const req = requests.find(r => r.id === id);
    if (!req) return;

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
        showToast('Talep Reddedildi', `${id} başarıyla reddedildi.`, 'error');
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
            `"${note}"`,
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

    // Reset All Views First
    if (statsGrid) statsGrid.style.display = 'none';
    if (dashboardWidgets) dashboardWidgets.style.display = 'none';
    if (settingsSection) settingsSection.style.display = 'none';
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
                        ${admin.username}
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
    showToast('Başarılı', `${username} admin olarak eklendi.`, 'success');
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

    if (!confirm(`${admin.username} adlı admini silmek istediğinize emin misiniz?`)) {
        return;
    }

    const success = await deleteAdmin(adminId);
    if (success) {
        await loadAdminList();
        showToast('Başarılı', `${admin.username} silindi.`, 'success');
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

        const result = await addAdmin(username, password, role);
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
        const success = await updateAdminPassword(adminId, newPassword);
        if (success) {
            profileForm.reset();
            showToast('Başarılı', 'Şifreniz güncellendi.', 'success');
        } else {
            showToast('Hata', 'Şifre güncellenirken hata oluştu.', 'error');
        }
    });
}
