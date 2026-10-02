"""Browser integration against the existing HTML, not a substitute fixture page."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import json
import os

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'],
                                    executable_path=os.environ.get('BT_CHROMIUM_EXECUTABLE') or None)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/backtracking.html?limpio', wait_until='domcontentloaded', timeout=90000)
        page.locator('#bt-core-import').wait_for(timeout=90000)
        page.wait_for_function("typeof DAY !== 'undefined' && DAY && DAY.times && DAY.times.length > 0 && Object.keys(DAY.pol).length > 0", timeout=90000)
        assert not errors, errors
        before = page.locator('#lat').input_value()
        page.locator('#bt-core-import input[type=file]').set_input_files(str(ROOT/'tests/fixtures/bt-canonical-result.json'))
        page.locator('#bt-core-import table td').first.wait_for(timeout=30000)
        assert not page.locator('#polcard').is_visible()
        assert not page.locator('.wrap > .cols').is_visible()
        assert '-25.7°' in page.locator('#bt-core-import table').inner_text()
        assert 'fixture-M-A' in page.locator('#bt-core-import table').inner_text()
        assert page.locator('#lat').input_value() == before
        page.screenshot(path=str(ROOT/'bt-core-imported-view.png'), full_page=False)
        page.locator('#bt-core-import button').click()
        assert page.locator('#polcard').is_visible()
        assert page.locator('.wrap > .cols').is_visible()
        assert page.locator('#lat').input_value() == before
        assert not errors, errors
        page.screenshot(path=str(ROOT/'bt-core-view-browser.png'), full_page=False)
        print(json.dumps({'status':'PASSED','scope':'existing backtracking.html import/restore; protocol fixture only'}))
        browser.close()
finally:
    server.shutdown()
