#!/usr/bin/env python3
"""Escolhe celulares FÍSICOS do Test Lab: fabricantes diferentes, Android 10+ (o K1 pede API 24+), o mais novo de cada."""
import json, sys
modelos = json.load(open(sys.argv[1])); n = max(1, min(2, int(sys.argv[2])))
cands = []
for m in modelos:
    apis = sorted(int(v) for v in m.get('supportedVersionIds', []) if str(v).isdigit())
    if not apis or apis[-1] < 29: continue
    cands.append((m.get('manufacturer', ''), apis[-1], m['id'], m.get('name', '')))
cands.sort(key=lambda c: (-c[1], c[0]))
escolhidos, fabs = [], set()
for fab, api, mid, nome in cands:
    if fab in fabs: continue
    escolhidos.append((mid, api)); fabs.add(fab)
    if len(escolhidos) == n: break
for mid, api in escolhidos:
    print(f"--device model={mid},version={api},locale=pt_BR,orientation=portrait")
