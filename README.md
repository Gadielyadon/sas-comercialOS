# ComercialOS

Sistema de gestión comercial con soporte para facturación electrónica AFIP/ARCA.

---

## 🚀 Deploy en VPS

### Requisitos
- VPS con Ubuntu 22.04 LTS
- Mínimo 1 GB RAM
- Dominio apuntando a la IP de la VPS

### Pasos

```bash
# 1. Clonar el repo en la VPS
git clone git@github.com:TU_USUARIO/sass-comercial.git /var/www/comercialos
cd /var/www/comercialos

# 2. Ejecutar script de instalación
chmod +x install.sh
sudo bash install.sh

# 3. Configurar Nginx
sudo cp nginx.conf.example /etc/nginx/sites-available/comercialos
# Editar y poner el dominio real:
sudo nano /etc/nginx/sites-available/comercialos
sudo ln -s /etc/nginx/sites-available/comercialos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. Habilitar SSL gratuito
sudo certbot --nginx -d tudominio.com
```

---

## 🔐 Certificados AFIP

**NUNCA se suben al repositorio.** Se transfieren a la VPS por SFTP:

```bash
# Desde tu PC local:
sftp usuario@ip-vps
put cert-cliente.crt /var/www/comercialos/backend/certs/
put private-cliente.key /var/www/comercialos/backend/certs/
```

Luego se configuran las rutas desde **Ajustes → AFIP** dentro del sistema.

---

## ⚙️ Variables de entorno (.env)

Crear `/var/www/comercialos/backend/.env` basándose en `.env.example`:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<string-largo-y-aleatorio>
```

Generar SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 🔄 Comandos útiles PM2

```bash
pm2 status                    # Ver estado
pm2 logs comercialos          # Ver logs en tiempo real
pm2 restart comercialos       # Reiniciar app
pm2 stop comercialos          # Detener app
```

---

## 👤 Acceso inicial

- **Usuario:** `admin`
- **Contraseña:** `admin123`

⚠️ Cambiar la contraseña inmediatamente después del primer login.

---

## 📦 Stack técnico

- **Runtime:** Node.js 20 LTS
- **Framework:** Express 4
- **Base de datos:** SQLite (better-sqlite3)
- **Vistas:** EJS
- **Proceso:** PM2
- **Proxy:** Nginx + SSL Let's Encrypt
- **AFIP:** soap + node-forge
