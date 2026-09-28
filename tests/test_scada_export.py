"""Run against real canonical inputs (no reimplementation of IdentityRegistry).

PYTHONPATH=<SolarGPTfull> python tests/test_scada_export.py --registry <registry>
    --config <scada/config/plants.yml> --output <development fixture.json>
"""
import argparse
from copy import deepcopy
from datetime import datetime
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import yaml


def main():
    from factiun_core.identity import IdentityRegistry
    p = argparse.ArgumentParser()
    p.add_argument('--registry', required=True)
    p.add_argument('--config', required=True)
    p.add_argument('--output', required=True)
    a = p.parse_args()
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location('export_scada_bindings', root/'tools/export_scada_bindings.py')
    exporter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exporter)
    registry = IdentityRegistry.deserialize(Path(a.registry).read_text())
    pkg = SimpleNamespace(registry=registry,plant_id=registry.plant_id,
                          consumer_metadata={'record_status':'provisional'})
    raw = (root/'elburgo_layout.json').read_bytes()
    layout = json.loads(raw)
    template = json.loads((root/'elburgo_tcu.json').read_text())
    config = yaml.safe_load(Path(a.config).read_text())
    kwargs = dict(at=datetime.fromisoformat('2026-09-24T12:00:00+02:00'),
                  layout_hash=exporter.sha256(raw),publication={'published':False,'commit':None})
    def build(l=layout,t=template,c=config,**extra):
        return exporter.build_projection(pkg,l,t,c,**(kwargs|extra))
    result = build()
    assert len(result['trackers']) == len(layout['trackers']) == 215
    assert len({r['tracker_asset_id'] for r in result['trackers']}) == 215
    assert result['read_only'] and not result['operationally_usable']
    assert not result['publication']['published']
    assert not any(r['source_ncu']=='2' and r['source_slave']=='108' for r in result['trackers'])
    assert next(r for r in result['trackers'] if r['source_ncu']=='1' and r['source_slave']=='108')['geometry_binding']=='1.18.7'
    def rejects(call):
        try:call()
        except (ValueError,KeyError):return
        raise AssertionError('invalid input was accepted')
    bad=deepcopy(layout);bad['trackers'][0]['idPrevio']=bad['trackers'][1]['idPrevio']
    rejects(lambda:build(l=bad))
    bad_config=deepcopy(config);bad_config['plant']['id']='other'
    rejects(lambda:build(c=bad_config))
    bad_source=deepcopy(template);bad_source['tcus'][0]['ncu']=2
    rejects(lambda:build(t=bad_source))
    rejects(lambda:build(at=datetime.fromisoformat('2026-09-22T00:00:00+02:00')))
    # Reordering every input list must not alter the binding result.
    shuffled=deepcopy(layout);shuffled['trackers'].reverse()
    other=deepcopy(template);other['tcus'].reverse();other['cruce']['pares'].reverse()
    canon=lambda x: sorted(x['trackers'],key=lambda r:r['tracker_asset_id'])
    assert canon(build(l=shuffled,t=other))==canon(result)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Canonical exporter: 215 bindings, source scope, duplicate rejection, time validity and ordering passed')


if __name__=='__main__':
    main()
