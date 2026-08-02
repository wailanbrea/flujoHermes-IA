---
name: bsolutions-git-workflow
description: Guía y protocolo de automatización para ejecutar git add, git commit con formato convencional y git push a GitHub.
---

# BSolutions Git Automation Workflow Skill

Cuando el usuario pida realizar commit y push, o al finalizar una tarea verificada en un repositorio local:

## Protocolo de Ejecución de Git Commit & Push

1. **Verificar el Estado del Repositorio**:
   ```powershell
   git status
   ```

2. **Agregar los Archivos Modificados y Creados**:
   ```powershell
   git add .
   ```

3. **Crear el Commit con Mensaje Convencional (`type(scope): description`)**:
   - Tipos permitidos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
   - Ejemplo:
     ```powershell
     git commit -m "feat(parley-web): update closing sequence calculation logic and sync playwright tests"
     ```

4. **Publicar Cambios al Repositorio Remoto (Push)**:
   ```powershell
   git push origin main
   ```

5. **Verificación del Push**:
   - Confirmar que el comando retorne `main -> main` o `Everything up-to-date`.
   - Informar al usuario el hash corto del commit (ej. `a84f5f3`) y la confirmación de la sincronización remota.
