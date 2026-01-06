document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('bonusForm');
    // Note field removed
    const successState = document.getElementById('successState');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.querySelector('.btn-text');
    const loader = document.querySelector('.loader');
    const resetBtn = document.getElementById('resetBtn');
    const bonusSelect = document.getElementById('bonusType');
    const bonusHelper = document.getElementById('bonusHelper');

    // Don't auto-check notifications on page load
    // Notifications will show when user queries their status

    // Load bonus types and check rate limit on page load
    loadBonusTypes();
    
    // Rate limit elements
    const rateLimitWarning = document.getElementById('rateLimitWarning');
    const usernameInput = document.getElementById('username');
    
    // Check rate limit when username changes
    let rateLimitTimeout;
    usernameInput.addEventListener('input', () => {
        clearTimeout(rateLimitTimeout);
        rateLimitTimeout = setTimeout(async () => {
            const username = usernameInput.value.trim();
            if (username.length >= 3) {
                await checkRateLimit(username);
            }
        }, 500);
    });
    
    async function loadBonusTypes() {
        try {
            const types = await getBonusTypes();
            bonusSelect.innerHTML = '<option value="" disabled selected>Bonus Seçiniz</option>';
            types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.icon + ' ' + t.label;
                bonusSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Error loading bonus types:', e);
        }
    }
    
    async function checkRateLimit(username) {
        try {
            const hasPending = await checkUserHasPendingRequest(username);
            if (hasPending) {
                rateLimitWarning.classList.remove('hidden');
                submitBtn.disabled = true;
            } else {
                rateLimitWarning.classList.add('hidden');
                submitBtn.disabled = false;
            }
        } catch (e) {
            console.error('Rate limit check error:', e);
        }
    }

    // Dropdown Helper Logic
    bonusSelect.addEventListener('change', () => {
        if (bonusSelect.value) {
            bonusHelper.classList.remove('hidden');
        }
    });

    // Submit Logic
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Get Values
        const username = document.getElementById('username').value.trim();
        const bonusType = document.getElementById('bonusType').value;
        const bonusTypeLabel = document.getElementById('bonusType').options[document.getElementById('bonusType').selectedIndex].text;
        // Note field removed

        if (!username || !bonusType) return;

        // Simulate processing
        submitBtn.disabled = true;
        btnText.style.opacity = '0';
        loader.classList.remove('hidden');

        try {
            // 2. Create Request Object
            const requestId = '#REQ-' + Math.floor(1000 + Math.random() * 9000);
            const newRequest = {
                id: requestId,
                username: username,
                bonusType: bonusType,
                bonusTypeLabel: bonusTypeLabel,
                timestamp: new Date().toISOString(),
                status: 'pending'
            };

            console.log('Sending request:', newRequest);

            // 3. Save to Supabase
            const result = await addBonusRequest(newRequest);
            console.log('Supabase result:', result);

            if (!result) {
                throw new Error('Supabase insert failed');
            }

            // 4. Hide form, show success
            form.classList.add('hidden');
            form.style.display = 'none';
            successState.classList.remove('hidden');
            
            // Reset queue-info to initial state (in case it was modified by previous request)
            const queueInfoEl = document.querySelector('.queue-info');
            if (queueInfoEl) {
                queueInfoEl.innerHTML = 
                    '<span class="queue-label">Sıra Numaranız</span>' +
                    '<div class="queue-position">' +
                        '<span class="queue-number" id="queueNumber">...</span>' +
                        '<span class="queue-separator">/</span>' +
                        '<span class="queue-total" id="totalPending">...</span>' +
                    '</div>' +
                    '<span class="queue-text">bekleyen talep arasında</span>' +
                    '<span class="queue-live-indicator">🔴 Canlı güncelleniyor</span>';
                queueInfoEl.style.borderColor = '';
            }

            // 5. Show queue position and start live updates
            window.lastRequestId = requestId;
            await updateQueuePosition();
            startQueueUpdates();
        } catch (error) {
            console.error('Submit error:', error);
            alert('Hata: ' + error.message + '\n\nKonsolu kontrol edin (F12)');
            submitBtn.disabled = false;
            btnText.style.opacity = '1';
            loader.classList.add('hidden');
        }
    });

    // Queue update interval
    let queueUpdateInterval = null;
    let shownNotificationIds = new Set();
    let isShowingNotification = false;

    // Update queue position display
    async function updateQueuePosition() {
        try {
            if (!window.lastRequestId) return;
            
            // Cleanup orphaned requests first
            await cleanupOfflineAdminRequests();
            
            const allRequests = await getBonusRequests();
            const pendingRequests = allRequests.filter(r => r.status === 'pending');
            const myRequest = allRequests.find(r => r.request_id === window.lastRequestId);
            
            const queueNumberEl = document.getElementById('queueNumber');
            const totalPendingEl = document.getElementById('totalPending');
            
            if (myRequest && myRequest.status === 'pending') {
                // Find my position (oldest first)
                const sortedPending = pendingRequests.sort((a, b) => 
                    new Date(a.created_at) - new Date(b.created_at)
                );
                const position = sortedPending.findIndex(r => r.request_id === window.lastRequestId) + 1;
                
                if (queueNumberEl) queueNumberEl.textContent = position;
                if (totalPendingEl) totalPendingEl.textContent = pendingRequests.length;
            } else if (myRequest && myRequest.status !== 'pending') {
                // Request was processed - update entire display
                stopQueueUpdates();
                
                const queueInfoEl = document.querySelector('.queue-info');
                if (queueInfoEl) {
                    const isApproved = myRequest.status === 'approved';
                    const statusText = isApproved ? 'Onaylandı' : 'Reddedildi';
                    const statusColor = isApproved ? '#10b981' : '#ef4444';
                    const statusIcon = isApproved 
                        ? '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                        : '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
                    
                    let noteHtml = '';
                    if (myRequest.admin_note) {
                        noteHtml = '<div class="admin-note-display"><strong>Admin Notu:</strong> ' + myRequest.admin_note + '</div>';
                    }
                    
                    queueInfoEl.innerHTML = 
                        '<div class="result-status" style="color: ' + statusColor + '">' +
                        statusIcon +
                        '<span class="result-text">' + statusText + '</span>' +
                        '</div>' +
                        noteHtml;
                    queueInfoEl.style.borderColor = statusColor;
                }
                
                // Only show notification if not already shown
                if (!shownNotificationIds.has(myRequest.request_id)) {
                    shownNotificationIds.add(myRequest.request_id);
                    await markRequestNotified(myRequest.request_id);
                    showNotification(myRequest);
                }
            }
        } catch (error) {
            console.error('Error getting queue position:', error);
        }
    }

    // Start live queue updates
    function startQueueUpdates() {
        stopQueueUpdates(); // Clear any existing interval
        queueUpdateInterval = setInterval(updateQueuePosition, 5000); // Every 5 seconds
    }

    // Stop queue updates
    function stopQueueUpdates() {
        if (queueUpdateInterval) {
            clearInterval(queueUpdateInterval);
            queueUpdateInterval = null;
        }
    }

    // Reset Logic
    resetBtn.addEventListener('click', () => {
        stopQueueUpdates();
        window.lastRequestId = null;
        successState.classList.add('hidden');
        form.classList.remove('hidden');
        form.style.display = 'block';
        form.reset();

        // Reset UI Elements
        bonusHelper.classList.add('hidden');
        rateLimitWarning.classList.add('hidden');

        // Reset Button
        submitBtn.disabled = false;
        btnText.style.opacity = '1';
        loader.classList.add('hidden');
    });

    // --- Status Check System ---
    const checkStatusBtn = document.getElementById('checkStatusBtn');
    const statusCheckModal = document.getElementById('statusCheckModal');
    const closeStatusModal = document.getElementById('closeStatusModal');
    const searchStatusBtn = document.getElementById('searchStatusBtn');
    const statusUsername = document.getElementById('statusUsername');
    const statusResults = document.getElementById('statusResults');

    if (checkStatusBtn) {
        checkStatusBtn.addEventListener('click', () => {
            statusCheckModal.classList.remove('hidden');
            statusUsername.value = '';
            statusResults.classList.add('hidden');
            statusUsername.focus();
        });
    }

    if (closeStatusModal) {
        closeStatusModal.addEventListener('click', () => {
            statusCheckModal.classList.add('hidden');
        });
    }

    if (statusCheckModal) {
        statusCheckModal.addEventListener('click', (e) => {
            if (e.target === statusCheckModal) {
                statusCheckModal.classList.add('hidden');
            }
        });
    }

    if (searchStatusBtn) {
        searchStatusBtn.addEventListener('click', searchStatus);
    }

    if (statusUsername) {
        statusUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchStatus();
            }
        });
    }

    async function searchStatus() {
        const username = statusUsername.value.trim().toLowerCase();
        if (!username) {
            alert('Lütfen kullanıcı adınızı girin.');
            return;
        }

        statusResults.classList.remove('hidden');
        statusResults.innerHTML = '<div class="loading-results">Aranıyor...</div>';

        try {
            const userRequests = await getBonusRequestsByUsername(username);
            const allRequests = await getBonusRequests();
            const allPending = allRequests.filter(r => r.status === 'pending');

            if (userRequests.length === 0) {
                statusResults.innerHTML = '<div class="no-results">Bu kullanıcı adına ait talep bulunamadı.</div>';
                return;
            }

            const resultsHtml = userRequests.map(req => {
                let queuePosition = null;
                if (req.status === 'pending') {
                    queuePosition = allPending.findIndex(r => r.id === req.id) + 1;
                }

                const date = new Date(req.created_at);
                const dateStr = date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'});

                let statusText = 'Beklemede';
                let statusClass = 'pending';
                if (req.status === 'approved') {
                    statusText = 'Onaylandı';
                    statusClass = 'approved';
                } else if (req.status === 'rejected') {
                    statusText = 'Reddedildi';
                    statusClass = 'rejected';
                }

                return `
                    <div class="status-card">
                        <div class="status-card-header">
                            <span class="status-card-id">${req.request_id}</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div class="status-card-body">
                            <div class="status-card-info">
                                <h4>${req.bonus_type_label || req.bonus_type}</h4>
                                <span>${dateStr}</span>
                            </div>
                            ${queuePosition ? `
                                <div class="status-queue">
                                    <div class="status-queue-number">${queuePosition}</div>
                                    <div class="status-queue-label">Sıra</div>
                                </div>
                            ` : ''}
                        </div>
                        ${req.admin_note ? `
                            <div class="admin-note-display">
                                <span class="admin-note-label">Yönetici Notu:</span>
                                <p>${req.admin_note}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            statusResults.innerHTML = `
                <div class="status-results-title">${userRequests.length} talep bulundu</div>
                ${resultsHtml}
            `;
        } catch (error) {
            console.error('Search error:', error);
            statusResults.innerHTML = '<div class="no-results">Bir hata oluştu. Lütfen tekrar deneyin.</div>';
        }
    }

    // --- Notification System ---
    async function checkNotifications() {
        if (isShowingNotification) return;
        
        try {
            const { data: unnotified, error } = await supabaseClient
                .from('bonus_requests')
                .select('*')
                .in('status', ['approved', 'rejected'])
                .eq('notified', false)
                .order('updated_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (unnotified && unnotified.length > 0) {
                const req = unnotified[0];
                // Skip if already shown in this session
                if (shownNotificationIds.has(req.request_id)) return;
                
                shownNotificationIds.add(req.request_id);
                await markRequestNotified(req.request_id);
                showNotification(req);
            }
        } catch (error) {
            console.error('Notification check error:', error);
        }
    }

    function showNotification(request) {
        if (isShowingNotification) return;
        isShowingNotification = true;
        
        const modal = document.getElementById('notificationModal');
        const icon = document.getElementById('notifIcon');
        const title = document.getElementById('notifTitle');
        const message = document.getElementById('notifMessage');
        const details = document.getElementById('notifDetails');
        const closeBtn = document.getElementById('notifCloseBtn');

        const isApproved = request.status === 'approved';

        // Set icon
        icon.className = 'notification-icon ' + (isApproved ? 'success' : 'rejected');
        icon.innerHTML = isApproved ? '✓' : '✗';

        // Set title
        title.textContent = isApproved ? '🎉 Bonus Onaylandı!' : '❌ Talep Reddedildi';

        // Set message
        message.textContent = isApproved 
            ? 'Bonus talebiniz onaylandı ve hesabınıza tanımlandı.'
            : 'Maalesef bonus talebiniz reddedildi.';

        // Set details
        const date = new Date(request.created_at);
        details.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Talep ID</span>
                <span class="detail-value">${request.request_id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Bonus Türü</span>
                <span class="detail-value">${request.bonus_type_label || request.bonus_type}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Talep Tarihi</span>
                <span class="detail-value">${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}</span>
            </div>
            ${request.admin_note ? `
            <div class="admin-note-box">
                <span class="admin-note-title">Yönetici Notu:</span>
                <p>${request.admin_note}</p>
            </div>
            ` : ''}
        `;

        // Set button style
        closeBtn.className = 'notification-btn' + (isApproved ? '' : ' rejected');

        // Show modal
        modal.classList.remove('hidden');

        // Close button
        closeBtn.onclick = () => {
            modal.classList.add('hidden');
            isShowingNotification = false;
            // Don't auto-check for more notifications
        };

        // Close on backdrop click
        modal.querySelector('.notification-backdrop').onclick = () => {
            modal.classList.add('hidden');
            isShowingNotification = false;
        };
    }
});
