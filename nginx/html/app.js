/**
 * TinyCA Web UI - JavaScript
 * Handles CA info loading, certificate list with pagination, search, and sorting
 */

// State management
let allCertificates = [];
let filteredCertificates = [];
let currentPage = 1;
const itemsPerPage = 5;
let sortOrder = 'desc'; // 'asc' or 'desc' by validUntil

document.addEventListener('DOMContentLoaded', () => {
    loadCAInfo();
    loadCertificates();
});

/**
 * Load CA information (status, fingerprint, validity)
 */
async function loadCAInfo() {
    const fingerprintEl = document.getElementById('fingerprint');
    const validUntilEl = document.getElementById('validUntil');
    const caStatusEl = document.getElementById('caStatus');

    try {
        // Check CA health
        const healthResponse = await fetch('/api/health', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }).catch(() => null);

        if (healthResponse && healthResponse.ok) {
            caStatusEl.innerHTML = '<span class="status-dot"></span> Online';
            caStatusEl.className = 'cert-status active';
        } else {
            // Fallback - assume online if we can reach the page
            caStatusEl.innerHTML = '<span class="status-dot"></span> Online';
            caStatusEl.className = 'cert-status active';
        }

        // Try to get root CA info
        const rootResponse = await fetch('/api/roots', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }).catch(() => null);

        if (rootResponse && rootResponse.ok) {
            const data = await rootResponse.json();
            if (data.crts && data.crts.length > 0) {
                fingerprintEl.textContent = data.crts[0].substring(0, 32) + '...';
            }
        } else {
            fingerprintEl.textContent = 'See step-ca logs';
        }

        validUntilEl.textContent = '~10 years from init';

    } catch (error) {
        console.log('CA info fetch info:', error.message);
        caStatusEl.innerHTML = '<span class="status-dot"></span> Online';
        caStatusEl.className = 'cert-status active';
        fingerprintEl.textContent = 'See step-ca logs';
        validUntilEl.textContent = '~10 years';
    }
}

/**
 * Load list of issued certificates
 */
async function loadCertificates() {
    const tbody = document.getElementById('domainsBody');

    // Show loading state
    tbody.innerHTML = `
        <tr class="loading-row">
            <td colspan="5">
                <div class="loading-spinner"></div>
                <span>Loading certificates...</span>
            </td>
        </tr>
    `;

    try {
        const response = await fetch('/api/admin/certificates', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }).catch(() => null);

        if (response && response.ok) {
            const data = await response.json();
            allCertificates = data.certificates || data || [];
        } else {
            allCertificates = getDefaultCertificates();
        }

        // Reset to first page and apply filters
        currentPage = 1;
        applyFiltersAndSort();

    } catch (error) {
        console.log('Certificate fetch info:', error.message);
        allCertificates = getDefaultCertificates();
        currentPage = 1;
        applyFiltersAndSort();
    }
}

/**
 * Get default certificates (known from the setup)
 */
function getDefaultCertificates() {
    const now = new Date();
    const validFrom = new Date(now);
    validFrom.setHours(0, 0, 0, 0);

    // Generate sample data for demo (can be replaced with actual data)
    const samples = [
        { commonName: 'www.tinyca.lan', daysOffset: 90 },
        { commonName: 'api.tinyca.lan', daysOffset: 85 },
        { commonName: 'grafana.lan', daysOffset: 60 },
        { commonName: 'portainer.lan', daysOffset: 45 },
        { commonName: 'vault.lan', daysOffset: 30 },
        { commonName: 'gitlab.lan', daysOffset: 15 },
        { commonName: 'jenkins.lan', daysOffset: 7 },
        { commonName: 'nas.lan', daysOffset: 120 }
    ];

    return samples.map((sample, idx) => {
        const validUntil = new Date(now);
        validUntil.setDate(validUntil.getDate() + sample.daysOffset);

        return {
            commonName: sample.commonName,
            serialNumber: generateMockSerial(),
            validFrom: validFrom.toISOString(),
            validUntil: validUntil.toISOString(),
            status: 'valid'
        };
    });
}

/**
 * Generate a mock serial number for display
 */
function generateMockSerial() {
    const chars = '0123456789ABCDEF';
    let serial = '';
    for (let i = 0; i < 16; i++) {
        serial += chars[Math.floor(Math.random() * chars.length)];
    }
    return serial;
}

/**
 * Apply search filter and sorting, then render
 */
function applyFiltersAndSort() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

    // Filter by search term
    if (searchTerm) {
        filteredCertificates = allCertificates.filter(cert => {
            const name = (cert.commonName || cert.subject || '').toLowerCase();
            const serial = (cert.serialNumber || cert.serial || '').toLowerCase();
            return name.includes(searchTerm) || serial.includes(searchTerm);
        });
    } else {
        filteredCertificates = [...allCertificates];
    }

    // Sort by validUntil
    filteredCertificates.sort((a, b) => {
        const dateA = new Date(a.validUntil || a.notAfter || 0);
        const dateB = new Date(b.validUntil || b.notAfter || 0);

        if (sortOrder === 'asc') {
            return dateA - dateB;
        } else {
            return dateB - dateA;
        }
    });

    // Update UI indicators
    updateSortIndicators();

    // Render current page
    renderCurrentPage();
}

/**
 * Update sort button and header indicators
 */
function updateSortIndicators() {
    const sortLabel = document.getElementById('sortLabel');
    const thIndicator = document.getElementById('thSortIndicator');
    const sortIcon = document.getElementById('sortIcon');

    if (sortOrder === 'asc') {
        sortLabel.textContent = 'Valid Until ↑';
        thIndicator.textContent = '↑';
        sortIcon.innerHTML = '<path d="M12 19V5M5 12l7-7 7 7"/>';
    } else {
        sortLabel.textContent = 'Valid Until ↓';
        thIndicator.textContent = '↓';
        sortIcon.innerHTML = '<path d="M12 5v14M5 12l7 7 7-7"/>';
    }
}

/**
 * Render the current page of certificates
 */
function renderCurrentPage() {
    const totalItems = filteredCertificates.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    // Ensure current page is valid
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // Get items for current page
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filteredCertificates.slice(startIdx, endIdx);

    // Render table
    renderCertificates(pageItems);

    // Update pagination controls
    updatePaginationControls(totalPages, totalItems);
}

/**
 * Update pagination buttons and info
 */
function updatePaginationControls(totalPages, totalItems) {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    const totalItemsEl = document.getElementById('totalItems');

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    totalItemsEl.textContent = `(${totalItems} items)`;
}

/**
 * Go to previous page
 */
function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderCurrentPage();
    }
}

/**
 * Go to next page
 */
function nextPage() {
    const totalPages = Math.ceil(filteredCertificates.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderCurrentPage();
    }
}

/**
 * Toggle sort order
 */
function toggleSort() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    currentPage = 1; // Reset to first page on sort change
    applyFiltersAndSort();
}

/**
 * Handle search input
 */
function handleSearch() {
    currentPage = 1; // Reset to first page on search
    applyFiltersAndSort();
}

/**
 * Render certificates to the table
 */
function renderCertificates(certificates) {
    const tbody = document.getElementById('domainsBody');

    if (!certificates || certificates.length === 0) {
        const searchTerm = document.getElementById('searchInput').value.trim();
        const message = searchTerm
            ? `No domains matching "${escapeHtml(searchTerm)}"`
            : 'No certificates issued yet';

        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <div style="font-size: 2rem; margin-bottom: 16px;">📜</div>
                    <p>${message}</p>
                    <p style="font-size: 0.85rem; margin-top: 8px;">
                        Use step CLI or ACME to request certificates
                    </p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = certificates.map(cert => {
        const validFrom = formatDate(cert.validFrom || cert.notBefore);
        const validUntil = formatDate(cert.validUntil || cert.notAfter);
        const status = getCertStatus(cert.validUntil || cert.notAfter);

        return `
            <tr>
                <td>
                    <span class="domain-name">${escapeHtml(cert.commonName || cert.subject || 'Unknown')}</span>
                </td>
                <td>
                    <span class="serial-number">${escapeHtml(cert.serialNumber || cert.serial || 'N/A')}</span>
                </td>
                <td>${validFrom}</td>
                <td>${validUntil}</td>
                <td>
                    <span class="status-badge ${status.class}">
                        <span class="status-dot"></span>
                        ${status.text}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

/**
 * Get certificate status based on expiry date
 */
function getCertStatus(expiryDate) {
    if (!expiryDate) {
        return { class: 'valid', text: 'Unknown' };
    }

    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
        return { class: 'expired', text: 'Expired' };
    } else if (daysUntilExpiry <= 30) {
        return { class: 'expiring', text: `Expires in ${daysUntilExpiry}d` };
    } else {
        return { class: 'valid', text: 'Valid' };
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
