#!/bin/bash
# Prepara las sesiones de Claude Code en la nube: instala las dependencias de npm
# para que `npm test` y `npm run lint` funcionen desde el primer momento.
set -euo pipefail

# Sólo en sesiones remotas (en tu ordenador no hace nada)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install (y no npm ci) aprovecha la caché del contenedor entre sesiones
npm install --no-audit --no-fund
