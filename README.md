# Tiny Private CA

A lightweight, Docker-based Private Certificate Authority (CA) designed for home labs and internal networks. This project uses `step-ca` to provide secure, automated HTTPS certificates for your internal services (e.g., `*.lan`, `*.internal`) without relying on the public internet or external hardware.

## 🚀 Features

*   **Software-Only**: Runs entirely in Docker. No YubiKeys or HSMs required.
*   **Automated**: ACME protocol support for seamless integration with Traefik, Caddy, or Nginx.
*   **Private**: Complete control over your PKI. Keys never leave your network.
*   **Simple**: Easy to bootstrap and backup.

## 📂 Project Structure

```text
tinyca/
├── docker-compose.yml       # Service definition
├── secrets/
│   └── password             # Password for CA keys (PROTECT THIS FILE)
├── step-ca-data/            # Persistent storage (Database, Config, Keys)
├── scripts/
│   ├── ensure_acme.sh       # Helper to manually enable ACME (legacy)
│   ├── init_acme.sh         # Automated ACME initialization script
│   └── renew_certs.sh       # Script for Nginx auto-renewal
└── README.md                # This documentation
```

## 🛠️ Prerequisites

*   Docker & Docker Compose installed.
*   Linux environment (Ubuntu/Debian/Raspberry Pi) or WSL2 on Windows.
*   `curl` and `step` CLI (optional but recommended for clients).

## 🏁 Quick Start

### 1. Setup Password
**CRITICAL**: Change the default password before starting.
```bash
echo "Rahasia.33" > secrets/password
chmod 600 secrets/password
```
> [!WARNING]
> **DO NOT change this file after initialization!**
> The keys in `step-ca-data` are encrypted with this password. If you change the text file later without re-encrypting the keys, `step-ca` will fail to start.
> To change the password later, you must manually re-encrypt the keys using the `step` CLI.

### 2. Start the CA
```bash
docker compose up -d
```
Check logs to ensure it initialized successfully:
```bash
docker compose logs -f
```
Wait for "Serving HTTPS on :9000 ...".

### 3. Enable ACME (Automated)
The updated `docker-compose.yml` includes an `acme-init` service that automatically attempts to add the ACME provisioner. You can check its logs:
```bash
docker compose logs acme-init
```

Fungsi dari service acme-init adalah untuk mengotomatiskan konfigurasi agar step-ca bisa berfungsi seperti Let's Encrypt.

Berikut detailnya:
Menambahkan Fitur ACME: Secara default, saat baru diinstall, step-ca belum mengaktifkan protokol ACME (protokol yang dipakai oleh Certbot/Traefik). acme-init menjalankan perintah step ca provisioner add acme secara otomatis agar Anda tidak perlu mengetiknya manual.



### 4. Verify Nginx SSL
We have included an Nginx service (`www.tinyca.lan`) that automatically gets a certificate.
1. Add `127.0.0.1 www.tinyca.lan` to your hosts file.
2. Visit `https://www.tinyca.lan` in your browser.
   - If you installed the Root CA (see below), it should be Secure!

### 5. Customizing Certificate Details (O, OU, Validity)
To change the Organization (O), Organizational Unit (OU), or Validity (e.g. 90 days or 365 days):
1. Needs to restart the whole stack (to update provisioner config).
2. Edit `scripts/renew_certs.sh`.
3. Change the variables at the top of the issuance section:
   ```bash
   ORG_NAME="TinyCA"
   ORG_UNIT="IT-Internal"
   VALIDITY="2160h" # 90 days. Use "8760h" for 1 year.
   ```
4. Delete the existing certs (`rm -rf certs-data/*`) or wait for renewal.
5. Restart: `docker compose up -d`.

### 6. Creating Wildcard Certificates (*.tinyca.lan)
To create a wildcard certificate (e.g., valid for `db.tinyca.lan`, `app.tinyca.lan`):

**Note**: ACME (Certbot) usually requires DNS challenges for wildcards, which is difficult for local `.lan` domains without a proper DNS server. Use the manual method:

1.  **Run inside the container** (easiest way):
    ```bash
    docker exec -it step-ca step ca certificate "*.tinyca.lan" /home/step/wildcard.crt /home/step/wildcard.key --provisioner admin
    ```
    *It will ask for your CA password.*

2.  **Copy the files out**:
    ```bash
    docker cp step-ca:/home/step/wildcard.crt .
    docker cp step-ca:/home/step/wildcard.key .
    ```


### 7. Installing SSL on Other Servers (Linux/Lan)
To use certificates on other servers (e.g. `192.168.1.100`):

1.  **Install Certbot**:
    ```bash
    sudo apt install certbot -y
    ```
2.  **Request Certificate**:
    ```bash
    sudo certbot certonly --standalone \
      --server https://tinyca.lan:9000/acme/acme/directory \
      -d myserver.lan
    ```

### 8. Changing CA Password (Without Invalidating Certs)
If you need to change the password in `secrets/password`, you MUST re-encrypt the private keys. If you don't do this, the CA will not start.

**Steps:**

1.  **Stop the CA**:
    ```bash
    docker compose down
    ```

2.  **Re-encrypt Keys** (Run this for both Root and Intermediate keys):
    ```bash
    # For Root Key
    docker run --rm -it -v "${PWD}/secrets:/secrets" smallstep/step-cli step crypto change-pass /secrets/root_ca_key

    # For Intermediate Key
    docker run --rm -it -v "${PWD}/secrets:/secrets" smallstep/step-cli step crypto change-pass /secrets/intermediate_ca_key
    ```
    *You will be asked for the OLD password, then the NEW password.*

3.  **Update Password File**:
    Update the `secrets/password` file with your **NEW** password.

4.  **Start CA**:
    ```bash
    docker compose up -d
    ```
    *Existing certificates (Root CA on clients, issued certs) remain valid.*

---

## 🔐 Establishing Trust (Client Bootstrap)

For your devices (laptops, servers) to trust certificates issued by this CA, you must install the **Root CA Certificate**.

### 1. Download the Root Certificate
From any client machine on the network:
```bash
# Replace tinyca.lan with your Docker host's IP if DNS isn't set up yet
curl -k https://tinyca.lan:9000/root.crt -o root_ca.crt
```

### 2. Install Trust

#### Ubuntu / Debian
```bash
sudo cp root_ca.crt /usr/local/share/ca-certificates/tinyca.crt
sudo update-ca-certificates
```

#### Windows
1.  Double-click `root_ca.crt`.
2.  Click "Install Certificate".
3.  Select "Local Machine".
4.  Place in **"Trusted Root Certification Authorities"**.

#### macOS
1.  Open Keychain Access.
2.  Drag `root_ca.crt` into **System** keychain.
3.  Double-click it, expand **Trust**, and set "When using this certificate" to **Always Trust**.

---

## 📜 Issuing Certificates

### Method A: Automated (ACME) - Recommended
Use this for services like Nginx, Traefik, or any ACME-compatible server.

**ACME Directory URL**: `https://tinyca.lan:9000/acme/acme/directory`

#### Example: Certbot
```bash
# Note: Since this is internal, use --standalone if port 80 is available, 
# or ensure 'grafana.lan' resolves to the machine running certbot.

sudo certbot certonly --standalone \
  --server https://tinyca.lan:9000/acme/acme/directory \
  -d grafana.lan
```

### Method B: Manual (Step CLI)
Great for testing or one-off static services.

```bash
# 1. Bootstrap the client (one time)
step ca bootstrap --ca-url https://tinyca.lan:9000 --fingerprint <ROOT_FINGERPRINT>

# 2. Issue Token & Cert
step ca certificate grafana.lan grafana.crt grafana.key
```
*Tip: You can find the fingerprint in the `docker compose logs` startup banner.*

---

## 🛡️ Security & Backup

### Why NO YubiKey?
This project prioritizes **availability and simplicity**. Keys are stored on disk (`step-ca-data`) encrypted by your password (`secrets/password`).
*   **Risk**: If someone steals your server's hard drive and the password file, they can forge certificates.
*   **Mitigation**:
    1.  Keep the server secure.
    2.  Use a strong password.

### Backup Strategy
Back up the `step-ca-data` folder regularly. This contains your:
*   Root CA Key (Encrypted)
*   Intermediate CA Key (Encrypted)
*   Database of issued certificates

```bash
tar -czvf ca-backup.tar.gz step-ca-data/ secrets/
```

## ❓ Troubleshooting

**Client says "Certificate signed by unknown authority"**
*   You missed the "Establishing Trust" step on that client.

**ACME fails with connection refused**
*   Ensure `tinyca.lan` resolves to the CA's IP address.
*   Ensure port 9000 is reachable through firewalls.
*   If using `step-ca` in Docker, ensure `network_mode: host` or port 9000 is mapped.

**Container crashes on start**
*   Check permissions of `secrets/password`. The container user (UID 1000) must be able to read it.
*   Check if you changed the password file without re-encrypting the keys.
