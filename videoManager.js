const fs = require('fs');
const path = require('path');

let videosDB = [];

function cargarConfiguracion() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error("Error: No se encontró config.json");
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function escanearVideos(config) {
    videosDB = [];
    let idCounter = 1;
    
    config.carpetas_de_videos.forEach(carpeta => {
        if (fs.existsSync(carpeta)) {
            const archivos = fs.readdirSync(carpeta);
            archivos.forEach(archivo => {
                if (archivo.match(/\.(mp4|mkv|webm)$/i)) {
                    const rutaAbsoluta = path.join(carpeta, archivo);
                    const stat = fs.statSync(rutaAbsoluta);
                    videosDB.push({
                        id: idCounter++,
                        nombre: archivo,
                        rutaAbsoluta: rutaAbsoluta,
                        fecha: stat.mtimeMs // Guardamos la fecha para ordenar
                    });
                }
            });
        }
    });

    // Ordenar de más reciente a más antiguo
    videosDB.sort((a, b) => b.fecha - a.fecha);
    console.log(`Listo: ${videosDB.length} videos indexados y ordenados por fecha.`);
}

function obtenerPagina(pagina, itemsPorPagina) {
    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const videosPaginados = videosDB.slice(inicio, fin);
    
    return videosPaginados.map(v => ({ id: v.id, nombre: v.nombre }));
}

function hacerStreaming(videoId, req, res) {
    const videoObj = videosDB.find(v => v.id === videoId);

    if (!videoObj || !fs.existsSync(videoObj.rutaAbsoluta)) {
        res.writeHead(404);
        res.end('No encontrado');
        return;
    }

    const videoPath = videoObj.rutaAbsoluta;
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const CHUNK_SIZE = 10 ** 6; // 1MB
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
}

module.exports = {
    cargarConfiguracion,
    escanearVideos,
    obtenerPagina,
    hacerStreaming
};
