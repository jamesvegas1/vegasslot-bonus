document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('bonusForm');
    const noteInput = document.getElementById('note');
    const charCount = document.querySelector('.char-count');
    const successState = document.getElementById('successState');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.querySelector('.btn-text');
    const loader = document.querySelector('.loader');
    const resetBtn = document.getElementById('resetBtn');
    const bonusSelect = document.getElementById('bonusType');
    const bonusHelper = document.getElementById('bonusHelper');

    // Check for notifications on page load
    checkNotifications();

    // Char Count Logic
    noteInput.addEventListener('input', () => {
        const len = noteInput.value.length;
        charCount.textContent = `${len} / 250`;

        charCount.classList.remove('limit-near', 'limit-reached');
        if (len >= 250) {
            charCount.classList.add('limit-reached');
        } else if (len >= 200) {
            charCount.classList.add('limit-near');
        }
    });

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
        const note = document.getElementById('note').value.trim();

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
                note: note,
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

            // 5. Show queue position
            await updateQueueNumber();
        } catch (error) {
            console.error('Submit error:', error);
            alert('Hata: ' + error.message + '\n\nKonsolu kontrol edin (F12)');
            submitBtn.disabled = false;
            btnText.style.opacity = '1';
            loader.classList.add('hidden');
        }
    });

    // Update queue number display
    async function updateQueueNumber() {
        try {
            const pendingCount = await getPendingCount();
            const queueNumberEl = document.getElementById('queueNumber');
            if (queueNumberEl) {
                queueNumberEl.textContent = pendingCount;
            }
        } catch (error) {
            console.error('Error getting queue count:', error);
        }
    }

    // Reset Logic
    resetBtn.addEventListener('click', () => {
        successState.classList.add('hidden');
        form.classList.remove('hidden');
        form.style.display = 'block';
        form.reset();

        // Reset UI Elements
        bonusHelper.classList.add('hidden');
        charCount.textContent = '0 / 250';
        charCount.classList.remove('limit-near', 'limit-reached');

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
                showNotification(unnotified[0]);
                await markRequestNotified(unnotified[0].request_id);
            }
        } catch (error) {
            console.error('Notification check error:', error);
        }
    }

    function showNotification(request) {
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
                <span class="detail-label">Kullanıcı</span>
                <span class="detail-value">${request.username}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Bonus Türü</span>
                <span class="detail-value">${request.bonus_type_label || request.bonus_type}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Talep Tarihi</span>
                <span class="detail-value">${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}</span>
            </div>
        `;

        // Set button style
        closeBtn.className = 'notification-btn' + (isApproved ? '' : ' rejected');

        // Show modal
        modal.classList.remove('hidden');

        // Close button
        closeBtn.onclick = () => {
            modal.classList.add('hidden');
            setTimeout(checkNotifications, 300);
        };

        // Close on backdrop click
        modal.querySelector('.notification-backdrop').onclick = () => {
            modal.classList.add('hidden');
            setTimeout(checkNotifications, 300);
        };
    }
});
