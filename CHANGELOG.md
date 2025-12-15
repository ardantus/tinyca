# Changelog

All notable changes to this project will be documented in this file.

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
