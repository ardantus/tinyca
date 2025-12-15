#!/bin/bash
set -e

# Wait for step-ca to be ready
echo "Waiting for step-ca to be ready..."
until curl -sk https://step-ca:9000/health > /dev/null; do
  echo "Sleeping 5s..."
  sleep 5
done

echo "step-ca is up. Checking provisioners..."

# We need to bootstrap to talk to the CA as an admin, or just use 'step ca provisioner list' if we are on the same machine/volume.
# However, this container is separate.
# But we can share the volume 'step-ca-data' to access the secrets and admin config directly.
# Using 'step ca provisioner name' directly requires direct db access or admin credentials.

# Simplest approach in Docker Compose sidecar:
# The sidecar can execute commands via `step ca provisioner ...` if it has access to the configuration.
# BUT `step ca provisioner` command usually runs ON the CA server (it edits the config file).
# Since we are in a separate container, we can't easily edit the file unless we mount the volume.

# BETTER APPROACH:
# Mount the step-ca-data volume to this container at /home/step.
# Then we can run `step ca provisioner add ...` locally which edits the config file.
# BUT `step-ca` server might need a restart to pick it up if it doesn't watch the file.
# `step-ca` supports hot reloads for some things, but provisioners usually require restart.

# So, we will check if it exists in the config file.
CONFIG_FILE="/home/step/config/ca.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Config file not found at $CONFIG_FILE. Is the volume mounted?"
    exit 1
fi

if grep -q "\"ACME\"" "$CONFIG_FILE"; then
    echo "ACME provisioner already exists."
else
    echo "Adding ACME provisioner..."
    # We use 'step ca provisioner add' but we need to point to the config
    # Since we act as the CA admin here (shared volume)
    # The password for the CA is needed to decrypt the keys if we were signing, but for config editing it might not be.
    # Actually 'step ca provisioner add' creates keys for the provisioner? No, ACME doesn't have a key like OIDC.
    
    step ca provisioner add acme --type ACME --ca-config "$CONFIG_FILE"
    
    echo "ACME provisioner added."
fi

# Update Admin provisioner to allow longer certs (e.g. 1 year)
echo "Updating admin provisioner max duration to 8760h..."
step ca provisioner update admin --ca-config "$CONFIG_FILE" --x509-max-dur 8760h

# Restart hint
echo "Configuration updated. You might need to restart step-ca to apply changes."

