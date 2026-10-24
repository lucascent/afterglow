#!/usr/bin/env python3
"""Exercise actual WebGL shadow rendering in disposable Chrome processes.

Use a Python with Playwright installed. No screenshots or visual
acceptance: assertions cover prototype integrity, rendering and disposal only.
"""
from __future__ import annotations

import argparse
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading

SCRIPT = r"""async ({moduleURL, uuid, lightType}) => {
  const T = await import(moduleURL);
  const watched = [Object.prototype, Object, Object.prototype.toString];
  const snapshots = watched.map(o => Object.getOwnPropertyDescriptors(o));
  const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64;
  document.body.appendChild(canvas);
  const renderer = new T.WebGLRenderer({canvas, antialias:false});
  renderer.setSize(64,64); renderer.shadowMap.enabled=true;
  const gl=renderer.getContext();
  const scene=new T.Scene(); const camera=new T.PerspectiveCamera(45,1,0.1,30); camera.position.z=5;
  const material=new T.MaterialLoader().parse({type:'MeshBasicMaterial',uuid,alphaToCoverage:true,color:0xffffff});
  const mesh=new T.Mesh(new T.BoxGeometry(), material); mesh.castShadow=true; scene.add(mesh);
  const light=lightType==='point' ? new T.PointLight(0xffffff,1) : new T.DirectionalLight(0xffffff,1);
  light.position.set(2,3,4); light.castShadow=true; light.shadow.mapSize.set(32,32); scene.add(light);
  let renderError=null;
  try { renderer.render(scene,camera); } catch(e) { renderError=String(e); }
  const changed=[];
  watched.forEach((object,index)=>{
    const before=snapshots[index], after=Object.getOwnPropertyDescriptors(object);
    for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      const a=before[key], b=after[key];
      if(!a || !b || a.value!==b.value || a.get!==b.get || a.set!==b.set || a.writable!==b.writable || a.configurable!==b.configurable || a.enumerable!==b.enumerable) changed.push(`${index}:${key}`);
    }
  });
  let disposeError=null; let disposeCount=0;
  // Shadow clones must be disposed exactly once, including after a repeated pass.
  const originalDispose=T.Material.prototype.dispose;
  T.Material.prototype.dispose=function(){disposeCount++;return originalDispose.call(this);};
  try { if(!renderError) renderer.render(scene,camera); material.dispose(); } catch(e) { disposeError=String(e); }
  T.Material.prototype.dispose=originalDispose;
  const result={uuid,lightType,changed,renderError,disposeError,disposeCount,webgl:gl.getParameter(gl.VERSION)};
  try { renderer.dispose(); } catch {}
  return result;
}"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


async def child(args):
    from playwright.async_api import async_playwright
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(args.root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(channel='chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            page = await browser.new_page()
            await page.goto(origin, wait_until='domcontentloaded')
            result = await page.evaluate(SCRIPT, {'moduleURL': origin + '/' + args.library.relative_to(args.root).as_posix(), 'uuid': args.uuid, 'lightType': args.light})
            await browser.close()
            print(json.dumps(result))
    finally:
        server.shutdown(); server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--library', required=True, type=Path)
    parser.add_argument('--expect', choices=['baseline', 'fixed'], default='fixed')
    parser.add_argument('--child', action='store_true')
    parser.add_argument('--uuid')
    parser.add_argument('--light')
    args = parser.parse_args()
    args.root = args.root.resolve(); args.library = args.library.resolve()
    if args.child:
        asyncio.run(child(args)); return
    results = []
    for light in ['directional', 'point']:
        for uuid in ['__proto__', 'constructor', 'toString', 'ordinary-material']:
            command = [sys.executable, str(Path(__file__).resolve()), '--root', str(args.root), '--library', str(args.library), '--child', '--uuid', uuid, '--light', light]
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                stdout, stderr = process.communicate(timeout=20)
                if process.returncode:
                    result = {'uuid': uuid, 'lightType': light, 'harnessError': stderr[-2000:], 'matched': False}
                else:
                    result = json.loads(stdout)
                    if args.expect == 'baseline' and uuid != 'ordinary-material':
                        result['matched'] = bool(result['changed'])
                    else:
                        result['matched'] = not result['changed'] and not result['renderError'] and not result['disposeError'] and result['disposeCount'] == 2
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL); process.communicate()
                result = {'uuid': uuid, 'lightType': light, 'timeout': True, 'matched': False}
            results.append(result)
    print(json.dumps({'expectation': args.expect, 'results': results, 'passed': all(r['matched'] for r in results)}, indent=2))
    raise SystemExit(0 if all(r['matched'] for r in results) else 1)


if __name__ == '__main__':
    main()
