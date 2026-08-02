---
name: bsolutions-xampp-server
description: Habilidad autónoma multi-stack para detectar, levantar, verificar y mantener servidores web en Windows local (PHP, Laravel, Python, Node/Vite).
---

# BSolutions Multi-Stack Web Server Launcher Skill

Cuando el usuario pida levantar, iniciar, probar o verificar un servidor web local para cualquier proyecto en cualquier lenguaje o framework:

## Detección Automática por Tecnología

### 1. Proyectos PHP Estándar (XAMPP / Vanilla PHP)
- **Criterio**: Contiene archivos `.php` y un `index.php` en la raíz.
- **Comando**:
  ```powershell
  php -S 127.0.0.1:8080 -t "C:\xampp\php\www\[Proyecto]"
  ```
- **URL**: `http://127.0.0.1:8080`

### 2. Proyectos Laravel (PHP Framework)
- **Criterio**: Presencia de archivo `artisan` o carpeta `bootstrap/app.php`.
- **Comando**:
  ```powershell
  php artisan serve --host 127.0.0.1 --port 8000
  ```
  *(O servir la carpeta `/public`: `php -S 127.0.0.1:8000 -t "C:\xampp\php\www\[Proyecto]\public"`)*
- **URL**: `http://127.0.0.1:8000`

### 3. Proyectos Python (Django, FastAPI, Flask)
- **Django** (presencia de `manage.py`):
  ```powershell
  python manage.py runserver 127.0.0.1:8000
  ```
- **FastAPI** (presencia de `main.py` con `FastAPI` / `uvicorn`):
  ```powershell
  uvicorn main:app --host 127.0.0.1 --port 8000 --reload
  ```
- **Flask** (presencia de `app.py` / `wsgi.py`):
  ```powershell
  python app.py
  ```
- **URL**: `http://127.0.0.1:8000` o `http://127.0.0.1:5000`

### 4. Proyectos Node.js / React / Vite / Next.js
- **Vite / React** (`package.json` con script `"dev": "vite"`):
  - Producción: `npm run build` y servir `dist`:
    ```powershell
    php -S 127.0.0.1:8080 -t "C:\xampp\php\www\[Proyecto]\dist"
    ```
  - Desarrollo: `npm run dev -- --host 127.0.0.1 --port 5173`
- **Next.js**: `npm run dev` (`http://127.0.0.1:3000`)

---

## Protocolo de Ejecución Obligatorio

1. **Verificación Determinística**: Comprobar respuesta HTTP con `Invoke-WebRequest -Uri 'http://127.0.0.1:[Puerto]/'`.
2. **Entregar URL Directa**: Dar la URL lista para usar sin excusas ni preguntas manuales.
