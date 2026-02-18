#!/bin/bash
# Script di installazione ContextKit per Kiro CLI
# Uso: bash scripts/install-kiro.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/plugin/dist"
KIRO_DIR="$HOME/.kiro"
KIRO_AGENTS_DIR="$KIRO_DIR/agents"
KIRO_MCP_DIR="$KIRO_DIR/settings"
DATA_DIR="$HOME/.contextkit"

ERRORS=0

echo "=== Installazione ContextKit per Kiro CLI ==="
echo ""

# 1. Verifica prerequisiti
echo "[1/6] Verifica prerequisiti..."

# Rileva WSL
IS_WSL=false
if [ -f /proc/version ]; then
    if grep -qi "microsoft\|wsl" /proc/version 2>/dev/null; then
        IS_WSL=true
        echo "  ℹ  Ambiente WSL rilevato"
    fi
fi

# Verifica Node.js presente
if ! command -v node &> /dev/null; then
    echo "  ✗ ERRORE: Node.js non trovato."
    if [ "$IS_WSL" = true ]; then
        echo "    → In WSL, installa Node.js nativo Linux:"
        echo "      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
        echo "      sudo apt-get install -y nodejs"
        echo "      Oppure usa nvm: https://github.com/nvm-sh/nvm"
    else
        echo "    → Installalo da: https://nodejs.org"
    fi
    exit 1
fi

# Versione Node >= 18
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  ✗ ERRORE: Node.js >= 18 richiesto. Versione attuale: $(node -v)"
    echo "    → Aggiorna: nvm install 22 && nvm use 22"
    exit 1
fi
echo "  ✓ Node.js $(node -v)"

# WSL: verifica che Node sia nativo Linux
if [ "$IS_WSL" = true ]; then
    NODE_PATH=$(which node)
    if echo "$NODE_PATH" | grep -q "^/mnt/[c-z]/"; then
        echo "  ✗ ERRORE: Node.js punta a Windows ($NODE_PATH)"
        echo "    → Installa Node.js dentro WSL:"
        echo "      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
        echo "      sudo apt-get install -y nodejs"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✓ Node.js nativo Linux: $NODE_PATH"
    fi

    # WSL: verifica npm prefix
    NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
    if echo "$NPM_PREFIX" | grep -q "^/mnt/[c-z]/"; then
        echo "  ✗ ERRORE: npm global prefix punta a Windows ($NPM_PREFIX)"
        echo "    → Fix:"
        echo "      mkdir -p ~/.npm-global"
        echo "      npm config set prefix ~/.npm-global"
        echo "      echo 'export PATH=\"\$HOME/.npm-global/bin:\$PATH\"' >> ~/.bashrc"
        echo "      source ~/.bashrc"
        ERRORS=$((ERRORS + 1))
    fi
fi

# Build tools (Linux)
if [ "$(uname)" = "Linux" ]; then
    MISSING_PKGS=""
    if ! command -v make &> /dev/null || ! command -v g++ &> /dev/null; then
        MISSING_PKGS="build-essential"
    fi
    if ! command -v python3 &> /dev/null; then
        MISSING_PKGS="$MISSING_PKGS python3"
    fi
    if [ -n "$MISSING_PKGS" ]; then
        echo "  ✗ AVVISO: Build tools mancanti ($MISSING_PKGS)"
        echo "    → sudo apt-get update && sudo apt-get install -y $MISSING_PKGS"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✓ Build tools disponibili (make, g++, python3)"
    fi
fi

# Se ci sono errori critici, fermati
if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "  ✗ Installazione annullata: $ERRORS problema(i) da risolvere."
    echo "    Risolvi e riprova: npm run install:kiro"
    exit 1
fi

if ! command -v kiro-cli &> /dev/null; then
    echo "  ⚠ AVVISO: kiro-cli non trovato nel PATH. Assicurati che sia installato."
fi

# 2. Build
echo "[2/6] Compilazione..."
cd "$PROJECT_DIR"
npm install --silent 2>/dev/null || true
npm run build

# 3. Crea directory
echo "[3/6] Creazione directory..."
mkdir -p "$KIRO_AGENTS_DIR"
mkdir -p "$KIRO_MCP_DIR"
mkdir -p "$DATA_DIR"

# 4. Genera configurazione agente con path assoluti
echo "[4/6] Installazione agente Kiro..."
sed "s|__CONTEXTKIT_DIST__|$DIST_DIR|g" "$PROJECT_DIR/kiro-agent/contextkit.json" > "$KIRO_AGENTS_DIR/contextkit.json"
echo "  → $KIRO_AGENTS_DIR/contextkit.json"

# 5. Configura MCP
echo "[5/6] Configurazione MCP..."
MCP_FILE="$KIRO_MCP_DIR/mcp.json"
if [ -f "$MCP_FILE" ]; then
    # Aggiungi contextkit al file esistente (se non già presente)
    if ! grep -q '"contextkit"' "$MCP_FILE" 2>/dev/null; then
        # Usa node per merge JSON sicuro
        node -e "
          const fs = require('fs');
          const existing = JSON.parse(fs.readFileSync('$MCP_FILE', 'utf8'));
          if (!existing.mcpServers) existing.mcpServers = {};
          existing.mcpServers.contextkit = {
            command: 'node',
            args: ['$DIST_DIR/servers/mcp-server.js']
          };
          fs.writeFileSync('$MCP_FILE', JSON.stringify(existing, null, 2));
        "
        echo "  → Aggiunto a $MCP_FILE"
    else
        echo "  → contextkit già presente in $MCP_FILE"
    fi
else
    # Crea nuovo file
    cat > "$MCP_FILE" << MCPEOF
{
  "mcpServers": {
    "contextkit": {
      "command": "node",
      "args": ["$DIST_DIR/servers/mcp-server.js"]
    }
  }
}
MCPEOF
    echo "  → Creato $MCP_FILE"
fi

# 6. Copia steering file (opzionale)
echo "[6/6] Copia steering file..."
STEERING_DIR="$KIRO_DIR/steering"
mkdir -p "$STEERING_DIR"
if [ ! -f "$STEERING_DIR/contextkit.md" ]; then
    cp "$PROJECT_DIR/kiro-agent/steering.md" "$STEERING_DIR/contextkit.md"
    echo "  → $STEERING_DIR/contextkit.md"
else
    echo "  → Steering file già presente"
fi

echo ""
echo "=== Installazione completata ==="
echo ""
echo "Per usare ContextKit con Kiro CLI:"
echo "  1. Avvia il worker:  cd $PROJECT_DIR && npm run worker:start"
echo "  2. Usa l'agente:     kiro-cli --agent contextkit-memory"
echo ""
echo "Oppure usa l'agente default con hook automatici."
echo ""
echo "Directory dati: $DATA_DIR"
echo "Database:       $DATA_DIR/contextkit.db"
echo "Log:            $DATA_DIR/logs/"
