#!/bin/bash
# ═══════════════════════════════════════════════════════════
# create-ocp — Quick installer for Orange Cheese Pizza
# Usage: bash install.sh
#    or: curl -fsSL https://raw.githubusercontent.com/zubershk/ocp/master/install.sh | bash
# ═══════════════════════════════════════════════════════════
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}Orange Cheese Pizza — Installer${NC}"
echo ""

# ── Check git ──
if ! command -v git &> /dev/null; then
    echo -e "${RED}git is required. Install it first.${NC}"
    exit 1
fi

# ── Ask where to install ──
INSTALL_DIR="${1:-orange-cheese-pizza}"
echo -e "${BOLD}Where to install?${NC}"
read -p "  Directory [./$INSTALL_DIR]: " INPUT_DIR
INSTALL_DIR=${INPUT_DIR:-$INSTALL_DIR}

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Directory '$INSTALL_DIR' already exists.${NC}"
    read -p "  Remove it and continue? [y/N]: " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "Aborted."
        exit 1
    fi
    rm -rf "$INSTALL_DIR"
fi

# ── Clone ──
echo ""
echo -e "${BOLD}Cloning repository...${NC}"
git clone --depth 1 https://github.com/zubershk/ocp.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ── Run setup wizard ──
echo ""
echo -e "${BOLD}Running setup wizard...${NC}"
bash setup.sh

# ── Start ──
echo ""
echo -e "${BOLD}Starting services...${NC}"
docker compose up -d

echo ""
echo -e "${GREEN}${BOLD}Done!${NC}"
echo ""
echo -e "  ${BOLD}Your OCP instance is running:${NC}"
echo -e "    Frontend:     ${CYAN}http://localhost:3000${NC}"
echo -e "    Admin:        ${CYAN}http://localhost:3000/admin${NC}"
echo -e "    Bot API:      ${CYAN}http://localhost:8090${NC}"
echo -e "    Campaign:     ${CYAN}http://localhost:3001${NC}"
echo ""
