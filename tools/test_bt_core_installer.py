"""One-line insertion, including the real HTML's embedded report closing tag."""
from install_bt_core_results import apply, HTML, SCRIPT
source=HTML.read_bytes()
if SCRIPT.encode() in source:
    source=source.replace(SCRIPT.encode()+b'\n',b'',1)
assert source.count(b'</body>')==2, 'fixture must retain embedded report HTML'
updated=apply(source)
assert updated.count(SCRIPT.encode())==1
assert updated.replace(SCRIPT.encode()+b'\n',b'',1)==source
assert apply(updated)==updated
for bad in (source+b' ',updated.replace(SCRIPT.encode(),SCRIPT.encode()*2)):
    try:apply(bad)
    except ValueError:pass
    else:raise AssertionError('negative control survived')
print('installer: 5 checks passed on the real HTML')
