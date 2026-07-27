# Errors and solutions

## WSL could not reach Windows localhost

- Cause: default NAT networking did not mirror the LM Studio loopback listener.
- Resolution: configure WSL `networkingMode=mirrored`, shut down WSL, and retest.
- Evidence: Ubuntu reached `127.0.0.1:1234`.

## Docker CLI missing inside Ubuntu

- Cause: Docker Desktop did not mount its Linux CLI tools despite the enabled
  integration toggle.
- Resolution: use `docker.exe` interop against the same daemon. Do not install a
  duplicate Docker Engine.
- State: documented compatibility limitation.

## Hermes rejected 22K context

- Cause: Hermes requires at least 64K.
- Resolution: set a real 65.536-token context and verify the loaded model.

## LM Studio JIT exhausted memory margin

- Cause: auto-load selected 262K context and parallel 4.
- Resolution: explicit mode plus wrapper-enforced 64K, parallel 1, GPU 0.6.
- Evidence: free RAM improved from 1.54 GiB to approximately 13 GiB.

## Dashboard starter Next/Vinext falló en Windows

- Cause: el servidor integrado no resolvía assets en Windows y la cadena mantenía
  advisories altos sin una actualización segura.
- Resolution: reemplazar el starter por React + Vite y un servidor estático local
  pequeño; `npm audit` final informa cero vulnerabilidades.

## Hermes `--oneshot` bypasses approvals

- Finding: the installed Hermes implementation sets `HERMES_YOLO_MODE=1` when
  `--oneshot` is used.
- Impact: `--oneshot` is not acceptable for this workspace because it is equivalent
  to bypassing manual tool approvals.
- Resolution: use the interactive CLI and block `--oneshot`, `-z`, and `--yolo` in
  `scripts/windows/start-hermes-local.ps1`.
- Historical note: early smoke tests used `--oneshot` before this behavior was
  discovered. They performed no destructive action, but they do not count as
  security-approval validation.

## Hermes pilot report contradicted the code history

- Symptom: the final PHP test passed, but Hermes reported that no code fix was
  required even though the baseline implementation used `floor()`.
- Resolution: verify the exact file and test independently, then correct the report.
- State: functional PHP result passes; autonomous reporting quality and checkpoint
  restoration was later certified independently.

## Hermes checkpoint store stayed empty

- Cause: checkpoints are opt-in and `checkpoints.enabled` was absent from the
  isolated profile.
- Resolution: enable checkpoints with conservative limits and validate a shadow
  snapshot plus single-file restore using a disposable canary.
- Evidence: checkpoint `dbb3aba`; restored content matched the baseline.
