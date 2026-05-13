#!/usr/bin/env sh
set -eu

HOST_ADDRESS="${1:-192.168.11.2:8080}"
PORT="${PORT:-18080}"
DEVICE_ID="${DEVICE_ID:-}"
SIGNALING="${SIGNALING:-p2p}"
AYAME_URL="${AYAME_URL:-}"
ROOM_ID="${ROOM_ID:-}"
CLIENT_ID="${CLIENT_ID:-}"
SIGNALING_KEY="${SIGNALING_KEY:-}"
DEBUG="${DEBUG:-0}"
AUTO_RECONNECT="${AUTO_RECONNECT:-1}"
VIDEO_RECONNECT="${VIDEO_RECONNECT:-}"
DEVICE_STATUS="${DEVICE_STATUS:-off}"
FLIP="${FLIP:-1}"
MIRROR="${MIRROR:-0}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "Python が見つかりません。Python 3 をインストールしてください。" >&2
  exit 1
fi

if ! "$PYTHON" - "$PORT" <<'PY' >/dev/null 2>&1
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket()
sock.settimeout(0.3)
try:
    sock.connect(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
then
  (cd "$SCRIPT_DIR" && "$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &)
  sleep 1
fi

QUERY="host=${HOST_ADDRESS}"
if [ "$SIGNALING" != "p2p" ]; then
  QUERY="${QUERY}&signaling=${SIGNALING}"
fi
if [ "$DEVICE_ID" != "" ]; then
  QUERY="${QUERY}&id=${DEVICE_ID}"
fi
if [ "$AYAME_URL" != "" ]; then
  QUERY="${QUERY}&ayameUrl=${AYAME_URL}"
fi
if [ "$SIGNALING" = "ayame" ]; then
  QUERY="${QUERY}&deviceHost=${HOST_ADDRESS}"
fi
if [ "$ROOM_ID" != "" ]; then
  QUERY="${QUERY}&roomId=${ROOM_ID}"
fi
if [ "$CLIENT_ID" != "" ]; then
  QUERY="${QUERY}&clientId=${CLIENT_ID}"
fi
if [ "$SIGNALING_KEY" != "" ]; then
  QUERY="${QUERY}&signalingKey=${SIGNALING_KEY}"
fi
if [ "$DEBUG" != "0" ]; then
  QUERY="${QUERY}&debug=${DEBUG}"
fi
if [ "$VIDEO_RECONNECT" = "" ]; then
  if [ "$SIGNALING" = "ayame" ]; then
    VIDEO_RECONNECT=1
  else
    VIDEO_RECONNECT=0
  fi
fi
if [ "$VIDEO_RECONNECT" != "0" ]; then
  QUERY="${QUERY}&videoReconnect=${VIDEO_RECONNECT}"
fi
if [ "$AUTO_RECONNECT" != "1" ]; then
  QUERY="${QUERY}&autoReconnect=${AUTO_RECONNECT}"
fi
if [ "$DEVICE_STATUS" != "off" ]; then
  QUERY="${QUERY}&deviceStatus=${DEVICE_STATUS}"
fi
if [ "$FLIP" != "1" ]; then
  QUERY="${QUERY}&flip=${FLIP}"
fi
if [ "$MIRROR" != "0" ]; then
  QUERY="${QUERY}&mirror=${MIRROR}"
fi
URL="http://127.0.0.1:${PORT}/viewer.html?${QUERY}"
echo "$URL"

case "$(uname -s)" in
  Darwin)
    open "$URL"
    ;;
  Linux)
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 &
    else
      echo "ブラウザで上記 URL を開いてください。"
    fi
    ;;
  *)
    echo "ブラウザで上記 URL を開いてください。"
    ;;
esac
