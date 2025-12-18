#!/usr/bin/env bash
# E2E Test Helpers for Grove

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Test state
TESTS_RUN=0
TESTS_PASSED=0

# Print success message
pass() {
    local msg="$1"
    echo -e "  ${GREEN}✓${NC} $msg"
    ((TESTS_PASSED++)) || true
    ((TESTS_RUN++)) || true
}

# Print failure message and exit
fail() {
    local msg="$1"
    echo -e "  ${RED}✗${NC} $msg"
    ((TESTS_RUN++)) || true
    exit 1
}

# Print info message
info() {
    local msg="$1"
    echo -e "  ${YELLOW}→${NC} $msg"
}

# Setup isolated test environment
# Sets TEST_DIR, TEST_REPO, and HOME to temp directories
setup_test_env() {
    TEST_DIR=$(mktemp -d)
    TEST_REPO="$TEST_DIR/repo"

    # Isolate grove config and state by changing HOME
    export HOME="$TEST_DIR/home"
    mkdir -p "$HOME"

    # Ensure git has required config
    git config --global user.email "test@example.com" 2>/dev/null || true
    git config --global user.name "Test User" 2>/dev/null || true
    git config --global init.defaultBranch main 2>/dev/null || true
}

# Create a basic git repository for testing
setup_test_repo() {
    mkdir -p "$TEST_REPO"
    cd "$TEST_REPO"
    git init --quiet
    echo "# Test Project" > README.md
    git add README.md
    git commit --quiet -m "Initial commit"
}

# Cleanup test environment
cleanup() {
    if [[ -n "${TEST_DIR:-}" && -d "$TEST_DIR" ]]; then
        # Also clean up worktrees directory (sibling to repo)
        rm -rf "$TEST_DIR/repo-worktrees" 2>/dev/null || true
        rm -rf "$TEST_DIR"
    fi
}

# Assert command exits with expected code
# Usage: assert_exit_code 0 grove list
assert_exit_code() {
    local expected="$1"
    shift
    local actual=0
    "$@" >/dev/null 2>&1 || actual=$?
    if [[ "$actual" -ne "$expected" ]]; then
        fail "Expected exit code $expected, got $actual for: $*"
    fi
}

# Assert command output contains string
# Usage: assert_output_contains "pattern" grove list
assert_output_contains() {
    local pattern="$1"
    shift
    local output
    output=$("$@" 2>&1) || true
    if ! echo "$output" | grep -q "$pattern"; then
        fail "Output did not contain '$pattern' for: $*"
        echo "Output was: $output"
    fi
}

# Assert command output does NOT contain string
# Usage: assert_output_not_contains "pattern" grove list
assert_output_not_contains() {
    local pattern="$1"
    shift
    local output
    output=$("$@" 2>&1) || true
    if echo "$output" | grep -q "$pattern"; then
        fail "Output should not contain '$pattern' for: $*"
    fi
}

# Assert file exists
# Usage: assert_file_exists path/to/file
assert_file_exists() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        fail "File does not exist: $file"
    fi
}

# Assert file does not exist
# Usage: assert_file_not_exists path/to/file
assert_file_not_exists() {
    local file="$1"
    if [[ -f "$file" ]]; then
        fail "File should not exist: $file"
    fi
}

# Assert directory exists
# Usage: assert_dir_exists path/to/dir
assert_dir_exists() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        fail "Directory does not exist: $dir"
    fi
}

# Assert directory does not exist
# Usage: assert_dir_not_exists path/to/dir
assert_dir_not_exists() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        fail "Directory should not exist: $dir"
    fi
}

# Assert file contains string
# Usage: assert_file_contains path/to/file "pattern"
assert_file_contains() {
    local file="$1"
    local pattern="$2"
    if [[ ! -f "$file" ]]; then
        fail "File does not exist: $file"
    fi
    if ! grep -q "$pattern" "$file"; then
        fail "File '$file' does not contain '$pattern'"
    fi
}

# Assert file does NOT contain string
# Usage: assert_file_not_contains path/to/file "pattern"
assert_file_not_contains() {
    local file="$1"
    local pattern="$2"
    if [[ ! -f "$file" ]]; then
        return  # File doesn't exist, so it can't contain the pattern
    fi
    if grep -q "$pattern" "$file"; then
        fail "File '$file' should not contain '$pattern'"
    fi
}

# Run a command and capture output
# Usage: run grove create test-env
# Access results via $OUTPUT and $EXIT_CODE
run() {
    set +e
    OUTPUT=$("$@" 2>&1)
    EXIT_CODE=$?
    set -e
}

# Print test summary
print_summary() {
    echo ""
    if [[ $TESTS_PASSED -eq $TESTS_RUN ]]; then
        echo -e "${GREEN}All $TESTS_RUN tests passed${NC}"
    else
        local failed=$((TESTS_RUN - TESTS_PASSED))
        echo -e "${RED}$failed of $TESTS_RUN tests failed${NC}"
    fi
}
