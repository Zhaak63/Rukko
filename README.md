# Arena FPS — Discord Activity (2 à 5 joueurs)

Serveur autoritaire (Node + ws) + client Three.js. Une partie = un salon vocal (`instanceId`).
Règles : 10 kills ou 5 min, headshot = 50 dmg, corps = 25, 12 balles, rechargement 1,3 s, respawn 2 s.

## 1. Application Discord
1. https://discord.com/developers/applications → New Application
2. OAuth2 : copie **Client ID** et **Client Secret**
3. Activities → Settings : active **Enable Activities**
4. Activities → URL Mappings : `/` → l'hôte de ton tunnel/serveur (sans https://)

## 2. Installation
```
npm install
cp .env.example .env     # remplis ID + secret
```

## 3. Test local rapide (hors Discord)
```
npm run dev
```
Ouvre http://localhost:5173/?room=test dans 2 onglets.

## 4. Test dans Discord
```
npm run dev
cloudflared tunnel --url http://localhost:5173
```
Mets l'hôte `xxxx.trycloudflare.com` dans l'URL Mapping `/`, puis dans un salon vocal : icône fusée → ton activité.

## 5. Production
```
npm run build
npm start        # sert dist/ + WebSocket sur le port 3000
```
Héberge sur Render/Fly/Railway (variables d'env à renseigner) et mets son domaine dans l'URL Mapping.

Clavier : ZQSD (AZERTY) ou WASD, Espace = saut, clic = tir, R = recharger, Échap = souris.
