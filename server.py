from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
import json
import os

TARGET_BASE = 'https://fantasyfootballcalculator.com/api/v1/adp'

class CustomHandler(SimpleHTTPRequestHandler):
    # Ensure CORS headers on all responses
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, *')
        return super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/proxy/adp':
            # Example: /proxy/adp?scoring=ppr&teams=10&year=2025
            qs = parse_qs(parsed.query)
            scoring = (qs.get('scoring', ['ppr'])[0] or 'ppr').lower()
            scoring = 'standard' if scoring == 'standard' else 'ppr'
            teams = qs.get('teams', ['10'])[0]
            year = qs.get('year', [str(os.getenv('ADP_YEAR', '2025'))])[0]
            target = f"{TARGET_BASE}/{scoring}?teams={teams}&year={year}"
            try:
                req = Request(target, headers={'User-Agent': 'Mozilla/5.0'})
                with urlopen(req, timeout=10) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'proxy_failed', 'detail': str(e)}).encode('utf-8'))
            return

        # Fall back to static file serving
        return super().do_GET()

    def do_POST(self):
        if self.path == '/':
            content_length = int(self.headers.get('Content-Length', '0') or '0')
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                data = {}
            filename = data.get('filename', 'data.json')
            content = data.get('content', '')
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(content)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        else:
            super().do_POST()

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8000'))
    server = HTTPServer(('', port), CustomHandler)
    print(f'Server running on http://127.0.0.1:{port}')
    server.serve_forever()