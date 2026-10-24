@echo off
cd /d D:\Github\HealthSphere\HealthSphere_AI
set PGPASSWORD=postgres
set PG_HOST=127.0.0.1
set PG_PORT=5432
set PG_USER=postgres
set PG_DATABASE=healthsphere
set STATIC_DIR=
node backend\server.js > backend\server-run.log 2>&1
