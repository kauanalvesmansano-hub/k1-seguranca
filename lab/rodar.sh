#!/usr/bin/env bash
# Roda dentro do Android virtual: instala o K1, executa os testes, junta logs, crashes e prints.
# uso: rodar.sh <nome-do-celular> <api> "<suites>"   (suite "so:07-nova-senha" = só um teste)
set -u
NOME="$1"; API="$2"; SUITES="$3"
APP=com.k1.seguranca
OUT="$PWD/saida/$NOME"; mkdir -p "$OUT"
echo "{\"celular\":\"$NOME\",\"api\":$API}" > "$OUT/celular.json"
adb shell getprop ro.build.version.release > "$OUT/android.txt" 2>/dev/null
adb shell wm size > "$OUT/tela.txt" 2>/dev/null; adb shell wm density >> "$OUT/tela.txt" 2>/dev/null

# 1) instala (tenta de novo desinstalando se falhar)
inst() { timeout 240 adb install -r -g K1-Seguranca.apk 2>&1 | tail -2; }
r=$(inst); echo "$r" > "$OUT/instalacao.txt"
if ! echo "$r" | grep -q Success; then adb uninstall $APP >/dev/null 2>&1; r=$(inst); echo "2a tentativa: $r" >> "$OUT/instalacao.txt"; fi
if ! echo "$r" | grep -q Success; then echo "INSTALACAO_FALHOU" > "$OUT/fatal.txt"; exit 0; fi
adb shell dumpsys package $APP | grep -E "versionName|versionCode" | head -2 > "$OUT/versao.txt"
adb shell dumpsys package $APP | sed -n '/requested permissions:/,/install permissions:/p' > "$OUT/permissoes.txt"

# 2) logs do sistema durante todos os testes
adb logcat -c; adb logcat -v time > "$OUT/logcat.txt" 2>&1 & LOGPID=$!

# 2b) abre o app uma vez e guarda a primeira tela (print + textos da tela)
adb shell monkey -p $APP -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 25
adb exec-out screencap -p > "$OUT/00-primeira-tela.png" 2>/dev/null
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/00-primeira-tela.xml" >/dev/null 2>&1
grep -oE 'text="[^"]+"' "$OUT/00-primeira-tela.xml" 2>/dev/null | head -40
adb shell am force-stop $APP

# 3) testes
for s in $SUITES; do
  if [[ "$s" == so:* ]]; then alvo=$(ls lab/flows/*/"${s#so:}"*.yaml | head -1); s=unico; else alvo="lab/flows/$s"; fi
  [ -n "$alvo" ] || continue
  timeout 1500 maestro test "$alvo" --format junit --output "$OUT/junit-$s.xml" --test-output-dir "$OUT/maestro-$s" --debug-output "$OUT/debug-$s" > "$OUT/maestro-$s.txt" 2>&1
  maestro hierarchy --compact > "$OUT/tela-final-$s.json" 2>/dev/null || true
  echo "suite $s terminou com código $?" >> "$OUT/suites.txt"; tail -80 "$OUT/maestro-$s.txt"
done
# 3b) diagnóstico: o que fica na frente logo depois de abrir com todas as permissões
adb shell pm clear $APP >/dev/null 2>&1
for p in $(adb shell dumpsys package $APP | sed -n '/requested permissions:/,/install permissions:/p' | grep -oE 'android\.permission\.[A-Z_]+'); do adb shell pm grant $APP $p >/dev/null 2>&1; done
adb shell monkey -p $APP -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
for t in 10 30 60; do sleep $([ $t = 10 ] && echo 10 || echo 20)
  { echo "--- ${t}s"; adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -2
    adb shell uiautomator dump /sdcard/d.xml >/dev/null 2>&1 && adb shell cat /sdcard/d.xml | grep -oE 'text="[^"]+"' | head -25; } >> "$OUT/diagnostico-abertura.txt"
done
kill $LOGPID 2>/dev/null; sleep 1

# 4) caçador de problemas no log
grep -nE "FATAL EXCEPTION|ANR in $APP|Process: $APP|E/ReactNativeJS|E/AndroidRuntime|K1Crash|TypeError|Unhandled promise" "$OUT/logcat.txt" | head -200 > "$OUT/problemas-log.txt"
grep -nE "Bearer [A-Za-z0-9._-]{20,}|access_token=|refresh_token=|senha=|password=" "$OUT/logcat.txt" | head -20 > "$OUT/vazamento-log.txt"
adb shell pidof $APP > "$OUT/vivo.txt" 2>&1
adb exec-out screencap -p > "$OUT/final.png" 2>/dev/null
# nomes de pasta sem caracteres que o GitHub não aceita em artefatos
find "$OUT" -depth -name '*[:<>|*?"]*' | while read -r f; do mv "$f" "$(dirname "$f")/$(basename "$f" | tr ':<>|*?"' '-------')"; done
exit 0
