@echo off
echo ====================================
echo  FORJANDO MILIONARIOS - Instalador  
echo ====================================
echo.

echo Verificando Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    echo Baixe em: https://nodejs.org
    pause
    exit /b 1
)

echo Node.js encontrado!
echo Instalando dependencias...
npm install

echo.
echo ====================================
echo  INSTALACAO CONCLUIDA!              
echo ====================================
echo Para iniciar: npm start
echo.
pause