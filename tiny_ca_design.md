# Tiny Private CA - Architecture and Implementation Guide

This document outlines the design for a **Tiny Private Certificate Authority (CA)** tailored for homelab and internal LAN usage. It replaces hardware dependencies (like YubiKey) with a robust software-only approach using Docker and `step-ca`.

## 1. High-Level Architecture

The goal is to establish a secure chain of trust within a private network without relying on the public internet or external CAs like Let's Encrypt.

### Trust Chain Components

1.  **Root CA (Offline)**
    *   **Role:** The ultimate anchor of trust. It signs the Intermediate CA certificate.
    *   **Security:** Ideally kept offline. In this software-only design, the Root CA private key is generated, used *once* to sign the Intermediate CA, and then encrypted/stored securely (e.g., in a password manager or cold storage), removing it from the active server if possible.
    *   **Distribution:** The Root CA's public certificate (`root_ca.crt`) is the *only* file that needs to be distributed and installed on client devices (laptops, phones, servers).

2.  **Intermediate CA (Online)**
    *   **Role:** The active authority runs inside the Docker container. It issues leaf certificates for services (e.g., `grafana.lan`, `nas.local`) and handles ACME challenges.
    *   **Security:** Its private key resides in the Docker volume, encrypted by a strong password.

3.  **Clients (End Entities)**
    *   Services (servers) that need HTTPS certificates.
    *   Users (browsers/OS) that trust the Root CA.

### Why No Hardware Key (HSM)?
Removing the YubiKey reduces complexity and cost.
*   **Trade-off:** If the server is compromised, the Intermediate CA key could be stolen.
*   **Mitigation:** The Root CA key is not on the server (or is at least encrypted separate from the running service). If the Intermediate CA is compromised, you use the Root CA to revoke it and issue a new one.

---

## 2. Docker-Based Design

We use `docker-compose` for portability and ease of management.

### Directory Structure
```text
tinyca/
├── docker-compose.yml
├── secrets/
│   └── password          # Contains the password for the Intermediate CA key
└── step-ca-data/         # Persistent volume for CA database and config
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  step-ca:
    image: smallstep/step-ca
    container_name: step-ca
    restart: unless-stopped
    network_mode: host      # Recommended for internal logic/DNS simplicity, or expose ports 9000:9000
    environment:
      # Initial setup variables (only used on first run)
      - DOCKER_STEPCA_INIT_NAME=TinyCA
      - DOCKER_STEPCA_INIT_DNS_NAMES=localhost,ca.lan,step-ca
      - DOCKER_STEPCA_INIT_PROVISIONER_NAME=admin
      - DOCKER_STEPCA_INIT_PASSWORD_FILE=/home/step/secrets/password
    volumes:
      - ./step-ca-data:/home/step
      - ./secrets:/home/step/secrets:ro
```

**Key Configuration Details:**
*   `network_mode: host`: Simplifies troubleshooting and access on a LAN application. If you prefer bridge mode, mapping port `9000:9000` is standard.
*   `DOCKER_STEPCA_INIT_...`: These variables automate the specialized `step ca init` command so usage is seamless.
*   `secrets/password`: A text file containing the strong passphrase for your CA keys.

---

## 3. CA Initialization Process

### Step 1: Prepare the Environment
Create the directory and password file.
```bash
mkdir -p tinyca/secrets tinyca/step-ca-data
echo "SuperSecretStrongPassword123!" > tinyca/secrets/password
chmod 600 tinyca/secrets/password
```

### Step 2: Initialize CA
Run the container. On the **first boot**, `step-ca` detects an empty volume and initializes:
1.  Creates a generic Root CA and Intermediate CA.
2.  Encrypts keys using the provided password file.
3.  Configures a default `JWK` provisioner (for admin tasks).

```bash
docker-compose up -d
docker-compose logs -f
```
*Wait until you see "Serving HTTPS on :9000 ..."*

### Step 3: Enable ACME Provisioner
ACME allows tools like `certbot` or `traefik` to auto-renew certs.
We need to add an ACME provisioner to the configuration. We can execute the `step` CLI *inside* the container to do this.

```bash
# Add ACME provisioner named 'acme'
docker exec step-ca step ca provisioner add acme --type ACME

# Restart to apply changes
docker-compose restart
```

---

## 4. Client Bootstrap and Trust

To make devices trust your new CA, you must install the **Root CA Certificate**.

### Get the Root Certificate
Download it from the CA server:
```bash
curl -k https://<IP_OF_CA>:9000/root.crt -o root_ca.crt
```
*Note: We verify the fingerprint effectively by trusting the source in a homelab context, or running `docker exec step-ca step certificate fingerprint /home/step/certs/root_ca.crt` to compare.*

### Install Trust (Linux/Ubuntu)
```bash
sudo cp root_ca.crt /usr/local/share/ca-certificates/tinyca.crt
sudo update-ca-certificates
```

### Install Trust (Windows/Mac)
*   **Windows:** Import `root_ca.crt` into "Trusted Root Certification Authorities" via generic management console (`certlm.msc`).
*   **Mac:** Add to Keychain Access -> System -> Certificates, and set Trust to "Always Trust".

---

## 5. Certificate Issuance Methods

### A. Manual Issuance (CLI)
Best for one-off internal services or testing. You need the `step` CLI installed on your client machine, or run it via Docker.

**One-time Bootstrap (connect client to CA):**
```bash
step ca bootstrap --ca-url https://ca.lan:9000 --fingerprint <ROOT_CA_FINGERPRINT>
```

**Issue a Certificate:**
```bash
# Generate cert and key for 'grafana.lan'
step ca certificate grafana.lan grafana.crt grafana.key
```

### B. ACME Issuance (Automated)
This is the standard for modern infrastructure.

**ACME Directory URL:**
`https://<CA_IP>:9000/acme/acme/directory`

**Example with Certbot:**
```bash
sudo certbot certonly --standalone \
  --server https://ca.lan:9000/acme/acme/directory \
  -d grafana.lan
```
*Note: Since this is local, you usually use DNS-01 challenges or point `grafana.lan` to the machine running certbot so HTTP-01 works locally.*

---

## 6. LAN HTTPS Usage Example

### Scenario
You are running **Grafana** on `192.168.1.50` and want it accessible at `https://grafana.lan`.

1.  **DNS:** Configure your local DNS (Pi-hole, router) to point `grafana.lan` -> `192.168.1.50`.
2.  **Issue Cert:**
    On the Grafana server, use the `step` CLI to get a cert (simplest for internal static IPs):
    ```bash
    step ca certificate grafana.lan /etc/grafana/grafana.crt /etc/grafana/grafana.key
    ```
3.  **Configure Grafana (`grafana.ini`):**
    ```ini
    [server]
    protocol = https
    cert_file = /etc/grafana/grafana.crt
    cert_key = /etc/grafana/grafana.key
    ```
4.  **Restart Grafana.**
5.  **Browser:** Navigate to `https://grafana.lan`. Since you installed the Root CA on your laptop, the lock icon will be green and valid.

---

## 7. Security Considerations

| Feature | Risk | Mitigation |
| :--- | :--- | :--- |
| **No YubiKey** | Keys stored on disk. If attacker gets root access to server, they can copy the CA keys. | Use strict file permissions (`600`). Run CA in a dedicated, minimal VM/container. |
| **Online CA** | Intermediate CA is always online. | Keep the *Root CA* key offline if possible (advanced setup). For this "Tiny" setup, backup `step-ca-data` frequently to a distinct secure location. |
| **Trust** | If Root CA is compromised, attacker can MITM all your LAN traffic. | Do not install this Root CA on work devices or devices you don't control. |

### Backup Strategy
Periodically backup the `step-ca-data` directory.
```bash
tar -czvf ca-backup-$(date +%F).tar.gz tinyca/
gpg -c ca-backup-....tar.gz # Encrypt backup
```

### Rotation
*   **Leaf Certs:** Short expiry (24h) is default for `step-ca` to minimize impact of compromise. ACME handles daily renewal.
*   **Intermediate CA:** Defaults to 10 years in this setup.
