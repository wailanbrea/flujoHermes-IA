---
name: pdf-template-reconstruction
description: Reconstrucción y perfeccionamiento de plantillas Blade PDF en Laravel desde imágenes de referencia visual (Facturas, Informes Técnicos, Presupuestos).
version: 1.1.0
platforms: [windows]
metadata:
  hermes:
    tags: [laravel, blade, pdf, playwright, browsershot, puppeteer, html-css-print, page-orientation]
    category: development
    requires_toolsets: [terminal, file, vision, todo]
---

# PDF Template Reconstruction Skill

## Role & Mission
Actúa como arquitecto senior de generación documental, desarrollador Laravel/Blade, especialista en HTML/CSS para impresión, Chromium, Browsershot, Puppeteer, Playwright y reconstrucción de interfaces a partir de imágenes de referencia.

### Proyecto Objetivo Predeterminado
- **Proyecto**: FacturaPro
- **Directorio Principal**: `C:\xampp\php\www\FacturaPro\backend`
- **Plantillas clave**:
  - `resources\views\pdf\invoice.blade.php` (Factura / Informe de Intervención Técnica - A4 Landscape Horizontal)
  - `resources\views\pdf\quotation.blade.php` (Presupuesto - A4 Landscape Horizontal)

---

## Protocolo Estricto de Orientación de Página (Horizontal vs Vertical)

ANTES de escribir la plantilla Blade o el CSS de impresión, la IA DEBE determinar la orientación exacta (Landscape / Horizontal vs Portrait / Vertical) del modelo de referencia:

### 1. Detección por Relación de Aspecto (Aspect Ratio)
- **Horizontal (Landscape)**: `Ancho > Alto` (Ratio > 1.0, Ej. `297mm x 210mm`).
- **Vertical (Portrait)**: `Alto > Ancho` (Ratio < 1.0, Ej. `210mm x 297mm`).

### 2. Regla Inquebrantable de Orientación
- **PROHIBIDO Invertir o Confundir la Orientación**: Si el modelo de referencia es horizontal, está ESTRICTAMENTE PROHIBIDO generar un layout vertical o usar dimensiones `210mm` de ancho x `297mm` de alto.

### 3. Configuración CSS Obligatoria por Orientación

#### Para Diseños HORIZONTALES (A4 Landscape):
```css
@page {
    size: A4 landscape;
    margin: 0;
}
.pdf-page {
    width: 297mm;
    height: 210mm;
    box-sizing: border-box;
    page-break-after: always;
    overflow: hidden;
}
```

#### Para Diseños VERTICALES (A4 Portrait):
```css
@page {
    size: A4 portrait;
    margin: 0;
}
.pdf-page {
    width: 210mm;
    height: 297mm;
    box-sizing: border-box;
    page-break-after: always;
    overflow: hidden;
}
```

---

## Principio de Funcionamiento

1. **La imagen es una referencia visual, NO el PDF final**:
   - PROHIBIDO insertar la imagen de referencia como fondo completo o convertir textos en imágenes.
   - Reconstruir mediante Laravel Blade + HTML semántico + CSS de impresión + Tablas HTML + CSS Grid/Flex + Recursos SVG/PNG locales + Datos reales y dinámicos del backend.

2. **Flujo de Reconstrucción Visual Iterativa (Desarrollo)**:
   - Imagen de referencia → Inspección de orientación (Horizontal vs Vertical) → Análisis de regiones → Especificación estructural → Blade + HTML + CSS → Render HTML → Generar PDF con Chromium → Convertir PDF a PNG → Comparar visualmente (Playwright/ImageMagick/MuPDF) → Corregir diferencias → Repetir (Máximo 8 iteraciones).

3. **Ejecución Determinista en Producción (Runtime)**:
   - Datos de MySQL → Laravel → Blade → Browsershot/Chromium → PDF.
   - NO utilizar IA cada vez que se genere un documento en producción.

---

## Reglas Críticas

1. **Respetar estrictamente la orientación (Horizontal vs Vertical)** según la imagen de referencia.
2. **No usar la imagen completa como fondo**.
3. **No convertir los textos en imágenes**.
4. **No calcular importes dentro de Blade** (subtotal, base imponible, impuesto, descuento, total, balance deben venir calculados del backend).
5. **No confiar en totales enviados desde web o Android**.
6. **No inventar propiedades de modelos** (Invoice, InvoiceItem, Currency, BankAccount, etc.).
7. **No cambiar controladores, servicios o migraciones sin necesidad**.
8. **No eliminar funciones existentes**.
9. **No romper la generación actual de facturas**.
10. **No mezclar factura y presupuesto en una plantilla llena de condicionales** (mantener archivos independientes `invoice.blade.php` y `quotation.blade.php`).
11. **No truncar productos o servicios silenciosamente**.
12. **No usar CDN, Google Fonts ni recursos externos** (usar fuentes e iconos locales/SVG).
13. **No usar JavaScript para calcular posiciones** (usar CSS de impresión).
14. **No usar Tailwind CDN**.
15. **No instalar dependencias sin presentar primero un plan y solicitar una sola aprobación**.
16. **Antes de modificar archivos, crear respaldo o rama Git**.
17. **Devolver archivos completos, no fragmentos incompletos**.
18. **Mantener actualizado el archivo `PDF_AGENT_TASKLIST.md`**.
19. **No entrar en un bucle infinito**: Máximo 8 iteraciones visuales. Si durante 3 iteraciones consecutivas no mejora el resultado, detenerse y entregar reporte con las diferencias.
20. **No declarar el trabajo terminado sin generar y revisar los PDFs reales**.

---

## Zonas Prohibidas (No deben aparecer en las plantillas)

Aunque alguna imagen de referencia las contenga de forma accidental, **NO MOSTRAR**:
- Contactos del emisor debajo de los datos fiscales.
- Teléfono, email o sitio web del emisor dentro del card fiscal.
- Columna **Categoría** en las tablas de ítems.
- Métodos alternativos de pago: **Bizum, Tarjeta, Efectivo**. Mantener únicamente **Transferencia bancaria**.
- Footer comercial con teléfono, email, sitio web, dirección o NIF.
- Redes sociales.
- Bloque grande separado de estado "PAGADA" (el estado se muestra como texto simple dentro de Datos de la Factura).
- Marcas rojas, tachones, parches blancos o texto escrito a mano.

---

## Protocolo de Ejecución en 17 Fases

### FASE 0 — Auditoría del Entorno
Ejecutar y documentar en `docs\pdf-template\ENVIRONMENT_AUDIT.md`:
```powershell
php -v
composer --version
composer show
node -v
npm -v
npm list --depth=0
where chrome
where msedge
where node
where npm
where magick
where mutool
npx playwright --version
```
Leer completamente: `composer.json`, `package.json`, `.env.example`, `config\`, `app\Services\`, `app\Models\`, `app\Http\Controllers\`, `routes\`, `resources\views\pdf\`.
Si faltan dependencias, crear `docs\pdf-template\DEPENDENCY_PLAN.md` y **solicitar aprobación antes de instalar**.

### FASE 1 — Archivos de Control
Crear:
- `PDF_AGENT_TASKLIST.md`
- `docs\pdf-template\PDF_TEMPLATE_SPEC.md`
- `docs\pdf-template\VARIABLE_MAP.md`
- `docs\pdf-template\VISUAL_ANCHORS.md`
- `docs\pdf-template\DECISIONS.md`
- `docs\pdf-template\ERRORS.md`
- `docs\pdf-template\DEPENDENCY_PLAN.md`
- `docs\pdf-template\FINAL_REPORT.md`
- Carpetas: `docs\pdf-template\references\`, `renders\`, `diffs\`, `tests\pdf\fixtures\`, `visual\`, `tools\pdf-template-agent\`.

### FASE 2 — Referencias Visuales y Verificación de Orientación
Copiar o ubicar:
- `docs\pdf-template\references\invoice-target.png`
- `docs\pdf-template\references\quotation-target.png`

**Verificación Visual**:
1. Medir dimensiones en píxeles del archivo `target.png`.
2. Si `Ancho > Alto` → Confirmar **A4 Landscape (Horizontal: 297mm x 210mm)**.
3. Si `Alto > Ancho` → Confirmar **A4 Portrait (Vertical: 210mm x 297mm)**.

### FASE 3 — Mapa de Datos (`VARIABLE_MAP.md`)
Mapear cada campo visual con su propiedad del modelo backend. No inventar propiedades. Usar fallbacks visuales limpios sólo cuando aplique.

### FASE 4 — Especificación de Factura (`invoice.blade.php`)
- **Página 1**: Cabecera (Logo, 4 indicadores superiores: Intervenciones garantizadas, Técnicos cualificados, Repuestos originales, Atención 24/7, Título "FACTURA / INFORME DE INTERVENCIÓN TÉCNICA", Nº Factura, QR real si existe, indicador dinámico de página), Datos fiscales del emisor, Datos del cliente, Equipo de intervención, Datos de la factura, Tabla de actuaciones, Diagnóstico/Conclusiones, Resumen económico, Aceptación y Transferencia bancaria.
- **Página 2**: Condiciones en 2 filas de 5 bloques (Garantía legal, Exclusiones, Limitaciones, Daños ocultos, Equipos antiguos, Presupuestos, Protección de datos, Facturación y pago, Aceptación, Jurisdicción) y mensaje ecológico.

### FASE 5 — Especificación de Presupuesto (`quotation.blade.php`)
- **Página 1**: Cabecera "PRESUPUESTO", Datos fiscales, Cliente, Detalles del presupuesto, Resumen económico, Tabla de ítems, Alcance del servicio, Observaciones, Transferencia bancaria y Aceptación.
- **Página 2**: 10 bloques de condiciones del presupuesto y mensaje ecológico.

### FASE 6 — Componentes Compartidos
Partials reutilizables en `resources\views\pdf\partials\`:
- `logo-header.blade.php`, `issuer-card.blade.php`, `client-card.blade.php`, `bank-transfer.blade.php`, `eco-notice.blade.php`, `legal-grid.blade.php`.

### FASE 7 — CSS de Impresión
- Unidades `mm` para dimensiones de página (`297mm x 210mm` para Landscape).
- Tablas HTML para datos tabulares, CSS Grid para macros.
- Iconos SVG locales. `print-color-adjust: exact`.

### FASE 8 — Fixtures de Prueba
Crear fixtures representativas en `tests\pdf\fixtures\invoice.php` y `quotation.php` para casos de 1, 6 y 10 líneas, descripciones cortas/largas, monedas (EUR, USD, DOP), estados (pendiente, pagada, anulada).

### FASE 9 — Rutas de Preview Local
Crear rutas de prueba en desarrollo (protegidas): `/pdf-preview/invoice` y `/pdf-preview/quotation`.

### FASE 10 — Generación PDF con Browsershot / Chromium
Landscape / Portrait según orientación del modelo, print background, esperar carga de imágenes/fuentes locales, márgenes 0.

### FASE 11 & 12 — Rasterización y Comparación Visual
- Convertir PDF a PNG con `mutool` o `puppeteer/playwright`.
- Guardar capturas en `docs\pdf-template\renders\`.
- Producir diferencias visuales en `docs\pdf-template\diffs\`.

### FASE 13 — Bucle de Corrección Iterativo
- Máximo 8 iteraciones. Modificar únicamente los elementos con diferencias.
- Si en 3 iteraciones no hay mejora, detenerse y entregar reporte.

### FASE 14 — Paginación Dinámica
- Si hay más de 6-7 ítems, generar páginas de continuación manteniendo encabezados mínimos y colocando totales y legales al final.

### FASE 15, 16 & 17 — Pruebas Funcionales, QA y Entrega
- Ejecutar pruebas automatizadas.
- Entregar archivos completados, `PDF_AGENT_TASKLIST.md` y `FINAL_REPORT.md`.

---

## Pitfalls (Errores Comunes a Evitar)
- ❌ No confundir u omitir la orientación del documento (Horizontal vs Vertical).
- ❌ No usar la imagen de referencia como marca de agua o fondo.
- ❌ No inventar campos en modelos Laravel.
- ❌ No calcular importes ni impuestos dentro de plantillas Blade.
- ❌ No truncar contenido sin soporte de paginación.
- ❌ No usar CDN externos (Google Fonts, Tailwind CDN, etc.).
- ❌ No instalar librerías sin solicitar y recibir aprobación previa.
- ❌ No dar por terminado el trabajo sin renderizar y verificar los PDFs reales.

---

## Verificación Requerida
- Orientación de página coincidente con el modelo original.
- PDFs reales generados en `storage/`.
- PNGs rasterizados de cada página.
- Reportes diff de comparación.
- `PDF_AGENT_TASKLIST.md` y `FINAL_REPORT.md` completados.
