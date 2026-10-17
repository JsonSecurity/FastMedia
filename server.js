const http = require('http');
const fs = require('fs');
const path = require('path');
const videoManager = require('./videoManager');

const config = videoManager.cargarConfiguracion();
const PORT = config.puerto || 8000;
const HOST = '0.0.0.0';
const ITEMS_PER_PAGE = config.videos_por_pagina || 20;

http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/') {
        const htmlPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(htmlPath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Error: Falta crear la carpeta "public" y el archivo "index.html"');
        }
        return;
    }

    if (pathname === '/api/explorar') {
        const ruta = parsedUrl.searchParams.get('dir') || "";
        const pagina = parseInt(parsedUrl.searchParams.get('page')) || 1;
        const items = videoManager.explorarDirectorio(config, ruta, pagina, ITEMS_PER_PAGE);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items }));
        return;
    }

    if (pathname === '/stream') {
        const rutaVirtual = parsedUrl.searchParams.get('video');
        videoManager.hacerStreaming(config, rutaVirtual, req, res);
        return;
    }

    res.writeHead(404);
    res.end();

}).listen(PORT, HOST, () => {
    console.log(`[+] FastMedia Gallery en ejecución: http://${HOST}:${PORT}`);
});
