#!/usr/bin/env python3
"""Lê a saída do 'gcloud firebase test android run', baixa logcat/resultados do bucket e monta o relatório.
Não inventa nada: só o que veio do Test Lab."""
import json, os, re, subprocess, sys
saida, tag, run = sys.argv[1], sys.argv[2], sys.argv[3]
txt = open(saida, errors='ignore').read()
m = re.search(r'storage/browser/([^/\s\]]+)/([^\s\]]+?)/?\]', txt)
os.makedirs('reais', exist_ok=True)
print(f'# K1 LAB — celulares REAIS (Firebase Test Lab)\n\n- APK: **{tag}**\n- Execução: https://github.com/kauanalvesmansano-hub/k1-seguranca/actions/runs/{run}')
link = re.search(r'(https://console\.firebase\.google\.com/project/[^\s\]]+)', txt)
if link: print(f'- Resultados no Firebase (vídeo, telas visitadas): {link.group(1)}')
# tabela de resultado do gcloud (JSON no fim da saída)
j = re.search(r'(\[\s*\{.*\}\s*\])\s*$', txt, re.S)
linhas = []
if j:
    try:
        for r in json.loads(j.group(1)):
            linhas.append((r.get('axis_value', '?'), r.get('outcome', '?'), r.get('test_details', '')))
    except Exception: pass
if not linhas:
    print('\n**O Test Lab não devolveu resultado.** Últimas linhas da saída:\n```\n' + '\n'.join(txt.strip().splitlines()[-25:]) + '\n```')
    sys.exit(0)
print('\n| Celular real | Resultado | Detalhe |\n|---|---|---|')
for a, o, d in linhas: print(f'| {a} | {o} | {d} |')
if not m: sys.exit(0)
bucket, pasta = m.group(1), m.group(2)
subprocess.run(['gsutil', '-q', '-m', 'cp', '-r', f'gs://{bucket}/{pasta}/*', 'reais/'], check=False,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
# só fica o que é texto e útil
for raiz, _, arqs in os.walk('reais'):
    for a in arqs:
        p = os.path.join(raiz, a)
        if not (a == 'logcat' or a.endswith('.xml') or a.endswith('.txt') or a.endswith('.json')) or os.path.getsize(p) > 3_000_000:
            os.remove(p)
print('\n## O que o log de cada celular mostrou')
for raiz, _, arqs in os.walk('reais'):
    if 'logcat' not in arqs: continue
    log = open(os.path.join(raiz, 'logcat'), errors='ignore').read().splitlines()
    k1 = [l for l in log if 'com.k1.seguranca' in l or 'ReactNativeJS' in l or 'K1' in l]
    fatais = [l for l in log if 'FATAL EXCEPTION' in l or ('ANR in' in l and 'k1' in l)]
    erros_js = [l for l in log if 'ReactNativeJS' in l and (' E ' in l or 'Error' in l)]
    nome = os.path.relpath(raiz, 'reais')
    print(f'\n### {nome}\n- linhas do K1 no log: {len(k1)} · fechamentos (crash/ANR): **{len(fatais)}** · erros de JavaScript: **{len(erros_js)}**')
    for l in (fatais + erros_js)[:15]: print(f'  - `{l.strip()[:220]}`')
