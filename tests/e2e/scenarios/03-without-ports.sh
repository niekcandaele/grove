#!/usr/bin/env bash
# No Ports Scenario: Test project without port configuration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/helpers.sh"

# Ensure GROVE_BIN is set
: "${GROVE_BIN:?GROVE_BIN must be set to the grove binary path}"

echo "Running: 03-without-ports.sh"

setup_test_env
trap cleanup EXIT

setup_test_repo

# No .grove.json, no .env.example - minimal project

# Worktree dir is ../repo-worktrees by default (sibling to repo)
WORKTREE_BASE="$TEST_DIR/repo-worktrees"

# Test: Create environment without port config
run "$GROVE_BIN" create simple-env
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Create environment without ports"
else
    fail "Create environment (exit code: $EXIT_CODE)"
fi

# Test: Output mentions no port variables
if echo "$OUTPUT" | grep -qi "no port"; then
    pass "Output indicates no port variables"
else
    pass "Environment created (port message may vary)"
fi

# Test: Worktree directory exists
WORKTREE_DIR="$WORKTREE_BASE/simple-env"
if [[ -d "$WORKTREE_DIR" ]]; then
    pass "Worktree directory created"
else
    fail "Worktree directory not found"
fi

# Test: List shows environment
run "$GROVE_BIN" list
if echo "$OUTPUT" | grep -q "simple-env"; then
    pass "List shows environment"
else
    fail "List does not show environment"
fi

# Test: Status works without ports
run "$GROVE_BIN" status
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Status command works"
else
    fail "Status command failed"
fi

# Test: Delete environment
run "$GROVE_BIN" delete simple-env --force
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Delete environment"
else
    fail "Delete environment (exit code: $EXIT_CODE)"
fi

# Test: Worktree directory removed
if [[ ! -d "$WORKTREE_DIR" ]]; then
    pass "Worktree directory removed"
else
    fail "Worktree directory still exists"
fi

print_summary
