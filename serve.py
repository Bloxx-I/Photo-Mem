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
import ipaddress
import shutil
import ssl
import subprocess
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


def self_signed_cert(cert_dir):
    """Create (once) a self-signed certificate for this machine's names and IPs."""
    cert = os.path.join(cert_dir, 'photo-mem.crt')
    key = os.path.join(cert_dir, 'photo-mem.key')
    names = sorted({'localhost', socket.gethostname(), socket.gethostname().split('.')[0] + '.local'})
    ips = sorted(set(lan_addresses()) | {'127.0.0.1'})
    san = ','.join([f'DNS:{n}' for n in names] + [f'IP:{ip}' for ip in ips])
    stamp = os.path.join(cert_dir, 'san.txt')
    if os.path.exists(cert) and os.path.exists(stamp) and open(stamp).read() == san:
        return cert, key
    if not shutil.which('openssl'):
        return None, None
    os.makedirs(cert_dir, exist_ok=True)
    try:
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
                        '-keyout', key, '-out', cert, '-subj', '/CN=Photo-Mem', '-addext', f'subjectAltName={san}'],
                       check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError):
        return None, None
    os.chmod(key, 0o600)
    with open(stamp, 'w') as f:
        f.write(san)
    return cert, key


class Server(ThreadingHTTPServer):
    """Speaks HTTPS and HTTP on the same port. Plain HTTP from other devices is
    redirected to HTTPS, because browsers only allow the microphone there."""
    ssl_ctx = None

    def finish_request(self, request, client_address):
        if self.ssl_ctx:
            try:
                request.settimeout(10)
                first = request.recv(1, socket.MSG_PEEK)
            except OSError:
                return
            if first == b'\x16':  # TLS handshake
                try:
                    request = self.ssl_ctx.wrap_socket(request, server_side=True)
                except (ssl.SSLError, OSError):
                    return  # e.g. the browser rejected the certificate
            elif not ipaddress.ip_address(client_address[0]).is_loopback:
                return self.redirect_to_https(request)
            request.settimeout(None)
        self.RequestHandlerClass(request, client_address, self)

    def redirect_to_https(self, request):
        f = request.makefile('rb')
        line = f.readline(8192).decode('latin-1').split()
        host = ''
        while True:
            h = f.readline(8192)
            if h in (b'\r\n', b'\n', b''):
                break
            k, _, v = h.decode('latin-1').partition(':')
            if k.strip().lower() == 'host':
                host = v.strip()
        path = line[1] if len(line) > 1 else '/'
        if not host:
            host = f'{socket.gethostname()}:{self.server_address[1]}'
        body = f'Bitte https://{host}{path} verwenden.'.encode()
        request.sendall(
            f'HTTP/1.1 301 Moved Permanently\r\nLocation: https://{host}{path}\r\n'
            f'Content-Length: {len(body)}\r\nConnection: close\r\n\r\n'.encode() + body)


class Handler(SimpleHTTPRequestHandler):
    upstream = {}
    tls = False

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
            return self.send_json({**{name: bool(base) for name, base in self.upstream.items()}, 'tls': self.tls})
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
    ap.add_argument('--cert', default=os.environ.get('PHOTO_MEM_TLS_CERT', ''), help='own certificate (e.g. tailscale cert)')
    ap.add_argument('--key', default=os.environ.get('PHOTO_MEM_TLS_KEY', ''))
    ap.add_argument('--tls', default=os.environ.get('PHOTO_MEM_TLS') or 'auto',
                    help="'auto' (default): self-signed HTTPS when reachable from the network; 'off'")
    ap.add_argument('--cert-dir', default=os.environ.get('PHOTO_MEM_CERT_DIR') or os.path.join(here, '..', 'tls'))
    ap.add_argument('--dir', default=here)
    args = ap.parse_args()

    llm = detect_llm() if args.llm == 'auto' else '' if args.llm == 'off' else args.llm
    whisper = detect_whisper() if args.whisper == 'auto' else '' if args.whisper == 'off' else args.whisper
    Handler.upstream = {'llm': llm, 'whisper': whisper}
    server = Server((args.bind, args.port), partial(Handler, directory=args.dir))
    lan = args.bind in ('0.0.0.0', '::')
    cert, key, self_signed = args.cert, args.key, False
    if not (cert and key) and lan and args.tls != 'off':
        cert, key = self_signed_cert(os.path.abspath(args.cert_dir))
        self_signed = bool(cert)
    scheme = 'http'
    if cert and key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        server.ssl_ctx = ctx
        Handler.tls = True
        scheme = 'https'

    def say(msg=''):
        print(msg, file=sys.stderr, flush=True)

    say(f'Photo-Mem läuft:  http://localhost:{args.port}/')
    if lan:
        say('Auf Handy/PC im selben Netz öffnen:')
        for ip in lan_addresses():
            say(f'  {scheme}://{ip}:{args.port}/')
        say(f'  {scheme}://{socket.gethostname().split(".")[0]}.local:{args.port}/   (Name statt IP, klappt meist auch)')
        if self_signed:
            say('Beim ersten Öffnen warnt der Browser vor dem Zertifikat (selbst erstellt) –')
            say('einmal bestätigen ("Erweitert" → "Weiter" / "Website besuchen"). Danach geht das Mikrofon.')
        elif scheme == 'http':
            say('Hinweis: ohne HTTPS (openssl fehlt) erlauben Browser kein Mikrofon.')
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
