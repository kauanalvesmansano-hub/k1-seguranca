#!/usr/bin/env python3
"""Antes de publicar o histórico: troca por *** qualquer valor dos segredos (senha/PIN do LAB) que apareça nos arquivos."""
import os, pathlib, sys
segredos = [v for v in (os.environ.get('S1'), os.environ.get('S2')) if v and len(v) >= 4]
for raiz in sys.argv[1:]:
    p = pathlib.Path(raiz)
    for f in ([p] if p.is_file() else p.rglob('*')):
        if f.is_file() and f.suffix in ('.txt', '.md', '.json', '.xml'):
            t = f.read_text(errors='ignore'); n = t
            for s in segredos: n = n.replace(s, '***')
            if n != t: f.write_text(n)
