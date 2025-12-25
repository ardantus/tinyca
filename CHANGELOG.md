# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1] - 2025-12-25

### Added
- **Pagination**: Domain list now shows 5 items per page with Prev/Next navigation
- **Search**: Filter domains by name or serial number in real-time
- **Sorting**: Toggle ascending/descending sort by Valid Until date
- Sample demo data for UI testing (8 certificate examples)

---

## [1.1.0] - 2025-12-25

### Added
- **Web UI**: Modern dashboard accessible at `https://www.tinyca.lan`
  - Download Root CA certificate directly from browser
  - View list of registered domains and certificate status
  - Installation instructions for Windows, macOS, Linux, and Firefox
  - Dark theme with glassmorphism design
  - Responsive mobile-friendly layout
- **API Proxy**: Nginx now proxies `/api/*` requests to step-ca

### Changed
- Updated `nginx/conf.d/default.conf` to serve static UI files
- Updated `docker-compose.yml` to mount HTML directory and root CA

---

## [1.0.0] - 2025-12-15

### Added
- **Docker Core**: Initial `docker-compose.yml` with `step-ca` service.
- **ACME Automation**: Added `acme-init` service to automatically provision ACME protocol.
- **Nginx Demo**: Added `nginx` service to demonstrate SSL termination.
- **Certificate Renewal**: Added `cert-renewer` sidecar for automatic issuance and renewal.
- **Scripts**:
  - `scripts/init_acme.sh`: Automated provisioner setup.
  - `scripts/renew_certs.sh`: Renewal script supporting CSR generation for custom O/OU.
- **Documentation**: Comprehensive `README.md` with guides for:
  - Trusting Root CA (Windows/Mac/Linux).
  - Wildcard Certificates.
  - Custom Validity (90 days vs 1 year).
  - Password rotation.
  - Installing SSL on external LAN servers.
