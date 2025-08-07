from http.server import SimpleHTTPRequestHandler, HTTPServer
import json
import os

class CustomHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            filename = data.get('filename', 'data.json')
            content = data.get('content', '')
            with open(filename, 'w') as f:
                f.write(content)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
        else:
            super().do_POST()

if __name__ == '__main__':
    port = 8000
    server = HTTPServer(('', port), CustomHandler)
    print(f'Server running on port {port}')
    server.serve_forever()