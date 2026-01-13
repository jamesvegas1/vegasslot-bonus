// Supabase Configuration
const SUPABASE_URL = 'https://vbojfpkosxkwbofaghlg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZib2pmcGtvc3hrd2JvZmFnaGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NTgxNDIsImV4cCI6MjA4MzIzNDE0Mn0.-uUYM4OeA9VpJyJzrJ2f03KXfeF6E85G7zNFYJMk_5Q';

// Production mode - disable debug logs
const IS_PROD = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
const dbLog = IS_PROD ? () => {} : console.log.bind(console);

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Database Helper Functions ---

// ADMINS
async function getAdmins() {
    const { data, error } = await supabaseClient
        .from('admins')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        console.error('Error fetching admins:', error);
        return [];
    }
    return data;
}

async function getAdminByUsername(username) {
    const { data, error } = await supabaseClient
        .from('admins')
        .select('*')
        .eq('username', username)
        .single();
    if (error) return null;
    return data;
}

async function addAdmin(username, password, role = 'admin') {
    const { data, error } = await supabaseClient
        .from('admins')
        .insert([{ username, password, role, is_default: false }])
        .select()
        .single();
    if (error) {
        console.error('Error adding admin:', error);
        return null;
    }
    return data;
}

async function updateAdminPassword(id, newPassword) {
    const { error } = await supabaseClient
        .from('admins')
        .update({ password: newPassword })
        .eq('id', id);
    return !error;
}

async function deleteAdmin(id) {
    const { error } = await supabaseClient
        .from('admins')
        .delete()
        .eq('id', id);
    return !error;
}

// BONUS REQUESTS
async function getBonusRequests() {
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching requests:', error);
        return [];
    }
    return data;
}

async function getBonusRequestsByUsername(username) {
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .select('*')
        .ilike('username', username)
        .order('created_at', { ascending: false });
    if (error) return [];
    return data;
}

async function addBonusRequest(request) {
    dbLog('addBonusRequest called with:', request);
    const insertData = {
        request_id: request.id,
        username: request.username,
        bonus_type: request.bonusType,
        bonus_type_label: request.bonusTypeLabel,
        note: request.note || '',
        status: 'pending',
        notified: false
    };
    dbLog('Insert data:', insertData);
    
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .insert([insertData])
        .select()
        .single();
    
    if (error) {
        console.error('Supabase error details:', error.message, error.details, error.hint, error.code);
        return null;
    }
    dbLog('Insert successful:', data);
    
    // No auto-assign - all online admins will see this request
    // First admin to view it will claim it
    
    return data;
}

async function updateBonusRequestStatus(id, status, adminNote = '', processedBy = null) {
    const updateData = { 
        status, 
        admin_note: adminNote || '',
        updated_at: new Date().toISOString()
    };
    
    // Add processed_by info if provided
    if (processedBy) {
        updateData.processed_by = processedBy;
        updateData.processed_at = new Date().toISOString();
    }
    
    dbLog('updateBonusRequestStatus:', { id, status, adminNote: adminNote || '(empty)', processedBy });
    
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update(updateData)
        .eq('id', id);
    
    if (error) {
        console.error('updateBonusRequestStatus error:', error.message, error.details);
    }
    return !error;
}

async function markRequestNotified(requestId) {
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update({ notified: true })
        .eq('request_id', requestId);
    return !error;
}

async function getPendingCount() {
    const { count, error } = await supabaseClient
        .from('bonus_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    if (error) return 0;
    return count;
}

// Validate login
async function validateLogin(username, password) {
    const admin = await getAdminByUsername(username);
    if (admin && admin.password === password) {
        return admin;
    }
    return null;
}

// BONUS TYPES
async function getBonusTypes() {
    const { data, error } = await supabaseClient
        .from('bonus_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
    if (error) {
        console.error('Error fetching bonus types:', error);
        return [];
    }
    return data;
}

async function getAllBonusTypes() {
    const { data, error } = await supabaseClient
        .from('bonus_types')
        .select('*')
        .order('sort_order', { ascending: true });
    if (error) return [];
    return data;
}

async function addBonusType(name, label, icon = '🎁', description = '') {
    const { data: existing } = await supabaseClient
        .from('bonus_types')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
    
    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 1;
    
    const { data, error } = await supabaseClient
        .from('bonus_types')
        .insert([{ name, label, icon, description, sort_order: nextOrder }])
        .select()
        .single();
    if (error) {
        console.error('Error adding bonus type:', error);
        return null;
    }
    return data;
}

async function updateBonusType(id, updates) {
    const { error } = await supabaseClient
        .from('bonus_types')
        .update(updates)
        .eq('id', id);
    return !error;
}

async function deleteBonusType(id) {
    const { error } = await supabaseClient
        .from('bonus_types')
        .delete()
        .eq('id', id);
    return !error;
}

// Check if user has pending request OR recently completed request (rate limit)
// Returns: { limited: boolean, reason: string, waitMinutes: number }
async function checkUserHasPendingRequest(username) {
    // 1. Check for pending requests
    const { data: pending, error: pendingError } = await supabaseClient
        .from('bonus_requests')
        .select('id')
        .ilike('username', username)
        .eq('status', 'pending')
        .limit(1);
    
    if (!pendingError && pending && pending.length > 0) {
        return { limited: true, reason: 'pending', waitMinutes: 0 };
    }
    
    // 2. Check for recently completed requests (5 minute cooldown)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await supabaseClient
        .from('bonus_requests')
        .select('updated_at, status')
        .ilike('username', username)
        .in('status', ['approved', 'rejected'])
        .gte('updated_at', fiveMinutesAgo)
        .order('updated_at', { ascending: false })
        .limit(1);
    
    if (!recentError && recent && recent.length > 0) {
        const completedAt = new Date(recent[0].updated_at);
        const cooldownEnd = new Date(completedAt.getTime() + 5 * 60 * 1000);
        const waitMs = cooldownEnd - Date.now();
        const waitMinutes = Math.ceil(waitMs / 60000);
        return { limited: true, reason: 'cooldown', waitMinutes: Math.max(1, waitMinutes) };
    }
    
    return { limited: false, reason: null, waitMinutes: 0 };
}

// Update admin details
async function updateAdmin(id, updates) {
    const { error } = await supabaseClient
        .from('admins')
        .update(updates)
        .eq('id', id);
    return !error;
}

// Update admin status (online, break, offline)
async function updateAdminStatus(id, status) {
    const { error } = await supabaseClient
        .from('admins')
        .update({ 
            status: status,
            last_seen: new Date().toISOString()
        })
        .eq('id', id);
    return !error;
}

// Get online admins
async function getOnlineAdmins() {
    const { data, error } = await supabaseClient
        .from('admins')
        .select('*')
        .eq('status', 'online');
    if (error) {
        console.error('getOnlineAdmins error:', error);
        return [];
    }
    dbLog('getOnlineAdmins result:', data?.length || 0, 'admins online');
    return data || [];
}

// Assign request to admin
async function assignRequestToAdmin(requestId, adminId) {
    dbLog('assignRequestToAdmin:', requestId, '→', adminId);
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update({ 
            assigned_to: adminId,
            assigned_at: new Date().toISOString()
        })
        .eq('id', requestId);
    if (error) {
        console.error('assignRequestToAdmin failed:', error);
    } else {
        dbLog('assignRequestToAdmin success');
    }
    return !error;
}

// Get requests assigned to admin
async function getAssignedRequests(adminId) {
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .select('*')
        .eq('assigned_to', adminId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    if (error) return [];
    return data;
}

// Get unassigned pending requests
async function getUnassignedRequests() {
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .select('*')
        .is('assigned_to', null)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    if (error) return [];
    return data;
}

// Auto-assign request to next online admin (round-robin)
async function autoAssignRequest(requestId) {
    dbLog('autoAssignRequest called for:', requestId);
    const onlineAdmins = await getOnlineAdmins();
    dbLog('Online admins:', onlineAdmins);
    if (onlineAdmins.length === 0) {
        dbLog('No online admins found, request will remain unassigned');
        return null;
    }
    
    // Get request counts for each online admin
    const { data: counts } = await supabaseClient
        .from('bonus_requests')
        .select('assigned_to')
        .eq('status', 'pending')
        .not('assigned_to', 'is', null);
    
    // Count assignments per admin
    const assignmentCounts = {};
    onlineAdmins.forEach(a => assignmentCounts[a.id] = 0);
    if (counts) {
        counts.forEach(r => {
            if (assignmentCounts[r.assigned_to] !== undefined) {
                assignmentCounts[r.assigned_to]++;
            }
        });
    }
    
    // Find admin with least assignments
    let minAdmin = onlineAdmins[0];
    let minCount = assignmentCounts[minAdmin.id] || 0;
    
    onlineAdmins.forEach(a => {
        const count = assignmentCounts[a.id] || 0;
        if (count < minCount) {
            minCount = count;
            minAdmin = a;
        }
    });
    
    // Assign to this admin
    dbLog('Assigning request', requestId, 'to admin', minAdmin.id, minAdmin.username);
    await assignRequestToAdmin(requestId, minAdmin.id);
    return minAdmin;
}

// Unassign all pending requests from an admin (when they go offline)
async function unassignAdminRequests(adminId) {
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update({ assigned_to: null, assigned_at: null })
        .eq('assigned_to', adminId)
        .eq('status', 'pending');
    
    if (error) {
        console.error('Error unassigning requests:', error);
        return false;
    }
    return true;
}

// Cleanup: Unassign pending requests from offline admins
async function cleanupOfflineAdminRequests() {
    // Get all offline admins
    const { data: offlineAdmins } = await supabaseClient
        .from('admins')
        .select('id')
        .neq('status', 'online');
    
    if (!offlineAdmins || offlineAdmins.length === 0) return;
    
    const offlineIds = offlineAdmins.map(a => a.id);
    
    // Unassign their pending requests
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update({ assigned_to: null, assigned_at: null })
        .in('assigned_to', offlineIds)
        .eq('status', 'pending');
    
    if (error) {
        console.error('Error cleaning up offline requests:', error);
    }
}

// Get active pending requests (unassigned OR assigned to online admins)
async function getActivePendingRequests() {
    // First cleanup offline admin requests
    await cleanupOfflineAdminRequests();
    
    // Get all pending requests
    const { data: allPending, error } = await supabaseClient
        .from('bonus_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    
    if (error || !allPending) return [];
    
    // Get online admin IDs
    const onlineAdmins = await getOnlineAdmins();
    const onlineAdminIds = onlineAdmins.map(a => a.id);
    
    // Filter: unassigned OR assigned to online admin
    return allPending.filter(r => 
        r.assigned_to === null || onlineAdminIds.includes(r.assigned_to)
    );
}

// ============================================
// SECURE LOGIN - supports both hash and legacy plain-text
// ============================================
async function validateLoginSecure(username, passwordHash, plainPassword) {
    const admin = await getAdminByUsername(username);
    if (!admin) return null;
    
    // Check if password is already hashed (64 char hex = SHA-256)
    const isHashed = admin.password && admin.password.length === 64 && /^[a-f0-9]+$/.test(admin.password);
    
    if (isHashed) {
        // Compare hashes
        if (admin.password === passwordHash) {
            return admin;
        }
    } else {
        // Legacy plain-text comparison (for migration)
        if (admin.password === plainPassword) {
            // Auto-migrate: Update to hashed password
            await supabaseClient
                .from('admins')
                .update({ password: passwordHash })
                .eq('id', admin.id);
            dbLog('Password migrated to hash for user:', username);
            return admin;
        }
    }
    
    return null;
}

// Add admin with hashed password
async function addAdminSecure(username, password, role = 'admin') {
    const passwordHash = await hashPassword(password);
    const { data, error } = await supabaseClient
        .from('admins')
        .insert([{ username, password: passwordHash, role, is_default: false }])
        .select()
        .single();
    if (error) {
        console.error('Error adding admin:', error);
        return null;
    }
    return data;
}

// Update password with hash
async function updateAdminPasswordSecure(id, newPassword) {
    const passwordHash = await hashPassword(newPassword);
    const { error } = await supabaseClient
        .from('admins')
        .update({ password: passwordHash })
        .eq('id', id);
    return !error;
}

// ============================================
// NOTE TEMPLATES (HASHTAGS)
// ============================================

// Get all active note templates
async function getNoteTemplates() {
    const { data, error } = await supabaseClient
        .from('note_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
    if (error) {
        console.error('Error fetching note templates:', error);
        return [];
    }
    return data;
}

// Get all note templates (including inactive) for admin management
async function getAllNoteTemplates() {
    const { data, error } = await supabaseClient
        .from('note_templates')
        .select('*')
        .order('sort_order', { ascending: true });
    if (error) return [];
    return data;
}

// Add new note template
async function addNoteTemplate(tag, text, category = 'general', icon = '📝') {
    // Get max sort_order
    const { data: existing } = await supabaseClient
        .from('note_templates')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
    
    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 1;
    
    const { data, error } = await supabaseClient
        .from('note_templates')
        .insert([{ 
            tag: tag.startsWith('#') ? tag : '#' + tag,
            text, 
            category, 
            icon, 
            sort_order: nextOrder 
        }])
        .select()
        .single();
    
    if (error) {
        console.error('Error adding note template:', error);
        return null;
    }
    return data;
}

// Update note template
async function updateNoteTemplate(id, updates) {
    updates.updated_at = new Date().toISOString();
    const { error } = await supabaseClient
        .from('note_templates')
        .update(updates)
        .eq('id', id);
    return !error;
}

// Delete note template
async function deleteNoteTemplate(id) {
    const { error } = await supabaseClient
        .from('note_templates')
        .delete()
        .eq('id', id);
    return !error;
}
