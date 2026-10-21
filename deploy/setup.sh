#!/usr/bin/env bash
# Installation sur Ubuntu : Node 20, build, service systemd (démarre au boot).
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Crée d'abord le fichier .env (voir .env.example)"; exit 1; }
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -; sudo apt-get install -y nodejs; }
npm install
npm run build
sudo tee /etc/systemd/system/discord-fps.service >/dev/null <<EOF
[Unit]
Description=Discord FPS
After=network.target

[Service]
WorkingDirectory=$(pwd)
ExecStart=$(command -v node) server/index.js
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now discord-fps
echo "OK : service lancé sur le port 3000 (journalctl -u discord-fps -f pour les logs)"
