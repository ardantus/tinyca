#!/bin/bash
set -e

# Configuration
CA_URL="https://step-ca:9000"
ROOT_CERT="/home/step/certs/root_ca.crt"
CERT_DIR="/data/certs"
HOSTNAME="www.tinyca.lan"

mkdir -p "$CERT_DIR"

# Wait for CA
echo "Waiting for CA at $CA_URL..."
until curl -sk "$CA_URL/health" > /dev/null; do
  sleep 5
done

# Bootstrap if needed (get root cert) - technically we mount it, so we might just need to trust it.
# We need to install the root cert into the system trust store for 'step' to trust it, 
# or pass --root to every command. We will pass --root.

# Check if cert exists
if [ -f "$CERT_DIR/$HOSTNAME.crt" ] && [ -f "$CERT_DIR/$HOSTNAME.key" ]; then
    echo "Certificate exists. Checking expiry..."
    step certificate inspect "$CERT_DIR/$HOSTNAME.crt" --short --roots "$ROOT_CERT"
    
    # Simple renewal loop
    while true; do
        # Check if needs renewal (e.g. expires in < 30% of lifetime)
        # 'step ca renew' handles logic. 
        # We force renew if close to expiry.
        # But for 'daemon' mode, step has 'step ca renew --daemon'.
        echo "Starting renewal daemon..."
        step ca renew --daemon --root "$ROOT_CERT" --ca-url "$CA_URL" \
            --exec "echo 'Certificate renewed. Signal Nginx...'" \
            "$CERT_DIR/$HOSTNAME.crt" "$CERT_DIR/$HOSTNAME.key"
            
            # In a real setup we might want to HUP nginx. 
            # But since this container is separate, we can't easily HUP nginx container without docker socket.
            # Using a shared volume, Nginx might not pick it up immediately unless configured to reload.
            # For this 'Simple' setup, we rely on Nginx or a restart.
        sleep 3600
    done
else
    echo "Certificate missing. Issuing new certificate for $HOSTNAME..."
    # We need a provisioner. automated ACME.
    # To use ACME with 'step', we use 'step ca certificate' but that uses JWK usually.
    # To use ACME, we usually use certbot. 
    # BUT 'step' CLI can also use ACME? No, 'step ca certificate' uses OIDC/JWK tokens usually.
    # If we want to use ACME, we should use an ACME client OR use 'step ca certificate' with the OIDC token if we have one.
    # Since we are automating, we probably want to use the 'ACME' provisioner we just added.
    
    # Actually, for internal simple usage, we can use the JWK provisioner with a one-time token or password?
    # No, we want "automated endpoint".
    
    # If using ACME, we need an ACME client. 'step' is NOT an ACME client in that sense (it's the CA).
    # Wait, 'step' CAN be an ACME client? "step ca certificate ... --provisioner acme"? No.
    
    # Let's use `lego` or `certbot`?
    # OR, we can use the JWK admin provisioner since we have access to the secrets/password file!
    # That is much easier for an internal "sidecar" than setting up ACME challenges for a container that might not have port 80 exposed properly.
    
    echo "Certificate missing. Issuing new certificate for $HOSTNAME..."
    
    # User customization:
    # Modify these variables to change the Certificate Subject
    ORG_NAME="TinyCA"
    ORG_UNIT="IT-Internal"
    VALIDITY="2160h" # 90 days (24h * 90)

    # 1. Generate Key and CSR (Certificate Signing Request) using OpenSSL
    # step cli doesn't easily support O/OU flags without templates, so we use openssl.
    apk add --no-cache openssl > /dev/null 2>&1

    openssl req -new -newkey rsa:2048 -nodes \
        -keyout "$CERT_DIR/$HOSTNAME.key" \
        -out "$CERT_DIR/$HOSTNAME.csr" \
        -subj "/O=$ORG_NAME/OU=$ORG_UNIT/CN=$HOSTNAME"

    echo "Signing CSR with validity $VALIDITY..."
    
    # 2. Sign the CSR using the Admin provisioner
    step ca sign "$CERT_DIR/$HOSTNAME.csr" "$CERT_DIR/$HOSTNAME.crt" \
        --ca-url "$CA_URL" \
        --root "$ROOT_CERT" \
        --provisioner "admin" \
        --password-file "/home/step/secrets/password" \
        --not-after="$VALIDITY"
        
    echo "Certificate issued with Validity: $VALIDITY"
fi

# Go into renew loop
echo "Entering renewal loop..."
while true; do
    sleep 86400 # Check every day
    echo "Checking renewal..."
    step ca renew "$CERT_DIR/$HOSTNAME.crt" "$CERT_DIR/$HOSTNAME.key" \
        --ca-url "$CA_URL" --root "$ROOT_CERT" --password-file "/home/step/secrets/password" --force=false
done
