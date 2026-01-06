// Supabase Configuration
const SUPABASE_URL = 'https://vbojfpkosxkwbofaghlg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZib2pmcGtvc3hrd2JvZmFnaGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NTgxNDIsImV4cCI6MjA4MzIzNDE0Mn0.-uUYM4OeA9VpJyJzrJ2f03KXfeF6E85G7zNFYJMk_5Q';

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
    console.log('addBonusRequest called with:', request);
    const insertData = {
        request_id: request.id,
        username: request.username,
        bonus_type: request.bonusType,
        bonus_type_label: request.bonusTypeLabel,
        note: request.note || '',
        status: 'pending',
        notified: false
    };
    console.log('Insert data:', insertData);
    
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .insert([insertData])
        .select()
        .single();
    
    if (error) {
        console.error('Supabase error details:', error.message, error.details, error.hint, error.code);
        return null;
    }
    console.log('Insert successful:', data);
    return data;
}

async function updateBonusRequestStatus(id, status, adminNote = '') {
    const updateData = { 
        status, 
        updated_at: new Date().toISOString()
    };
    if (adminNote) {
        updateData.admin_note = adminNote;
    }
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update(updateData)
        .eq('id', id);
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

// Check if user has pending request (rate limit)
async function checkUserHasPendingRequest(username) {
    const { data, error } = await supabaseClient
        .from('bonus_requests')
        .select('id')
        .ilike('username', username)
        .eq('status', 'pending')
        .limit(1);
    if (error) return false;
    return data && data.length > 0;
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
    if (error) return [];
    return data;
}

// Assign request to admin
async function assignRequestToAdmin(requestId, adminId) {
    const { error } = await supabaseClient
        .from('bonus_requests')
        .update({ 
            assigned_to: adminId,
            assigned_at: new Date().toISOString()
        })
        .eq('id', requestId);
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
    const onlineAdmins = await getOnlineAdmins();
    if (onlineAdmins.length === 0) return null;
    
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
    await assignRequestToAdmin(requestId, minAdmin.id);
    return minAdmin;
}
