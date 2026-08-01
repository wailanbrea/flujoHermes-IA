# Handoff para el Próximo Director AI

## 1. Resumen de Transferencia
El sistema de programación con IA local está completamente configurado y probado en `C:\AI-Workspace\local-ai-orchestrator`.

## 2. Comandos Operativos Clave

### A. Preparación y Cambio de Modelo
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\prepare-hermes-model.ps1 -Model agents-a1
```

### B. Ejecución de Tarea en Sandbox
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\new-hermes-sandbox.ps1 -TaskId "FACT-001" -ProjectPath "C:\xampp\php\www\WalletFinanzasBackend"
```

### C. Pipeline de Validación y Promoción
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\validate-hermes-task.ps1 -TaskId "FACT-001"
powershell -ExecutionPolicy Bypass -File .\scripts\windows\approve-hermes-task.ps1 -TaskId "FACT-001"
powershell -ExecutionPolicy Bypass -File .\scripts\windows\promote-hermes-task.ps1 -TaskId "FACT-001"
powershell -ExecutionPolicy Bypass -File .\scripts\windows\final-verify-hermes-task.ps1 -TaskId "FACT-001"
```

### D. Visualización de Telemetría TRAMA
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-dashboard.ps1
```
Abrir `http://127.0.0.1:4310` en el navegador local.
