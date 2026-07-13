# Transport Luis & Katherine · Servidor compartido

Control financiero para la empresa de transporte de carga. Todos los usuarios
(desde cualquier celular o computadora) ven y modifican **la misma información**,
igual que tu portal de FarmaValue.

## Qué incluye

- **server.js** — Servidor Node.js + Express con base de datos SQLite.
- **public/index.html** — La aplicación (misma interfaz de siempre), conectada al servidor.
- **package.json** — Dependencias.

## Cómo publicarlo en Render (igual que tu otro proyecto)

1. **Sube esta carpeta a un repositorio de GitHub** (sin la carpeta `node_modules`).
   - En github.com → New repository → por ejemplo `transport-lk` → sube los archivos
     `server.js`, `package.json`, la carpeta `public/` y el `.gitignore`.

2. **En Render** (render.com):
   - New → **Web Service** → conecta tu repositorio `transport-lk`.
   - Runtime: **Node**.
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: la que prefieras (Free funciona para empezar).
   - Create Web Service.

3. En 2–3 minutos tendrás tu dirección, por ejemplo:
   `https://transport-lk.onrender.com`
   Compártela con tus empleados: cada uno la abre en su celular, y con
   "Agregar a pantalla de inicio" les queda como una app.

4. **Primera vez**: al abrir la dirección, la app te pedirá crear la cuenta de
   **administrador** (tu nombre, tu correo y un PIN de 4 dígitos). Después, en
   Más → Panel del administrador → Agregar usuario, creas las cuentas de tu equipo.

## ⚠️ Importante: persistencia de los datos en Render

- En el **plan Free**, Render apaga el servicio tras 15 minutos sin uso (tarda
  ~1 minuto en despertar en la siguiente visita) y **el disco se borra en cada
  despliegue o reinicio del servicio**. Es decir: los datos pueden perderse.
- Dos formas de resolverlo:
  1. **Disco persistente de Render** (requiere plan de pago, desde ~US$7/mes):
     en tu servicio → Disks → Add Disk → Mount Path: `/data`.
     Luego en Environment agrega la variable `DATA_DIR` = `/data`.
     Con eso la base de datos vive en el disco y sobrevive despliegues y reinicios.
  2. **Plan Free + disciplina de respaldos**: usa el botón
     "Respaldar base de datos (JSON)" con frecuencia (incluye facturas adjuntas,
     documentos y usuarios) y restaura con "Restaurar respaldo" si el servicio
     se reinicia. Funciona, pero dependes de acordarte.

  Mi recomendación para datos de la empresa: la opción 1.

## Probar en tu computadora (opcional)

```bash
npm install
node server.js
# abre http://localhost:3000
```

## Seguridad

- Los PIN se guardan **cifrados** (scrypt con sal) — ni siquiera el administrador puede verlos.
- Cada sesión usa un token propio que expira a los 30 días sin uso.
- Solo el administrador puede: crear/eliminar usuarios, borrar todos los datos,
  restaurar respaldos, eliminar documentos y ver el panel de sesiones/accesos.
- Los PIN de 4 dígitos son cómodos pero cortos: no compartas la dirección
  públicamente y elimina de inmediato a los usuarios que dejen de trabajar contigo.

## Novedad con el servidor

La sección **"En línea ahora"** del panel del administrador ya funciona de verdad
entre dispositivos distintos: verás a cada empleado conectado desde su propio
celular, junto con el registro de quién entró y cuándo.
