#!/bin/bash
# ─────────────────────────────────────────────────────────────
# ComercialOS — Script de instalación en VPS (Ubuntu 22.04)
# Ejecutar como root o con sudo
# ─────────────────────────────────────────────────────────────

set -e  # Parar si hay error

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
  echo "✅  .env creado con SESSION_SECRET aleatorio"
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
