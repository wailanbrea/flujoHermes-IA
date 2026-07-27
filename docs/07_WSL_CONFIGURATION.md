# Configuración de WSL2

- Distribución: Ubuntu 24.04.4 LTS
- Usuario predeterminado: `aiops` (sin sudo)
- Workspace Linux: `/home/aiops/workspace`
- Acceso al workspace Windows:
  `/mnt/c/AI-Workspace/local-ai-orchestrator`
- Red: modo reflejado mediante `C:\Users\waila\.wslconfig`

Paquetes instalados: Git, Python 3.12, pipx, build-essential, GCC, jq, curl,
unzip, certificados y venv.

No se duplicaron Node.js, PHP, Java ni MariaDB en WSL.
