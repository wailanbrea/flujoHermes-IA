---
name: bsolutions-xampp-server
description: Habilidad autónoma para levantar, verificar y mantener servidores web PHP/XAMPP y Vite en Windows local.
---

# BSolutions XAMPP & PHP Server Launcher Skill

Cuando el usuario pida levantar, iniciar, probar o verificar un servidor web local para cualquier proyecto en `C:\xampp\php\www\` o `C:\AI-Workspace\`:

## Procedimiento Autónomo

1. **Identificar la Ruta del Proyecto**:
   - `C:\xampp\php\www\CalculadoraParley Web`
   - `C:\xampp\php\www\[NombreProyecto]`

2. **Ejecutar el Servidor Web Integrado de PHP o Dev Server**:
   - Lanzar el servidor en segundo plano:
     ```powershell
     powershell -Command "php -S 127.0.0.1:8080 -t 'C:\xampp\php\www\[Proyecto]'"
     ```
   - Si el proyecto usa Node/Vite, ejecutar `npm run dev`.

3. **Validación Automática de Respuesta HTTP**:
   - Probar con `Invoke-WebRequest -Uri 'http://127.0.0.1:8080/index.html'`
   - Confirmar estado HTTP 200 OK.

4. **Entregar la URL al Usuario**:
   - Entregar la URL directa `http://127.0.0.1:8080` o `http://localhost/CalculadoraParley%20Web/`.
   - Cero excusas de entorno, cero preguntas teóricas.
