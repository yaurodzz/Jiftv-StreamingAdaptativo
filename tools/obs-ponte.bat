@echo off
rem Ponte do OBS para o servidor do JIFTv, por HTTPS. Funciona de qualquer rede (4G, Wi-Fi de fora, rede da escola).
rem Rode no computador do OBS e deixe esta janela aberta durante a transmissao.
rem No OBS: Servico "Personalizado", Servidor rtmp://localhost:1935/live e a chave copiada do painel.
rem Precisa do cloudflared:  winget install --id Cloudflare.cloudflared
rem No proprio servidor (onde o Docker roda) esta ponte nao e necessaria: o OBS ja alcanca rtmp://localhost:1935/live.
rem Detalhes: docs/obs-pela-internet.md
setlocal
if "%JIFTV_PONTE%"=="" set "JIFTV_PONTE=https://api.jiftv.org/api/rtmp"
if "%JIFTV_PORTA%"=="" set "JIFTV_PORTA=1935"

where cloudflared >nul 2>nul
if errorlevel 1 (
    echo O cloudflared nao esta instalado. Abra o PowerShell e rode:
    echo     winget install --id Cloudflare.cloudflared
    echo Depois feche e abra este arquivo de novo.
    pause
    exit /b 1
)

echo Ponte do JIFTv aberta. No OBS use o servidor:  rtmp://localhost:%JIFTV_PORTA%/live
echo Deixe esta janela aberta. Para encerrar, feche a janela ou aperte Ctrl+C.
echo.
cloudflared access tcp --hostname %JIFTV_PONTE% --url 127.0.0.1:%JIFTV_PORTA%
echo.
echo A ponte parou. Se a porta %JIFTV_PORTA% estiver em uso, feche o outro programa ou rode: set JIFTV_PORTA=1936
pause
