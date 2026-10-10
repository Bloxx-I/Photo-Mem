#!/usr/bin/env python3
"""Photo-Mem server.

Serves the app and forwards /api/llm/* and /api/whisper/* to your AI servers,
so the browser only talks to one origin – no CORS or mixed-content problems.

    python3 serve.py --bind 0.0.0.0              # finds LLM + Whisper on this machine
    python3 serve.py --llm http://localhost:11434 --whisper http://localhost:8000

Only the Python standard library is needed. On start it prints the addresses
under which phones and PCs in your network can open the app. With --cert/--key it serves HTTPS,
which phones need for microphone access (e.g. certificates from `tailscale cert`).
"""
import argparse
import json
import os
import re
import socket
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


LLM_PORTS = [11434, 8080, 1234, 8000, 5000, 8001]
WHISPER_PORTS = [8000, 9000, 8080, 8081, 8001, 8002, 10300]
WHISPER_RE = re.compile(r'whisper|distil', re.I)


def get(url, timeout=1.5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.read().decode('utf-8', 'replace')
    except Exception:
        return None


def get_json(url):
    text = get(url)
    try:
        return json.loads(text) if text else None
    except ValueError:
        return None


def model_ids(base):
    j = get_json(base + '/v1/models')
    if isinstance(j, dict) and isinstance(j.get('data'), list):
        return [str(m.get('id', '')) for m in j['data']]
    j = get_json(base + '/api/tags')  # Ollama native
    if isinstance(j, dict) and isinstance(j.get('models'), list):
        return [str(m.get('name', '')) for m in j['models']]
    return None


def detect_llm():
    for port in LLM_PORTS:
        base = f'http://127.0.0.1:{port}'
        ids = model_ids(base) or []
        if any(not WHISPER_RE.search(i) and 'embed' not in i.lower() for i in ids):
            return base
    return ''


def detect_whisper():
    for port in WHISPER_PORTS:
        base = f'http://127.0.0.1:{port}'
        if any(WHISPER_RE.search(i) for i in model_ids(base) or []):
            return base
        spec = get_json(base + '/openapi.json')
        if isinstance(spec, dict) and ({'/asr', '/v1/audio/transcriptions'} & set(spec.get('paths', {}))):
            return base
        page = get(base + '/')
        if page and 'whisper' in page.lower():
            return base
    return ''


def lan_addresses():
    """IPv4 addresses other devices can use to reach this machine."""
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))  # no packet is sent; just picks the outgoing interface
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.'))


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
    ap.add_argument('--llm', default=os.environ.get('PHOTO_MEM_LLM_URL') or 'auto',
                    help="e.g. http://localhost:11434, 'auto' (default) or 'off'")
    ap.add_argument('--whisper', default=os.environ.get('PHOTO_MEM_WHISPER_URL') or 'auto',
                    help="e.g. http://localhost:8000, 'auto' (default) or 'off'")
    ap.add_argument('--cert', default=os.environ.get('PHOTO_MEM_TLS_CERT', ''))
    ap.add_argument('--key', default=os.environ.get('PHOTO_MEM_TLS_KEY', ''))
    ap.add_argument('--dir', default=here)
    args = ap.parse_args()

    llm = detect_llm() if args.llm == 'auto' else '' if args.llm == 'off' else args.llm
    whisper = detect_whisper() if args.whisper == 'auto' else '' if args.whisper == 'off' else args.whisper
    Handler.upstream = {'llm': llm, 'whisper': whisper}
    server = ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=args.dir))
    scheme = 'http'
    if args.cert and args.key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(args.cert, args.key)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        scheme = 'https'

    def say(msg=''):
        print(msg, file=sys.stderr, flush=True)

    say(f'Photo-Mem läuft:  {scheme}://localhost:{args.port}/')
    if args.bind in ('0.0.0.0', '::'):
        say('Auf Handy/PC im selben Netz öffnen:')
        for ip in lan_addresses():
            say(f'  {scheme}://{ip}:{args.port}/')
        say(f'  {scheme}://{socket.gethostname().split(".")[0]}.local:{args.port}/   (Name statt IP, klappt meist auch)')
    else:
        say('Nur auf diesem Gerät erreichbar. Fürs Handy: photo-mem lan')
    say(f'LLM:     {llm or "nicht gefunden"}')
    say(f'Whisper: {whisper or "nicht gefunden"}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
