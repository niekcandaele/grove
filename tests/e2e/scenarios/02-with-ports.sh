#!/usr/bin/env bash
# Port Allocation Scenario: Test port allocation and reuse

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/helpers.sh"

# Ensure GROVE_BIN is set
: "${GROVE_BIN:?GROVE_BIN must be set to the grove binary path}"

echo "Running: 02-with-ports.sh"

setup_test_env
trap cleanup EXIT

setup_test_repo

# Create .env.example with port variables
cat > "$TEST_REPO/.env.example" << 'EOF'
HTTP_PORT=3000
DB_PORT=5432
REDIS_PORT=6379
EOF

# Create .grove.json with port patterns
cat > "$TEST_REPO/.grove.json" << 'EOF'
{
  "portVarPatterns": ["*_PORT"]
}
EOF

# Commit the config files
cd "$TEST_REPO"
git add .env.example .grove.json
git commit --quiet -m "Add port config"

# Worktree dir is ../repo-worktrees by default (sibling to repo)
WORKTREE_BASE="$TEST_DIR/repo-worktrees"

# Test: Create first environment
run "$GROVE_BIN" create env-one
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Create first environment with ports"
else
    fail "Create first environment (exit code: $EXIT_CODE)"
fi

# Test: .env file exists in worktree
ENV_FILE="$WORKTREE_BASE/env-one/.env"
if [[ -f "$ENV_FILE" ]]; then
    pass "ENV file created in worktree"
else
    fail "ENV file not found at $ENV_FILE"
fi

# Test: Ports allocated starting from 30000
if grep -q "HTTP_PORT=30000" "$ENV_FILE"; then
    pass "HTTP_PORT allocated (30000)"
else
    fail "HTTP_PORT not set to 30000"
fi

if grep -q "DB_PORT=30001" "$ENV_FILE"; then
    pass "DB_PORT allocated (30001)"
else
    fail "DB_PORT not set to 30001"
fi

if grep -q "REDIS_PORT=30002" "$ENV_FILE"; then
    pass "REDIS_PORT allocated (30002)"
else
    fail "REDIS_PORT not set to 30002"
fi

# Test: Status shows port allocations
run "$GROVE_BIN" status
if echo "$OUTPUT" | grep -q "30000"; then
    pass "Status shows port allocations"
else
    fail "Status does not show port allocations"
fi

# Test: Create second environment with different ports
run "$GROVE_BIN" create env-two
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Create second environment"
else
    fail "Create second environment (exit code: $EXIT_CODE)"
fi

# Test: Second env gets different ports
ENV_FILE_TWO="$WORKTREE_BASE/env-two/.env"
if grep -q "HTTP_PORT=30003" "$ENV_FILE_TWO"; then
    pass "Second env gets different HTTP_PORT (30003)"
else
    fail "Second env did not get port 30003"
fi

# Test: Delete first environment
run "$GROVE_BIN" delete env-one --force --delete-branch
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Delete first environment"
else
    fail "Delete first environment (exit code: $EXIT_CODE)"
fi

# Test: Create third environment - should reuse released ports
run "$GROVE_BIN" create env-three
if [[ $EXIT_CODE -eq 0 ]]; then
    pass "Create third environment"
else
    fail "Create third environment (exit code: $EXIT_CODE)"
fi

# Test: Third env reuses released ports (30000-30002)
ENV_FILE_THREE="$WORKTREE_BASE/env-three/.env"
if grep -q "HTTP_PORT=30000" "$ENV_FILE_THREE"; then
    pass "Third env reuses released port (30000)"
else
    fail "Third env did not reuse port 30000"
fi

# Cleanup remaining environments
"$GROVE_BIN" delete env-two --force --delete-branch >/dev/null 2>&1 || true
"$GROVE_BIN" delete env-three --force --delete-branch >/dev/null 2>&1 || true

print_summary
