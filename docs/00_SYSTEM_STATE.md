# Estado del sistema — 2026-07-27

## Resumen

La auditoría fue de solo lectura. No se instaló software, no se iniciaron servicios,
no se cargaron modelos y no se modificó ningún proyecto existente.

| Componente | Estado | Evidencia |
|---|---|---|
| Windows 11 Pro x64 | INSTALADO | 10.0.26200, build 26200 |
| RAM | INSTALADO | 62.88 GiB; 38.32 GiB libres durante la muestra |
| CPU | INSTALADO | AMD Ryzen 7 7800X3D, 8C/16T |
| Virtualización | INSTALADO | Firmware habilitado; hipervisor detectado |
| GPU principal | INSTALADO | AMD Radeon RX 9070; 15.92 GiB verificados por registro |
| PowerShell | INSTALADO | Windows PowerShell 5.1.26100.8894 |
| Git | INSTALADO | 2.55.0.windows.2 |
| Docker Desktop | INSTALADO | 4.81.0; motor detenido |
| WSL | INSTALADO | 2.6.3.0, kernel 6.6.87.2-1 |
| Ubuntu en WSL | NO INSTALADO | sólo `docker-desktop`, WSL2, detenida |
| Python global | INSTALADO | CPython 3.12.10 |
| Python de Hermes | INSTALADO | 3.11.15 |
| pipx | NO INSTALADO | comando no encontrado |
| Node.js | INSTALADO | 24.4.0 |
| npm / pnpm | INSTALADO | 11.4.2 / 11.9.0 |
| Java | INSTALADO | OpenJDK 21.0.10, JBR de Android Studio |
| Gradle global | NO INSTALADO | correcto si se usan wrappers por proyecto |
| Android Studio | INSTALADO | 2025.1 / build AI-261.25134.95.2612.15914620 |
| Android SDK / ADB | INSTALADO | plataformas 34–37; ADB 37.0.0 |
| PHP | INSTALADO | XAMPP PHP 8.2.12 |
| Composer | INSTALADO | 2.8.11 |
| MySQL | INSTALADO PERO INCOMPATIBLE | XAMPP usa MariaDB 10.4.32, no MySQL |
| LM Studio | INSTALADO | 0.4.20+1; servidor en 127.0.0.1:1234 |
| Hermes Agent | INSTALADO | 0.18.2, instalación pip aislada |
| Codex CLI | REQUIERE VERIFICACIÓN | binario localizado; ejecución directa denegada |
| Playwright | REQUIERE VERIFICACIÓN | no se validó una instalación de proyecto |
| VS Code | INSTALADO | 1.119.0 |
| Windows Terminal | INSTALADO | comando localizado; versión no reportada |
| CUDA / NVIDIA | NO APLICA | hardware principal AMD |

## LM Studio

- Escucha sólo en `127.0.0.1:1234`.
- `/v1/models` y `/api/v0/models` respondieron correctamente.
- Ningún modelo estaba cargado durante la auditoría.
- Modelos locales:
  - `qwen3.6-27b-mtp`, Q3_K_S, 14.42 GB, tool use, no probado.
  - `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`, Q4_K_M,
    22.07 GB, tool use, no probado.
  - `text-embedding-nomic-embed-text-v1.5`, Q4_K_M, 84.11 MB.
- El máximo anunciado de 262144 tokens describe capacidad del artefacto, no una
  configuración operativa segura. Se mantiene la propuesta conservadora de 22000
  tokens hasta benchmark reproducible.
- RAM, VRAM, tokens/s, tool calling real y recuperación tras error:
  REQUIERE VERIFICACIÓN porque no se cargó ni se invocó un modelo.

## Hermes

Hermes responde como CLI y ofrece `dashboard`, `status`, `doctor`, `checkpoints`,
`skills`, `tools`, `mcp` y `prompt-size`. Su dashboard nativo usa por defecto
`127.0.0.1:9119`. No se ejecutaron diagnóstico profundo ni configuración porque
podrían leer o alterar estado de usuario fuera del workspace.

## Red local

| Puerto | Binding | Proceso | Evaluación |
|---:|---|---|---|
| 1234 | 127.0.0.1 | LM Studio | Correcto: loopback |
| 11434 | 127.0.0.1 | Ollama | Detectado fuera del alcance inicial |
| 3306 | `::` | mysqld | Riesgo: escucha en todas las interfaces IPv6 |

El binding de MariaDB debe revisarse antes de integrar bases de datos. No se cambió.

## Repositorios existentes

Se identificaron 33 carpetas de primer nivel: 15 repositorios Git, 9 con cambios y
6 limpios. Se detectaron proyectos Laravel, PHP/Composer, Node y Android/Gradle.
El tamaño es aproximado y excluye dependencias, builds, `.git` y logs. El detalle
está en `reports/environment/environment-audit.md`. No se leyó ningún `.env`.

## Limitaciones de la auditoría

- Consultar el estado exacto de características opcionales de Windows mediante DISM
  requiere elevación; se dejó como REQUIERE VERIFICACIÓN.
- No se consultó documentación externa porque la política exige aprobación antes de
  conectarse a servicios externos.
- No se ejecutaron modelos, migraciones, pruebas de proyectos ni Docker Desktop.
