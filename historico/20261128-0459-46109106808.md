# K1 LAB — relatório

- Quando: 28/11/2026 04:59 UTC
- APK testado: **teste-76**
- Modo: completo
- Execução: https://github.com/kauanalvesmansano-hub/k1-seguranca/actions/runs/46109106808

**Celulares usados: 5 · testes: 31 · passaram: 27 · falharam: 4 · crashes: 0**

| Celular | Android | Tela | Testes | Falhas | Crashes | Erros no log | Vazamento no log |
|---|---|---|---|---|---|---|---|
| 1-compacto | 10 | Physical size: 480x800 · Physical density: 240 | 8 | 2 | 0 | 0 | 0 |
| 2-padrao | 13 | Physical size: 1080x2400 · Physical density: 420 | 8 | 1 | 0 | 0 | 0 |
| 3-tela-grande | 14 | Physical size: 2560x1800 · Physical density: 320 | 8 | 1 | 0 | 0 | 0 |
| 4-rede-instavel | 13 | Physical size: 1080x2340 · Physical density: 440 | 4 | 0 | 0 | 0 | 0 |
| 5-falhas | 12 | Physical size: 1080x2280 · Physical density: 440 | 3 | 0 | 0 | 0 | 0 |

## Por teste

| Teste | Resultado por celular |
|---|---|
| Cadastro da empresa — validações (sem criar conta) | 1-compacto: ✅ · 2-padrao: ✅ · 3-tela-grande: ✅ |
| Contato de emergência — código inválido | 1-compacto: ✅ · 2-padrao: ✅ · 3-tela-grande: ✅ |
| Empresa — login vazio e senha errada | 1-compacto: ✅ · 2-padrao: ✅ · 3-tela-grande: ✅ · 4-rede-instavel: ✅ · 5-falhas: ✅ |
| Família — código de convite inválido | 1-compacto: ✅ · 2-padrao: ✅ · 3-tela-grande: ✅ |
| Funcionário — login vazio e inválido | 1-compacto: ✅ · 2-padrao: ✅ · 3-tela-grande: ✅ · 4-rede-instavel: ✅ · 5-falhas: ✅ |
| Início — 5 opções de acesso | 1-compacto: ✅ · 2-padrao: ✅ · 3-tela-grande: ✅ · 4-rede-instavel: ✅ · 5-falhas: ✅ |
| Rede — login sem internet, depois reconecta | 4-rede-instavel: ✅ |
| Senha nova — abre por link e recusa código errado | 1-compacto: ❌ Assertion is false: "CRIAR NOVA SENHA" is visible · 2-padrao: ❌ Assertion is false: ".*(vencid/errad/inválid/internet/instantes).*" is visible · 3-tela-grande: ❌ Couldn't hide the keyboard. This can happen if the app uses a custom input or doesn't expose a standard dismiss action. |
| Vigilante individual — validações do cadastro | 1-compacto: ❌ Assertion is false: ".*30 DIAS GRÁTIS.*" is visible · 2-padrao: ✅ · 3-tela-grande: ✅ |
