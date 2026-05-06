#!/bin/bash
# Vant Webhook CLI

set -e

COMMAND="$1"
shift || usage

usage() {
    echo "Usage: vant webhook <command>"
    echo ""
    echo "Commands:"
    echo "  serve            Start webhook server"
    echo "  register <name> <source> [options]"
    echo "  list             List registered webhooks"
    echo "  send <url> <payload>  Send webhook"
    exit 1
}

case "$COMMAND" in
    serve)
        echo "Starting webhook server..."
        node -e "require('./lib/webhooks').startServer()"
        ;;
    register)
        NAME="$1"; SOURCE="$2"
        if [ -z "$NAME" ] || [ -z "$SOURCE" ]; then
            echo "Usage: vant webhook register <name> <source>"
            exit 1
        fi
        node -e "
const webhooks = require('./lib/webhooks');
const result = webhooks.register({
    name: '$NAME',
    source: '$SOURCE'
});
console.log(JSON.stringify(result, null, 2));
"
        ;;
    list)
        echo "Registered webhooks:"
        echo "(use webhooks.js programmatically)"
        ;;
    send)
        URL="$1"; PAYLOAD="$2"
        node -e "
const webhooks = require('./lib/webhooks');
webhooks.send('$URL', $PAYLOAD).then(ok => console.log(ok ? 'Sent' : 'Failed'));
"
        ;;
    *)
        usage
        ;;
esac