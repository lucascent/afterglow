#!/usr/bin/env python3
"""Rebuild in an explicitly supplied disposable directory; never install global packages."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
URL = 'https://registry.npmjs.org/three/-/three-0.186.1.tgz'
INTEGRITY = 'sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA=='
OWNERSHIP = {'tool': 'afterglow-three-vendor-build', 'format': 1, 'source_integrity': INTEGRITY}


def owned_stage(requested):
    """Claim a new/empty stage, or reopen this tool's marked stage only."""
    if not requested.is_absolute() or requested.is_symlink():
        raise ValueError('Stage must be an absolute, nonsymlink disposable directory')
    stage = requested.resolve()
    if stage == ROOT or ROOT in stage.parents or stage in ROOT.parents:
        raise ValueError('Stage must be outside this repository and its ancestors')
    marker = stage / '.afterglow-three-build.json'
    if stage.exists():
        if not stage.is_dir() or marker.is_symlink():
            raise ValueError('Invalid stage or ownership marker')
        if marker.exists():
            if json.loads(marker.read_text()) != OWNERSHIP:
                raise ValueError('Stage belongs to another tool or source version')
        elif any(stage.iterdir()):
            raise ValueError('Refusing a nonempty stage without this tool ownership marker')
    else:
        stage.mkdir(parents=True)
    for name in ['build-source', 'build-tools', 'output', 'npm-cache', 'three-0.186.1.tgz', 'upstream.tar.gz', 'upstream-tests']:
        if (stage / name).is_symlink():
            raise ValueError(f'Refusing symlink in owned stage: {name}')
    if not marker.exists():
        marker.write_text(json.dumps(OWNERSHIP, sort_keys=True) + '\n')
    return stage


def run(command, cwd):
    print('+', ' '.join(map(str, command)), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True, type=Path)
    parser.add_argument('--install', action='store_true', help='Copy verified generated pair into vendor/three')
    args = parser.parse_args()
    try:
        stage = owned_stage(args.stage)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    archive = stage / 'three-0.186.1.tgz'
    if not archive.exists():
        with urllib.request.urlopen(URL, timeout=60) as response:
            archive.write_bytes(response.read())
    data = archive.read_bytes()
    actual = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if actual != INTEGRITY:
        raise RuntimeError('Official source archive integrity mismatch')
    source = stage / 'build-source'
    if source.exists():
        shutil.rmtree(source)
    source.mkdir()
    with tarfile.open(fileobj=io.BytesIO(data)) as compressed:
        compressed.extractall(source, filter='data')
    source = source / 'package'
    run(['patch', '--batch', '--fuzz=0', '-p1', '-i', str(HERE / 'security.patch')], source)
    runtime = stage / 'build-tools'
    runtime.mkdir(exist_ok=True)
    for name in ['package.json', 'package-lock.json', 'rollup.mjs']:
        if (runtime / name).is_symlink():
            raise ValueError(f'Refusing build tool file symlink: {name}')
        shutil.copyfile(HERE / name, runtime / name)
    run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', str(stage / 'npm-cache')], runtime)
    output = stage / 'output'
    if output.exists():
        shutil.rmtree(output)
    run(['node', str(runtime / 'rollup.mjs'), str(source), str(output)], runtime)
    digest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir())}
    print(json.dumps({'upstream': URL, 'integrity': actual, 'output_sha256': digest}, indent=2), flush=True)
    if args.install:
        expected = json.loads((HERE / 'manifest.json').read_text())['output_sha256']
        if digest != expected:
            raise RuntimeError('Output differs from reviewed manifest; inspect before installing')
        for name in digest:
            shutil.copyfile(output / name, ROOT / 'vendor/three' / name)


if __name__ == '__main__':
    main()
