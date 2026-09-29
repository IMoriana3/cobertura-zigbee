"""Browser integration against the existing HTML, not a substitute fixture page."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import json

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.goto(f'http://127.0.0.1:{server.server_port}/backtracking.html?limpio', wait_until='domcontentloaded', timeout=90000)
        page.locator('#bt-core-import').wait_for(timeout=90000)
        before = page.locator('#lat').input_value()
        page.locator('#bt-core-import input[type=file]').set_input_files(str(ROOT/'tests/fixtures/bt-canonical-result.json'))
        page.locator('#bt-core-import table td').first.wait_for(timeout=30000)
        assert page.locator('#polcard').evaluate('(e)=>e.hidden') is True
        assert '-25.7°' in page.locator('#bt-core-import table').inner_text()
        assert 'fixture-M-A' in page.locator('#bt-core-import table').inner_text()
        assert page.locator('#lat').input_value() == before
        page.locator('#bt-core-import button').click()
        assert page.locator('#polcard').evaluate('(e)=>e.hidden') is False
        assert page.locator('#lat').input_value() == before
        print(json.dumps({'status':'PASSED','scope':'existing backtracking.html import/restore; protocol fixture only'}))
        browser.close()
finally:
    server.shutdown()
