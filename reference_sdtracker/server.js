const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const BASE_DIR = __dirname;
const BACKEND_TARGET = process.env.BACKEND_URL || 'https://s2025pst.pst.co.id:44305';
const parsedBackend = url.parse(BACKEND_TARGET);

const MIME_TYPES = {
	'.html': 'text/html; charset=UTF-8',
	'.js': 'application/javascript; charset=UTF-8',
	'.json': 'application/json; charset=UTF-8',
	'.css': 'text/css; charset=UTF-8',
	'.xml': 'application/xml; charset=UTF-8',
	'.properties': 'text/plain; charset=UTF-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.map': 'application/json; charset=UTF-8',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf'
};

// Custom agent with SSL verification disabled for internal SAP server
const httpsAgent = new https.Agent({
	rejectUnauthorized: false,
	keepAlive: true
});

function proxyRequest(req, res) {
	const parsedReqUrl = url.parse(req.url);
	const targetPath = parsedReqUrl.path;

	const proxyHeaders = { ...req.headers };
	proxyHeaders.host = parsedBackend.host;
	proxyHeaders.origin = BACKEND_TARGET;
	proxyHeaders.referer = BACKEND_TARGET + '/';

	const options = {
		hostname: parsedBackend.hostname,
		port: parsedBackend.port || 443,
		path: targetPath,
		method: req.method,
		headers: proxyHeaders,
		agent: httpsAgent,
		timeout: 60000
	};

	console.log(`[PROXY] ${req.method} ${targetPath} -> ${BACKEND_TARGET}${targetPath}`);

	const proxyReq = https.request(options, (proxyRes) => {
		console.log(`[PROXY RESPONSE] ${proxyRes.statusCode} ${targetPath}`);

		// Clone and adjust headers
		const resHeaders = { ...proxyRes.headers };

		// Adjust set-cookie header if present (strip Secure / Domain so it works on localhost)
		if (resHeaders['set-cookie']) {
			if (Array.isArray(resHeaders['set-cookie'])) {
				resHeaders['set-cookie'] = resHeaders['set-cookie'].map(cookie =>
					cookie.replace(/;\s*Secure/gi, '').replace(/;\s*Domain=[^;]+/gi, '')
				);
			} else if (typeof resHeaders['set-cookie'] === 'string') {
				resHeaders['set-cookie'] = resHeaders['set-cookie']
					.replace(/;\s*Secure/gi, '')
					.replace(/;\s*Domain=[^;]+/gi, '');
			}
		}

		res.writeHead(proxyRes.statusCode, resHeaders);
		proxyRes.pipe(res);
	});

	proxyReq.on('error', (err) => {
		console.error(`[PROXY ERROR] ${err.message}`);
		res.writeHead(502, { 'Content-Type': 'text/plain; charset=UTF-8' });
		res.end(`Proxy Error: Could not reach backend ${BACKEND_TARGET}. Details: ${err.message}`);
	});

	proxyReq.on('timeout', () => {
		console.error(`[PROXY TIMEOUT] ${targetPath}`);
		proxyReq.destroy();
		res.writeHead(504, { 'Content-Type': 'text/plain; charset=UTF-8' });
		res.end(`Proxy Timeout: Backend ${BACKEND_TARGET} did not respond in time.`);
	});

	req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
	const parsedUrl = url.parse(req.url);
	let pathname = decodeURIComponent(parsedUrl.pathname);

	// Check if this is a backend request (/sap/*)
	if (pathname.startsWith('/sap/')) {
		proxyRequest(req, res);
		return;
	}

	// Enable CORS for static resources
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,sap-contextid,sap-cancel-on-close,authorization,x-csrf-token');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	if (pathname === '/' || pathname === '') {
		pathname = '/index.html';
	}

	let filePath = path.join(BASE_DIR, pathname);

	// Prevent directory traversal
	if (!filePath.startsWith(BASE_DIR)) {
		res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
		res.end('403 Forbidden');
		return;
	}

	fs.stat(filePath, (err, stats) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
			res.end('404 Not Found: ' + pathname);
			return;
		}

		if (stats.isDirectory()) {
			filePath = path.join(filePath, 'index.html');
		}

		const ext = path.extname(filePath).toLowerCase();
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		fs.readFile(filePath, (readErr, content) => {
			if (readErr) {
				res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
				res.end('500 Internal Server Error');
				return;
			}

			res.writeHead(200, {
				'Content-Type': contentType,
				'Cache-Control': 'no-cache, no-store, must-revalidate'
			});
			res.end(content);
		});
	});
});

server.listen(PORT, () => {
	console.log(`====================================================`);
	console.log(`SAPUI5 Local Server running at: http://localhost:${PORT}`);
	console.log(`Live Backend Proxy:            ${BACKEND_TARGET}`);
	console.log(`----------------------------------------------------`);
	console.log(`1. Live App (Connects to SAP):  http://localhost:${PORT}/index.html`);
	console.log(`2. Mock App (Offline / Mock):   http://localhost:${PORT}/test/mockServer.html`);
	console.log(`3. FLP Sandbox (Mock Mode):     http://localhost:${PORT}/test/flpSandboxMockServer.html`);
	console.log(`====================================================`);
});
