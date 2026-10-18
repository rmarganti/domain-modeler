#!/usr/bin/env bash
# Launch, check, and tear down an isolated Domain Modeler instance for verification.
#
#   eval "$(verify.sh launch [web|desktop])"   start an instance, export VERIFY_* vars
#   verify.sh doctor                           read-only health check of $VERIFY_RUN
#   verify.sh cleanup                          stop what launch started, keep evidence
#
# State lives in .verify/<run>/state (removed by cleanup); evidence lives in
# .verify/<run>/evidence (kept). Never touches port 1420, which `pnpm app:dev` owns.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SKILL_DIR="$REPO/.agents/skills/verify-domain-modeler"
VERIFY_ROOT="$REPO/.verify"

die() { echo "verify: $*" >&2; exit 1; }
log() { echo "verify: $*" >&2; }

free_port() {
  local port=1520
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do port=$((port + 1)); done
  echo "$port"
}

kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

tree_pids() {
  local child
  echo "$1"
  for child in $(pgrep -P "$1" 2>/dev/null); do tree_pids "$child"; done
}

# Waits up to $2 seconds for the log at $1 to contain $3 (ANSI codes stripped).
wait_for_log() {
  local i
  for ((i = 0; i < $2 * 2; i++)); do
    sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$1" 2>/dev/null | grep -qE "$3" && return 0
    sleep 0.5
  done
  return 1
}

require_run() {
  [[ -n "${VERIFY_RUN:-}" ]] || die "VERIFY_RUN is not set; run: eval \"\$(verify.sh launch)\""
  STATE="$VERIFY_ROOT/$VERIFY_RUN/state"
  [[ -d "$STATE" ]] || die "no state for run $VERIFY_RUN at $STATE"
  MODE="$(cat "$STATE/mode")"
  PORT="$(cat "$STATE/port")"
  PID="$(cat "$STATE/pid")"
}

launch() {
  local mode="${1:-web}"
  [[ "$mode" == web || "$mode" == desktop ]] || die "unknown mode '$mode' (web|desktop)"
  [[ -x "$REPO/node_modules/.bin/vite" ]] || die "dependencies missing; run: pnpm install"

  local run port state evidence session
  run="$(date +%Y%m%d-%H%M%S)-$$"
  port="$(free_port)"
  state="$VERIFY_ROOT/$run/state"
  evidence="$VERIFY_ROOT/$run/evidence"
  session="verify-$run"
  mkdir -p "$state" "$evidence"
  echo "$mode" >"$state/mode"
  echo "$port" >"$state/port"
  git -C "$REPO" rev-parse --short HEAD >"$state/rev"

  if [[ "$mode" == web ]]; then
    # Redirect the whole subshell so nothing holds the caller's $(...) pipe open.
    (cd "$REPO" && exec node_modules/.bin/vite --port "$port" --strictPort) \
      </dev/null >"$state/server.log" 2>&1 &
    echo $! >"$state/pid"
    wait_for_log "$state/server.log" 30 "ready in" || die "vite did not start; see $state/server.log"
    echo "$session" >"$state/session"
    # The first agent-browser call starts a daemon; keep it off the caller's stdout too.
    agent-browser --session "$session" set viewport 1400 900 </dev/null >/dev/null 2>&1
    agent-browser --session "$session" open "http://localhost:$port" </dev/null >/dev/null 2>&1
    # Ready means the editor rendered and sits in Normal mode, not just that vite answered.
    agent-browser --session "$session" wait '[aria-label="Mode: NORMAL"]' </dev/null >/dev/null 2>&1 \
      || die "app did not reach Normal mode; see $state/server.log"
  else
    local config
    config="{\"build\":{\"devUrl\":\"http://localhost:$port\",\"beforeDevCommand\":\"pnpm exec vite --port $port --strictPort\"}}"
    (cd "$REPO" && exec pnpm exec tauri dev --config "$config") \
      </dev/null >"$state/server.log" 2>&1 &
    echo $! >"$state/pid"
    # First build compiles ~350 crates; later builds take seconds.
    wait_for_log "$state/server.log" 900 "runtime connected" \
      || die "desktop app did not start; see $state/server.log"
    # The window title is set by the frontend through Tauri IPC, so it proves the webview booted.
    local i
    for ((i = 0; i < 30; i++)); do
      [[ "$(window_title "$(cat "$state/pid")")" == *"Domain Modeler"* ]] && break
      sleep 1
    done
  fi

  log "run $run ready ($mode) on port $port"
  echo "export VERIFY_RUN=$run"
  echo "export VERIFY_URL=http://localhost:$port"
  echo "export VERIFY_EVIDENCE=$evidence"
  [[ "$mode" == web ]] && echo "export AGENT_BROWSER_SESSION=$session"
  return 0
}

# Prints the on-screen window title owned by any process in the tree rooted at $1.
window_title() {
  local pids
  pids="$(tree_pids "$1" | paste -sd, -)"
  swift "$SKILL_DIR/scripts/window-title.swift" "$pids" 2>/dev/null || true
}

# tauri dev starts Vite outside our process tree, so also accept a listener that
# is this repo's Vite started with this run's port.
owns_port() {
  ps -o command= -p "$1" | grep -q -- "vite.*--port $PORT --strictPort" &&
    [[ "$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" == "$REPO" ]]
}

doctor() {
  require_run
  local ok=0 owner title
  echo "run:      $VERIFY_RUN ($MODE)"
  echo "build:    $(cat "$STATE/rev") (HEAD is $(git -C "$REPO" rev-parse --short HEAD))"

  if kill -0 "$PID" 2>/dev/null; then echo "process:  up (pid $PID)"; else echo "process:  DOWN (pid $PID)"; ok=1; fi

  owner="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  if [[ -n "$owner" ]] && { tree_pids "$PID" | grep -qx "$owner" || owns_port "$owner"; }; then
    echo "port:     $PORT owned by this run"
  else
    echo "port:     $PORT NOT owned by this run (listener: ${owner:-none})"; ok=1
  fi

  if curl -fsS "http://localhost:$PORT" | grep -q "<title>"; then
    echo "server:   serving http://localhost:$PORT"
  else
    echo "server:   NOT serving http://localhost:$PORT"; ok=1
  fi

  if [[ "$MODE" == web ]]; then
    local session url mode
    session="$(cat "$STATE/session")"
    url="$(agent-browser --session "$session" get url 2>/dev/null || true)"
    mode="$(agent-browser --session "$session" get attr '[aria-label^="Mode:"]' aria-label 2>/dev/null || true)"
    if [[ "$url" == "http://localhost:$PORT"* ]]; then echo "browser:  session $session at $url"; else echo "browser:  session $session NOT on this run (url: ${url:-none})"; ok=1; fi
    echo "editor:   ${mode:-not rendered}"
    [[ -n "$mode" ]] || ok=1
  else
    title="$(window_title "$PID")"
    if [[ "$title" == *"Domain Modeler"* ]]; then echo "window:   \"$title\""; else echo "window:   NOT FOUND"; ok=1; fi
  fi

  [[ $ok -eq 0 ]] && echo "doctor:   OK" || echo "doctor:   FAILED"
  return $ok
}

cleanup() {
  require_run
  [[ "$MODE" == web ]] && agent-browser --session "$(cat "$STATE/session")" close >/dev/null 2>&1 || true
  kill_tree "$PID"
  rm -rf "$STATE"
  log "stopped run $VERIFY_RUN; evidence kept at $VERIFY_ROOT/$VERIFY_RUN/evidence"
}

case "${1:-}" in
  launch) shift; launch "$@" ;;
  doctor) doctor ;;
  cleanup) cleanup ;;
  *) die "usage: verify.sh launch [web|desktop] | doctor | cleanup" ;;
esac
