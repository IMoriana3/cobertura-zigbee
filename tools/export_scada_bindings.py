"""Export a read-only view of canonical bindings for existing 2D/3D consumers.

Requires SolarGPTfull on PYTHONPATH. Identity is resolved by IdentityRegistry;
no UUIDs, geometry, telemetry or alternative plant model are created here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import subprocess
from zoneinfo import ZoneInfo


def sha256(raw):
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def build_projection(pkg, layout, template, config, *, at, layout_hash, publication):
    reg = pkg.registry
    if at.tzinfo is None:
        raise ValueError("at must include timezone")
    if str(config["plant"]["id"]) != pkg.plant_id:
        raise ValueError("configured plant differs from package")
    ZoneInfo(config["plant"]["timezone"])
    used = []

    def active(record):
        return (record.status in {"authoritative", "verified", "provisional"}
                and record.valid_from <= at
                and (record.valid_to is None or at < record.valid_to))

    def binding(kind, value, scope_type="plant", scope_id=None):
        scope_id = str(scope_id or pkg.plant_id)
        result = reg.resolve_binding(kind, str(value), scope_type=scope_type,
                                     scope_id=scope_id, at=at, critical=False)
        used.extend(b for b in reg.bindings if b.binding_type == kind
                    and b.value == str(value) and b.scope_type == scope_type
                    and b.scope_id == scope_id and b.asset_id == result and active(b))
        return result

    def relation(asset, kind):
        records = [r for r in reg.relations if r.source_asset_id == asset
                   and r.relation_type == kind and active(r)]
        if len(records) != 1:
            raise ValueError(f"ambiguous/missing {kind} for {asset}")
        used.extend(records)
        return records[0].target_asset_id

    def unique(rows, key):
        counts = Counter(key(r) for r in rows)
        if any(n != 1 for n in counts.values()):
            raise ValueError("duplicate explicit source locator")
        return {key(r): r for r in rows}

    sources = unique(template["tcus"], lambda t: t["tcu"])
    pairs = unique(template["cruce"]["pares"], lambda p: p["idDwg"])
    unique(layout["trackers"], lambda t: t["idPrevio"])
    scopes, rows = {}, []
    configured_ncus = {n["asset_id"] for n in config["ncus"]}
    for tracker in layout["trackers"]:
        geometry = tracker["idPrevio"]
        pair = pairs[geometry]
        source = sources[pair["tcu"]]
        # Check declarations in both sources; never recover by distance/order.
        if (source["ncu"] != tracker["ncu"] or pair["idLayout"] != tracker["id"]
                or source["slave"] != pair["slave"]):
            raise ValueError("layout/template locator conflict")
        gw = binding("network_pan", source["panId"])
        ncu = relation(gw, "member_of")
        if str(ncu) not in configured_ncus:
            raise ValueError("NCU not explicitly configured")
        tcu = binding("modbus_slave", source["slave"], "ncu", ncu)
        asset = binding("geometry_binding", geometry)
        if (relation(asset, "controlled_by") != tcu or relation(tcu, "member_of") != ncu
                or relation(tcu, "connected_via") != gw):
            raise ValueError("canonical topology conflicts with source")
        source_ncu = str(source["ncu"])
        if source_ncu in scopes and scopes[source_ncu] != str(ncu):
            raise ValueError("source NCU maps to multiple assets")
        scopes[source_ncu] = str(ncu)
        aliases = {a.namespace: a.value for a in reg.aliases
                   if a.asset_id == asset and active(a)}
        rows.append({"geometry_binding": geometry, "tracker_asset_id": str(asset),
                     "tcu_asset_id": str(tcu), "ncu_asset_id": str(ncu),
                     "source_ncu": source_ncu, "source_slave": str(source["slave"]),
                     "aliases": aliases})
    unique(rows, lambda r: r["tracker_asset_id"])
    # A projection has a bounded lifetime. An older/newer observation needs its
    # own registry revision, not today's bindings applied retroactively.
    end = [r.valid_to for r in used if r.valid_to is not None]
    metadata = pkg.consumer_metadata
    return {"schema_version": 1, "plant_id": pkg.plant_id,
            "plant_route": config["plant"]["layout_slug"],
            "source_plant": config["plant"]["name"],
            "plant_timezone": config["plant"]["timezone"],
            "registry_revision": reg.revision, "record_status": metadata["record_status"],
            "read_only": True, "operationally_usable": False,
            "valid_from": max(r.valid_from for r in used).isoformat(),
            "valid_to": min(end).isoformat() if end else None,
            "layout_sha256": layout_hash, "publication": publication,
            "source_ncus": scopes, "trackers": rows}


def main():
    import yaml
    from factiun_core.plant_package import load_package

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo-root", required=True)
    p.add_argument("--package", required=True)
    p.add_argument("--layout", required=True)
    p.add_argument("--template", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--at", required=True)
    p.add_argument("--output", required=True)
    gate = p.add_mutually_exclusive_group(required=True)
    gate.add_argument("--published-commit")
    gate.add_argument("--development", action="store_true")
    a = p.parse_args()
    root = Path(a.repo_root).resolve()
    package = Path(a.package).resolve()
    pub = {"published": False, "commit": None}
    if a.published_commit:
        # Publication is an input gate, not a caller-supplied boolean. Require
        # the exact package bytes in a commit already reachable from main.
        git = ["git", "-C", str(root)]
        subprocess.run(git + ["merge-base", "--is-ancestor", a.published_commit, "main"], check=True)
        rel = package.relative_to(root)
        for file in package.rglob("*"):
            if file.is_file():
                raw = subprocess.check_output(git + ["show", f"{a.published_commit}:{file.relative_to(root)}"])
                if raw != file.read_bytes():
                    raise ValueError(f"unpublished package bytes: {file.relative_to(package)}")
        pub = {"published": True, "commit": subprocess.check_output(
            git + ["rev-parse", a.published_commit], text=True).strip()}
    pkg = load_package(package, repo_root=root)
    raw = Path(a.layout).read_bytes()
    result = build_projection(pkg, json.loads(raw), json.loads(Path(a.template).read_text()),
                              yaml.safe_load(Path(a.config).read_text()),
                              at=datetime.fromisoformat(a.at), layout_hash=sha256(raw), publication=pub)
    result["source_hashes"] = {"template": sha256(Path(a.template).read_bytes()),
                               "config": sha256(Path(a.config).read_bytes())}
    Path(a.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
