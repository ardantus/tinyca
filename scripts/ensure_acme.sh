#!/bin/bash
# script to ensure ACME provisioner exists
# Usage: ./scripts/ensure_acme.sh

CONTAINER_NAME="step-ca"

echo "Checking if ACME provisioner exists..."
if docker exec $CONTAINER_NAME step ca provisioner list | grep -q "\"ACME\""; then
    echo "ACME provisioner already exists."
else
    echo "Creating ACME provisioner..."
    docker exec $CONTAINER_NAME step ca provisioner add acme --type ACME
    echo "Restarting step-ca to apply changes..."
    docker restart $CONTAINER_NAME
    echo "Done."
fi
