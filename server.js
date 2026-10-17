const http = require('http');
const fs = require('fs');
const path = require('path');
const videoManager = require('./videoManager');

const config = videoManager.cargarConfiguracion();
const PORT = config.puerto || 8000;
const HOST = '0.0.0.0';
const ITEMS_PER_PAGE = config.videos_por_pagina || 20;

videoManager.escanearVideos(config);

http.createServer((req, res) => {
    // Solución al warning: usando la nueva API URL estándar
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/') {
        const htmlPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(htmlPath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Falta el archivo public/index.html');
        }
        return;
    }

    if (pathname === '/api/videos') {
        const pagina = parseInt(parsedUrl.searchParams.get('page')) || 1;
        const videos = videoManager.obtenerPagina(pagina, ITEMS_PER_PAGE);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ videos }));
        return;
    }

    if (pathname === '/stream') {
        const videoId = parseInt(parsedUrl.searchParams.get('id'));
        videoManager.hacerStreaming(videoId, req, res);
        return;
    }

    res.writeHead(404);
    res.end();

}).listen(PORT, HOST, () => {
    console.log(`Servidor activo en http://${HOST}:${PORT}`);
});
