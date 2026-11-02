#!/bin/bash
# ─────────────────────────────────────────────────────────────
# ComercialOS — Script de instalación en VPS (Ubuntu 22.04)
# Ejecutar como root o con sudo
# ─────────────────────────────────────────────────────────────

set -e  # Parar si hay error

# ── Tu clave fija para activar/administrar el Catálogo digital en CUALQUIER
#    cliente. La ponés una sola vez acá, y cada instalación nueva ya la usa
#    sola — no hace falta tocar el .env a mano en cada cliente.
CLAVE_CATALOGO_AXSOFT="poné-aca-tu-clave-y-no-la-cambies-mas"

# ── Copias de seguridad automáticas a TU Google Drive (ver GUIA-BACKUPS-DRIVE.txt) ──
#    CLAVE_MAESTRA_BACKUPS: la misma para todos tus clientes. Guardala en un lugar seguro:
#      con ella se recalcula la clave de cualquier cliente si se pierde un servidor.
#      NO queda guardada en el servidor del cliente (solo la clave derivada de ese cliente).
#    NOMBRE_CLIENTE: sin espacios, único por cliente (ej: ferreteria-lopez). Es su carpeta en Drive.
#    GOOGLE_CLIENT_ID / SECRET: la credencial que creás una sola vez en Google Cloud.
CLAVE_MAESTRA_BACKUPS=""
NOMBRE_CLIENTE=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

echo ""
echo "🚀  Instalando ComercialOS en la VPS..."
echo ""

# ── 1. Actualizar sistema ──────────────────────────────────────
echo "📦  Actualizando sistema..."
apt update && apt upgrade -y

# ── 2. Instalar dependencias de compilación (necesarias para better-sqlite3) ──
echo "🔧  Instalando dependencias de compilación..."
apt install -y build-essential python3 curl git

# ── 3. Instalar Node.js 20 LTS ────────────────────────────────
echo "🟢  Instalando Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "   Node: $(node -v)  |  npm: $(npm -v)"

# ── 4. Instalar PM2 (gestor de procesos) ──────────────────────
echo "⚙️   Instalando PM2..."
npm install -g pm2

# ── 5. Instalar dependencias del proyecto ─────────────────────
echo "📥  Instalando dependencias del proyecto..."
cd /var/www/comercialos/backend   # ← ajustar ruta si cambia
npm install

# ── 6. Configurar .env ────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  # Generar SESSION_SECRET automáticamente
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  sed -i "s/cambia-esto-por-un-string-largo-y-aleatorio/$SECRET/" .env
  # Completar tu clave fija del catálogo (la misma en todos los clientes)
  sed -i "s/^VIDRIERA_ADMIN_KEY=.*/VIDRIERA_ADMIN_KEY=$CLAVE_CATALOGO_AXSOFT/" .env
  # Copias automáticas a Google Drive: se completan solo si cargaste los datos arriba
  if [ -n "$CLAVE_MAESTRA_BACKUPS" ] && [ -n "$NOMBRE_CLIENTE" ]; then
    CLAVE_BACKUP=$(node tools/clave-backup.js "$CLAVE_MAESTRA_BACKUPS" "$NOMBRE_CLIENTE")
    sed -i "s/^BACKUP_CLIENT_NAME=.*/BACKUP_CLIENT_NAME=$NOMBRE_CLIENTE/" .env
    sed -i "s/^BACKUP_ENCRYPTION_KEY=.*/BACKUP_ENCRYPTION_KEY=$CLAVE_BACKUP/" .env
    sed -i "s/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID/" .env
    sed -i "s/^GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET/" .env
    echo "✅  Copias a Google Drive configuradas para: $NOMBRE_CLIENTE (falta conectar la cuenta en Ajustes)"
  else
    echo "ℹ️   Copias a Drive sin configurar (CLAVE_MAESTRA_BACKUPS / NOMBRE_CLIENTE vacíos). Las copias locales funcionan igual."
  fi
  echo "✅  .env creado con SESSION_SECRET aleatorio y tu clave de catálogo"
  echo "⚠️   Revisá y completá el archivo .env antes de continuar"
else
  echo "ℹ️   .env ya existe, no se sobreescribe"
fi

# ── 7. Arrancar con PM2 ───────────────────────────────────────
echo "🚀  Arrancando app con PM2..."
pm2 start src/app.js --name "comercialos" --env production
pm2 save
pm2 startup  # Habilitar inicio automático con el sistema

echo ""
echo "✅  Instalación completa!"
echo ""
echo "📋  Próximos pasos:"
echo "   1. Revisá y completá el archivo .env"
echo "   2. Subí los certificados AFIP por SFTP a la carpeta certs/"
echo "   3. Configurá Nginx como proxy al puerto 3000"
echo "   4. Habilitá SSL con: certbot --nginx -d tudominio.com"
echo ""
