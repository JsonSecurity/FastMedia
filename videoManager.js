const fs = require('fs');
const path = require('path');

function cargarConfiguracion() {
    const configPath = path.join(__dirname, 'config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// Convierte la ruta de red (ej. "0/Accion/Pelicula.mp4") a tu ruta local real sin revelarla
function resolverRuta(config, rutaVirtual) {
    if (!rutaVirtual) return null;
    
    const partes = rutaVirtual.split('/');
    const rootIndex = parseInt(partes[0], 10);
    
    if (isNaN(rootIndex) || rootIndex >= config.carpetas_de_videos.length) return null;
    
    const rootPath = path.resolve(config.carpetas_de_videos[rootIndex]);
    const subPath = partes.slice(1).join('/');
    const rutaFinal = path.resolve(rootPath, subPath);
    
    // Filtro de seguridad: Evita que alguien intente retroceder carpetas (Path Traversal)
    if (!rutaFinal.startsWith(rootPath)) return null;
    return rutaFinal;
}

function explorarDirectorio(config, rutaVirtual, pagina, itemsPorPag) {
    let items = [];

    // Si estamos en la raíz principal, mostrar las carpetas del config.json
    if (!rutaVirtual) {
        config.carpetas_de_videos.forEach((carpeta, index) => {
            const nombre = path.basename(carpeta) || carpeta;
            items.push({ tipo: 'carpeta', nombre: nombre, rutaVirtual: index.toString() });
        });
        return items;
    }

    const rutaReal = resolverRuta(config, rutaVirtual);
    if (!rutaReal || !fs.existsSync(rutaReal)) return [];

    const archivos = fs.readdirSync(rutaReal);
    
    archivos.forEach(archivo => {
        const rutaCompleta = path.join(rutaReal, archivo);
        try {
            const stat = fs.statSync(rutaCompleta);
            if (stat.isDirectory()) {
                items.push({
                    tipo: 'carpeta',
                    nombre: archivo,
                    rutaVirtual: rutaVirtual + '/' + archivo,
                    fecha: stat.mtimeMs
                });
            } else if (archivo.match(/\.(mp4|mkv|webm)$/i)) {
                items.push({
                    tipo: 'video',
                    nombre: archivo,
                    rutaVirtual: rutaVirtual + '/' + archivo,
                    fecha: stat.mtimeMs
                });
            }
        } catch (e) { /* Ignorar si hay un archivo protegido por permisos del sistema */ }
    });

    // Ordenar: Carpetas primero, luego videos ordenados del más nuevo al más viejo
    items.sort((a, b) => {
        if (a.tipo === 'carpeta' && b.tipo === 'video') return -1;
        if (a.tipo === 'video' && b.tipo === 'carpeta') return 1;
        if (a.fecha && b.fecha) return b.fecha - a.fecha;
        return 0;
    });

    const inicio = (pagina - 1) * itemsPorPag;
    const fin = inicio + itemsPorPag;
    return items.slice(inicio, fin);
}

function hacerStreaming(config, rutaVirtual, req, res) {
    const videoPath = resolverRuta(config, rutaVirtual);

    if (!videoPath || !fs.existsSync(videoPath)) {
        res.writeHead(404);
        res.end('No encontrado');
        return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        
        // ¡CERO LIMITACIONES! Enviamos desde donde pide la tablet hasta el final del archivo.
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Protección extra: Si la tablet pide un rango inválido, le avisamos correctamente.
        if (start >= fileSize || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            return res.end();
        }

        const contentLength = (end - start) + 1;
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength,
            'Content-Type': 'video/mp4',
            'Connection': 'keep-alive' // Esto le ruega a la tablet que no cierre la conexión
        });
        
        // Sin highWaterMark: dejamos que Node.js use sus fragmentos ágiles de 64kb nativos.
        const stream = fs.createReadStream(videoPath, { start, end });
        stream.pipe(res);

        // LA BALA DE PLATA: Si la tablet cancela porque "adelantaste" el video,
        // matamos el proceso de lectura inmediatamente para que Termux no se asfixie.
        req.on('close', () => {
            if (!stream.destroyed) {
                stream.destroy();
            }
        });

    } else {
        res.writeHead(200, { 
            'Content-Length': fileSize, 
            'Content-Type': 'video/mp4',
            'Connection': 'keep-alive'
        });
        const stream = fs.createReadStream(videoPath);
        stream.pipe(res);

        req.on('close', () => {
            if (!stream.destroyed) {
                stream.destroy();
            }
        });
    }
}

module.exports = { cargarConfiguracion, explorarDirectorio, hacerStreaming };
