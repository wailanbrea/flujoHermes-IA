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
   - Para aplicaciones Vite/React (como `CalculadoraParley Web`), primero compilar el bundle si es necesario (`npm run build`) y servir la carpeta `dist`:
     ```powershell
     powershell -Command "php -S 127.0.0.1:8080 -t 'C:\xampp\php\www\[Proyecto]\dist'"
     ```
   - O bien lanzar el servidor de desarrollo Vite (`npm run dev -- --host 127.0.0.1 --port 5173`).

3. **Validación Automática de Respuesta HTTP**:
   - Probar con `Invoke-WebRequest -Uri 'http://127.0.0.1:8080/index.html'`
   - Confirmar estado HTTP 200 OK.

4. **Entregar la URL al Usuario**:
   - Entregar la URL directa `http://127.0.0.1:8080` (producción/dist) o `http://127.0.0.1:5173` (dev/Vite).
   - Cero excusas de entorno, cero pantallas en blanco.
