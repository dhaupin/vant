#!/bin/bash
# VANT Stegoframe Poller Example - Poll for encrypted messages
#
# COPY THIS FILE AND REMOVE .example TO USE
# Edit the values before running
#
# This polls a stegoframe room for new messages.
# Requires stegoframe service (see https://stegoframe.creadev.org)
#
# Usage: ./poll.example.sh [--interval 30]
#   --interval: Poll interval in seconds (default: 30)

set -e

INTERVAL=${2:-30}

# EDIT THESE VALUES FOR YOUR SETUP
STEGOFRAME_URL="https://stegoframe.creadev.org"
STEGOFRAME_ROOM="your-room-name"
STEGOFRAME_PASSPHRASE="your-passphrase"

echo "╔═══════════════════════════════════════╗"
echo "║       VANT Stegoframe Poller           ║
╚═══════════════════════════════════════╝"
echo "Room: $STEGOFRAME_ROOM"
echo "Interval: ${INTERVAL}s"
echo ""

# Poll function
poll() {
    # Your implementation here - this is a template
    # 
    # Example curl:
    #   curl -s "$STEGOFRAME_URL/api/room/$STEGOFRAME_ROOM/messages" \
    #     -H "X-Passphrase: $STEGOFRAME_PASSPHRASE"
    #
    # Then decode with: node lib/stego.js decode image.png --decrypt YOUR_PASS
    
    echo "[$(date)] Polling..."
}

# Main loop
echo "Press Ctrl+C to stop"
while true; do
    poll
    sleep $INTERVAL
done