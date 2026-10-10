#!/usr/bin/env python3
"""Photo-Mem server.

Serves the app and forwards /api/llm/* and /api/whisper/* to your AI servers,
so the browser only talks to one origin – no CORS or mixed-content problems.

    python3 serve.py --bind 0.0.0.0 --llm http://localhost:11434 --whisper http://localhost:8000

Only the Python standard library is needed. With --cert/--key it serves HTTPS,
which phones need for microphone access (e.g. certificates from `tailscale cert`).
"""
import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOP_HEADERS = {
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers',
    'transfer-encoding', 'upgrade', 'host', 'content-length', 'accept-encoding', 'origin', 'referer',
}


class Handler(SimpleHTTPRequestHandler):
    upstream = {}

    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def target(self):
        for name, base in self.upstream.items():
            prefix = f'/api/{name}'
            if base and (self.path == prefix or self.path.startswith(prefix + '/') or self.path.startswith(prefix + '?')):
                return base.rstrip('/') + self.path[len(prefix):]
        return None

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/status':
            return self.send_json({name: bool(base) for name, base in self.upstream.items()})
        if self.path.startswith('/api/'):
            return self.proxy()
        return super().do_GET()

    def do_POST(self):
        return self.proxy()

    def proxy(self):
        url = self.target()
        if not url:
            return self.send_json({'error': 'Nicht konfiguriert'}, 404)
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
        try:
            resp = urllib.request.urlopen(req, timeout=600)
        except urllib.error.HTTPError as err:
            resp = err
        except Exception as err:  # connection refused, DNS, timeout …
            return self.send_json({'error': f'Upstream nicht erreichbar: {err}'}, 502)
        data = resp.read()
        self.send_response(resp.code)
        for k, v in resp.headers.items():
            if k.lower() not in HOP_HEADERS and k.lower() != 'cache-control':
                self.send_header(k, v)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description='Photo-Mem server with AI proxy')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PHOTO_MEM_PORT', 8765)))
    ap.add_argument('--bind', default=os.environ.get('PHOTO_MEM_BIND', '127.0.0.1'),
                    help='0.0.0.0 to reach it from other devices (default: 127.0.0.1)')
    ap.add_argument('--llm', default=os.environ.get('PHOTO_MEM_LLM_URL', ''), help='e.g. http://localhost:11434')
    ap.add_argument('--whisper', default=os.environ.get('PHOTO_MEM_WHISPER_URL', ''), help='e.g. http://localhost:8000')
    ap.add_argument('--cert', default=os.environ.get('PHOTO_MEM_TLS_CERT', ''))
    ap.add_argument('--key', default=os.environ.get('PHOTO_MEM_TLS_KEY', ''))
    ap.add_argument('--dir', default=here)
    args = ap.parse_args()

    Handler.upstream = {'llm': args.llm, 'whisper': args.whisper}
    server = ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=args.dir))
    scheme = 'http'
    if args.cert and args.key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(args.cert, args.key)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        scheme = 'https'

    host = 'localhost' if args.bind in ('127.0.0.1', '0.0.0.0') else args.bind
    print(f'Photo-Mem: {scheme}://{host}:{args.port}/', file=sys.stderr)
    print(f'  LLM:     {args.llm or "-"}', file=sys.stderr)
    print(f'  Whisper: {args.whisper or "-"}', file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
