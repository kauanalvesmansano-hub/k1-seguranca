#!/usr/bin/env python3
"""Junta os resultados de todos os celulares num relatório (markdown). Não inventa nada: só lê os arquivos."""
import glob, json, os, sys, xml.etree.ElementTree as ET
from datetime import datetime, timezone

raiz, tag, modo, run = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
linhas, total, falhas, crashes = [], 0, 0, 0
porteste = {}
cel = []
for d in sorted(glob.glob(os.path.join(raiz, '*', '*'))):
    if not os.path.isdir(d): continue
    nome = os.path.basename(d)
    ler = lambda f: open(os.path.join(d, f), errors='ignore').read().strip() if os.path.exists(os.path.join(d, f)) else ''
    andro = ler('android.txt'); tela = ler('tela.txt').replace('\n', ' · ')
    fatal = ler('fatal.txt'); probs = [l for l in ler('problemas-log.txt').splitlines() if l]
    vaz = [l for l in ler('vazamento-log.txt').splitlines() if l]
    casos = []
    for x in glob.glob(os.path.join(d, 'junit-*.xml')):
        try:
            for tc in ET.parse(x).getroot().iter('testcase'):
                f = tc.find('failure'); e = tc.find('error')
                ok = f is None and e is None
                msg = '' if ok else ((f if f is not None else e).get('message') or (f if f is not None else e).text or '')[:220]
                casos.append((tc.get('name'), ok, msg.replace('\n', ' ').replace('|', '/')))
        except Exception as ex:
            casos.append((os.path.basename(x), False, f'junit ilegível: {ex}'))
    # suíte que não gerou resultado (arquivo de teste com erro, travou, etc.) conta como falha — nunca some do relatório
    for linha in ler('suites.txt').splitlines():
        nome_s = linha.split()[1] if len(linha.split()) > 1 else '?'
        if not os.path.exists(os.path.join(d, f'junit-{nome_s}.xml')):
            casos.append((f'suíte {nome_s} (sem resultado)', False, ler(f'maestro-{nome_s}.txt')[-200:].replace('\n', ' ').replace('|', '/')))
    t = len(casos); fl = sum(1 for c in casos if not c[1])
    fatais = [p for p in probs if 'FATAL EXCEPTION' in p or 'ANR in' in p]
    total += t; falhas += fl; crashes += len(fatais)
    cel.append((nome, andro, tela, t, fl, len(fatais), len(probs), len(vaz), fatal))
    for n, ok, msg in casos:
        porteste.setdefault(n, []).append((nome, ok, msg))

agora = datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')
print(f'# K1 LAB — relatório\n\n- Quando: {agora}\n- APK testado: **{tag}**\n- Modo: {modo}\n- Execução: https://github.com/kauanalvesmansano-hub/k1-seguranca/actions/runs/{run}\n')
print(f'**Celulares usados: {len(cel)} · testes: {total} · passaram: {total - falhas} · falharam: {falhas} · crashes: {crashes}**\n')
print('| Celular | Android | Tela | Testes | Falhas | Crashes | Erros no log | Vazamento no log |\n|---|---|---|---|---|---|---|---|')
for n, a, te, t, fl, cr, pr, vz, fa in cel:
    print(f'| {n} | {a or "?"} | {te or "?"} | {t} | {fl} | {cr} | {pr} | {vz} |' + (f' **{fa}**' if fa else ''))
print('\n## Por teste\n\n| Teste | Resultado por celular |\n|---|---|')
for n in sorted(porteste):
    r = ' · '.join(f'{c}: {"✅" if ok else "❌ " + m}' for c, ok, m in porteste[n])
    print(f'| {n} | {r} |')
json.dump({'tag': tag, 'modo': modo, 'run': run, 'celulares': len(cel), 'testes': total, 'falhas': falhas, 'crashes': crashes},
          open('resumo.json', 'w'))
