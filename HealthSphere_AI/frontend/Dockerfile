# HealthSphere AI frontend — static SPA served by nginx, /api proxied to backend
FROM nginx:1.27-alpine

# Site root = this folder (index.html, css/, js/, sw.js)
COPY index.html sw.js /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
