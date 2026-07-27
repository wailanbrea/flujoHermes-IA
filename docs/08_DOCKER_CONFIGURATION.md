# Configuración de Docker

- Docker Desktop 4.81
- Cliente y servidor 29.6.1
- Backend WSL2
- Motor Linux
- 16 CPU y aproximadamente 33 GiB asignados
- Integración visual habilitada para Ubuntu 24.04

## Compatibilidad observada

Docker Desktop no montó el CLI Linux dentro de Ubuntu. `docker.exe` sí funciona
desde WSL contra el mismo daemon. No se instaló un segundo Docker Engine porque
crearía dos daemons y riesgo de conflicto. Esta limitación se considera una
degradación de ergonomía, no de aislamiento ni del motor.
