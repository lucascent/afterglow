#!/usr/bin/env python3
"""Prepare the pinned upstream test files only, under the supplied build stage."""
from pathlib import Path
import argparse
import hashlib
import shutil
import subprocess
import tarfile
import urllib.request
import sys
sys.dont_write_bytecode = True
from build import owned_stage

HERE = Path(__file__).resolve().parent
COMMIT = '9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8'
ARCHIVE_SHA256 = '399c6b6e335a8ad266c27583bbda1e21ee2bff532917635a6cc931749c37fcdf'

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage', required=True, type=Path)
args = parser.parse_args()
try:
    stage = owned_stage(args.stage)
except (ValueError, OSError) as error:
    parser.error(str(error))
source = stage / 'build-source/package/src'
if not source.is_dir():
    parser.error('Run build.py first')
archive = stage / 'upstream.tar.gz'
if not archive.exists():
    with urllib.request.urlopen(f'https://codeload.github.com/mrdoob/three.js/tar.gz/{COMMIT}', timeout=90) as response:
        with archive.open('wb') as target:
            shutil.copyfileobj(response, target)
with archive.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
if digest != ARCHIVE_SHA256:
    raise RuntimeError('Pinned upstream test archive digest mismatch')
target = stage / 'upstream-tests'
if target.exists():
    shutil.rmtree(target)
target.mkdir()
prefix = f'three.js-{COMMIT}/test/'
with tarfile.open(archive) as compressed:
    for member in compressed:
        if member.name.startswith(prefix):
            member.name = member.name.split('/', 1)[1]
            compressed.extract(member, target, filter='data')
shutil.copytree(source, target / 'src')
(target / 'package.json').write_text('{"type":"module"}\n')
subprocess.run(['patch', '--batch', '--fuzz=0', '-p1', '-i', str(HERE / 'upstream-fixtures.patch')], cwd=target, check=True)
print(target)
