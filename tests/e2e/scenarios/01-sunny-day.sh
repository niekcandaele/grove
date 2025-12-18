#!/usr/bin/env bash
# Sunny Day Scenario: Basic create/list/activate/delete flow

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/helpers.sh"

# Ensure GROVE_BIN is set
: "${GROVE_BIN:?GROVE_BIN must be set to the grove binary path}"

echo "Running: 01-sunny-day.sh"

setup_test_env
trap cleanup EXIT

setup_test_repo

# Worktree dir is ../repo-worktrees by default (sibling to repo)
WORKTREE_BASE="$TEST_DIR/repo-worktrees"

# Test: Create environment
run "$GROVE_BIN" create test-env
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Create environment"
else
    fail "Create environment (exit code: $EXIT_CODE)"
fi

# Test: Worktree directory exists
WORKTREE_DIR="$WORKTREE_BASE/test-env"
if [[ -d "$WORKTREE_DIR" ]]; then
    pass "Worktree directory created"
else
    fail "Worktree directory not found at $WORKTREE_DIR"
fi

# Test: List shows the environment
run "$GROVE_BIN" list
if echo "$OUTPUT" | grep -q "test-env"; then
    pass "List shows environment"
else
    fail "List does not show environment"
fi

# Test: Activate outputs cd command
run "$GROVE_BIN" activate test-env
if echo "$OUTPUT" | grep -q "cd.*test-env"; then
    pass "Activate outputs cd command"
else
    fail "Activate did not output cd command"
fi

# Test: Delete environment
run "$GROVE_BIN" delete test-env --force --delete-branch
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

# Test: List shows no environments
run "$GROVE_BIN" list
if echo "$OUTPUT" | grep -q "No environments found"; then
    pass "List shows no environments"
else
    fail "List should show no environments after delete"
fi

print_summary
