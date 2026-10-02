"""Idempotent exact-base insertion into the EXISTING backtracking.html.

No template copy, alternative simulator, optimizer or real plant data is added.
The hash guard prevents applying this integration to a different HTML revision.
"""
from hashlib import sha1
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'backtracking.html'
EXPECTED_BLOB = '4c2b6146f0f38cfe34b664c522ad93bd3dacc49d'
SCRIPT = '<script src="bt-canonical-results.js"></script>'


def apply(source: bytes) -> bytes:
    if SCRIPT.encode() in source:
        if source.count(SCRIPT.encode()) != 1:
            raise ValueError('duplicate canonical result consumer')
        return source
    actual = sha1(b'blob ' + str(len(source)).encode() + b'\0' + source).hexdigest()
    if actual != EXPECTED_BLOB:
        raise ValueError(f'HTML changed; expected {EXPECTED_BLOB}, got {actual}')
    suffix = b'\n</body>\n</html>'
    if not source.rstrip().endswith(suffix) or b'id="polcard"' not in source:
        raise ValueError('expected existing simulator structure not found')
    # Report templates inside scripts also contain </body>; only the last
    # document suffix is patched, after checking the full immutable base.
    at = source.rfind(suffix)
    return source[:at] + b'\n' + SCRIPT.encode() + source[at:]


if __name__ == '__main__':
    old = HTML.read_bytes()
    new = apply(old)
    HTML.write_bytes(new)
    print('APPLIED' if old != new else 'ALREADY_APPLIED')
