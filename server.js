const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 1. Leer el archivo de configuración
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
    console.error("ERROR: No se encontró config.json");
    process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const PORT = config.puerto || 8000;
const HOST = '0.0.0.0';
const ITEMS_PER_PAGE = config.videos_por_pagina || 20;

// 2. Base de datos en memoria (Seguridad: oculta tus rutas reales)
let videosDB = [];

function escanearCarpetas() {
    videosDB = [];
    let idCounter = 1;
    
    config.carpetas_de_videos.forEach(carpeta => {
        if (fs.existsSync(carpeta)) {
            const archivos = fs.readdirSync(carpeta);
            archivos.forEach(archivo => {
                // Solo aceptamos archivos de video
                if (archivo.match(/\.(mp4|mkv|webm)$/i)) {
                    videosDB.push({
                        id: idCounter++,
                        nombre: archivo,
                        rutaAbsoluta: path.join(carpeta, archivo)
                    });
                }
            });
        }
    });
    console.log(`[OK] Se encontraron ${videosDB.length} videos listos para servir.`);
}

// Ejecutar escaneo al encender el servidor
escanearCarpetas();

// 3. Crear el servidor
http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // --- RUTA A: La página web principal ---
    if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        // Servimos un HTML mínimo y sin dependencias externas (100% offline)
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>FastMedia Local</title>
                <style>
                    body { background: #121212; color: #fff; font-family: sans-serif; padding: 20px; }
                    .video-card { background: #1e1e1e; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
                    video { width: 100%; max-width: 800px; background: #000; border-radius: 4px; margin-top: 10px; }
                    button { background: #008cba; color: white; border: none; padding: 10px 20px; font-size: 16px; cursor: pointer; border-radius: 5px;}
                </style>
            </head>
            <body>
                <h2>📺 FastMedia - Servidor Privado</h2>
                <div id="contenedor-videos"></div>
                <button id="btn-cargar" onclick="cargarMas()">Cargar más videos...</button>

                <script>
                    let paginaActual = 1;
                    const itemsPorPag = ${ITEMS_PER_PAGE};

                    async function cargarMas() {
                        const respuesta = await fetch('/api/videos?page=' + paginaActual);
                        const datos = await respuesta.json();
                        
                        if(datos.videos.length === 0) {
                            document.getElementById('btn-cargar').innerText = "No hay más videos";
                            document.getElementById('btn-cargar').disabled = true;
                            return;
                        }

                        const contenedor = document.getElementById('contenedor-videos');
                        datos.videos.forEach(v => {
                            const div = document.createElement('div');
                            div.className = 'video-card';
                            // preload='none' es MAGIA PURA: Evita que el Wi-Fi colapse descargando pedazos de todos los videos a la vez.
                            div.innerHTML = "<h3>" + v.nombre + "</h3>" +
                                            "<video controls preload='none'>" +
                                            "<source src='/stream?id=" + v.id + "' type='video/mp4'>" +
                                            "</video>";
                            contenedor.appendChild(div);
                        });
                        paginaActual++;
                    }

                    // Arrancar cargando los primeros 20
                    cargarMas();
                </script>
            </body>
            </html>
        `);
        return;
    }

    // --- RUTA B: API que devuelve la lista paginada (Sin revelar rutas) ---
    if (pathname === '/api/videos') {
        const pagina = parseInt(parsedUrl.query.page) || 1;
        const inicio = (pagina - 1) * ITEMS_PER_PAGE;
        const fin = inicio + ITEMS_PER_PAGE;
        
        const videosPaginados = videosDB.slice(inicio, fin);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            videos: videosPaginados.map(v => ({ id: v.id, nombre: v.nombre }))
        }));
        return;
    }

    // --- RUTA C: Motor de Streaming de alta velocidad ---
    if (pathname === '/stream') {
        const videoId = parseInt(parsedUrl.query.id);
        const videoObj = videosDB.find(v => v.id === videoId);

        if (!videoObj || !fs.existsSync(videoObj.rutaAbsoluta)) {
            res.writeHead(404);
            res.end('Video no encontrado');
            return;
        }

        const videoPath = videoObj.rutaAbsoluta;
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const CHUNK_SIZE = 10 ** 6; // 1MB chunks
            const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE, fileSize - 1);
            const contentLength = (end - start) + 1;
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': contentLength,
                'Content-Type': 'video/mp4',
            });

            fs.createReadStream(videoPath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(videoPath).pipe(res);
        }
        return;
    }

    // Si entra a otra ruta
    res.writeHead(404);
    res.end();

}).listen(PORT, HOST, () => {
    console.log(`[+] FastMedia corriendo velozmente en http://${HOST}:${PORT}`);
    console.log(`[+] Configurado para mostrar ${ITEMS_PER_PAGE} videos por página.`);
});
