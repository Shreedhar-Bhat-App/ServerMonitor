let autoRefreshInterval = null;
let currentFilter = null;
let allServers = [];

async function fetchServerStatus(showLoadingIndicator = false) {
    try {
        const refreshBtn = document.getElementById('refresh-btn');
        
        if (showLoadingIndicator) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
        }
        
        const response = await fetch('/api/serverstatus');
        const data = await response.json();
        
        allServers = data;
        updateServerGrid(currentFilter ? filterServers(data, currentFilter) : data);
        updateStats(data);
        updateLastUpdateTime();
        
        if (showLoadingIndicator) {
            // Show success indication briefly
            refreshBtn.classList.remove('loading');
            refreshBtn.classList.add('success');
            setTimeout(() => {
                refreshBtn.classList.remove('success');
                refreshBtn.disabled = false;
            }, 1000);
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
        showError('Failed to fetch server status');
        const refreshBtn = document.getElementById('refresh-btn');
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
    }
}

function updateServerGrid(servers) {
    const grid = document.getElementById('server-grid');
    grid.innerHTML = '';
    
    servers.forEach(server => {
        const card = createServerCard(server);
        grid.appendChild(card);
    });
}

function createServerCard(server) {
    const card = document.createElement('div');
    card.className = 'server-card';
    
    const statusClass = `status-${server.status}`;
    const statusText = getStatusText(server.status, server.responseTime);
    const statusIcon = getStatusIcon(server.status);
    
    card.innerHTML = `
        <div class="server-header">
            <div>
                <h3 class="server-name">${server.name}</h3>
                <span class="category-badge category-${server.category.toLowerCase()}">${server.category}</span>
            </div>
            <div class="status-indicator ${statusClass}" title="${statusText}">
                ${statusIcon}
            </div>
        </div>
        <div class="server-details">
            <div class="detail-row">
                <span class="detail-label">Host:</span>
                <span class="detail-value">${server.host}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value ${statusClass}">${statusText}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Response Time:</span>
                <span class="detail-value">${server.responseTime > 0 ? server.responseTime + ' ms' : 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Last Checked:</span>
                <span class="detail-value">${formatTime(server.lastChecked)}</span>
            </div>
        </div>
    `;
    
    return card;
}

function getStatusText(status, responseTime) {
    if (status === 'green') {
        return `Excellent (${responseTime}ms)`;
    } else if (status === 'yellow') {
        return `Slow (${responseTime}ms)`;
    } else {
        return 'Offline';
    }
}

function getStatusIcon(status) {
    return `
        <svg class="status-icon" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10"/>
        </svg>
    `;
}

function updateStats(servers) {
    const green = servers.filter(s => s.status === 'green').length;
    const yellow = servers.filter(s => s.status === 'yellow').length;
    const red = servers.filter(s => s.status === 'red').length;
    
    document.getElementById('total-servers').textContent = servers.length;
    document.getElementById('online-servers').textContent = green;
    document.getElementById('slow-servers').textContent = yellow;
    document.getElementById('offline-servers').textContent = red;
    
    // Update active state for filter cards
    updateFilterActiveState();
}

function filterServers(servers, status) {
    if (!status) return servers;
    return servers.filter(s => s.status === status);
}

function applyFilter(status) {
    if (currentFilter === status) {
        // Clear filter if clicking the same status
        currentFilter = null;
    } else {
        currentFilter = status;
    }
    
    updateServerGrid(currentFilter ? filterServers(allServers, currentFilter) : allServers);
    updateFilterActiveState();
}

function updateFilterActiveState() {
    // Remove active class from all stat cards
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active-filter');
    });
    
    // Add active class to the filtered status card
    if (currentFilter === 'green') {
        document.querySelector('.stat-card:nth-child(2)').classList.add('active-filter');
    } else if (currentFilter === 'yellow') {
        document.querySelector('.stat-card:nth-child(3)').classList.add('active-filter');
    } else if (currentFilter === 'red') {
        document.querySelector('.stat-card:nth-child(4)').classList.add('active-filter');
    }
}

function updateLastUpdateTime() {
    const now = new Date();
    document.getElementById('last-update-time').textContent = now.toLocaleTimeString();
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString();
}

function showError(message) {
    console.error(message);
    // You could add a toast notification here
}

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(() => {
        fetchServerStatus();
    }, 10000); // 10 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchServerStatus();
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchServerStatus(true); // Show loading indicator on manual refresh
    });
    
    // Auto-refresh toggle
    document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
        if (e.target.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
    
    // Status filter click handlers
    document.querySelectorAll('.stat-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            if (index === 1) applyFilter('green');  // Online
            else if (index === 2) applyFilter('yellow');  // Slow
            else if (index === 3) applyFilter('red');  // Offline
            else if (index === 0) applyFilter(null);  // Total (clear filter)
        });
    });
});
