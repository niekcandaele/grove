#!/usr/bin/env bash
# Grove E2E Test Runner

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

# Determine grove binary path
if [[ -z "${GROVE_BIN:-}" ]]; then
    # Auto-detect based on platform
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    # Normalize architecture names
    case "$ARCH" in
        x86_64) ARCH="x64" ;;
        aarch64|arm64) ARCH="arm64" ;;
    esac

    GROVE_BIN="$SCRIPT_DIR/../../dist/grove-${OS}-${ARCH}"

    if [[ ! -x "$GROVE_BIN" ]]; then
        echo -e "${RED}Error: Grove binary not found at $GROVE_BIN${NC}"
        echo "Set GROVE_BIN environment variable or build the binary first."
        echo ""
        echo "To build: bun run build:binary"
        exit 1
    fi
fi

export GROVE_BIN

echo -e "${BOLD}=== Grove E2E Tests ===${NC}"
echo -e "Binary: ${YELLOW}$GROVE_BIN${NC}"
echo ""

# Check binary exists and is executable
if [[ ! -x "$GROVE_BIN" ]]; then
    echo -e "${RED}Error: Binary not executable: $GROVE_BIN${NC}"
    exit 1
fi

# Print version
echo -n "Version: "
"$GROVE_BIN" --version 2>/dev/null || echo "(unknown)"
echo ""

# Track overall results
SCENARIOS_RUN=0
SCENARIOS_PASSED=0
FAILED_SCENARIOS=()

# Run all scenario scripts
for scenario in "$SCRIPT_DIR/scenarios"/*.sh; do
    if [[ -f "$scenario" ]]; then
        scenario_name=$(basename "$scenario")
        ((SCENARIOS_RUN++)) || true

        if bash "$scenario"; then
            ((SCENARIOS_PASSED++)) || true
            echo ""
        else
            FAILED_SCENARIOS+=("$scenario_name")
            echo -e "${RED}FAILED: $scenario_name${NC}"
            echo ""
        fi
    fi
done

# Print summary
echo -e "${BOLD}=== Summary ===${NC}"
echo ""

if [[ ${#FAILED_SCENARIOS[@]} -eq 0 ]]; then
    echo -e "${GREEN}All $SCENARIOS_RUN scenarios passed${NC}"
    exit 0
else
    echo -e "${RED}${#FAILED_SCENARIOS[@]} of $SCENARIOS_RUN scenarios failed:${NC}"
    for scenario in "${FAILED_SCENARIOS[@]}"; do
        echo -e "  ${RED}✗${NC} $scenario"
    done
    exit 1
fi
