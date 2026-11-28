# K1 LAB — relatório

- Quando: 28/11/2026 04:45 UTC
- APK testado: **teste-76**
- Modo: completo
- Execução: https://github.com/kauanalvesmansano-hub/k1-seguranca/actions/runs/46107677854

**Celulares usados: 5 · testes: 31 · passaram: 13 · falharam: 18 · crashes: 0**

| Celular | Android | Tela | Testes | Falhas | Crashes | Erros no log | Vazamento no log |
|---|---|---|---|---|---|---|---|
| 1-compacto | 10 | Physical size: 480x800 · Physical density: 240 | 8 | 8 | 0 | 0 | 0 |
| 2-padrao | 13 | Physical size: 1080x2400 · Physical density: 420 | 8 | 2 | 0 | 0 | 0 |
| 3-tela-grande | 14 | Physical size: 2560x1800 · Physical density: 320 | 8 | 3 | 0 | 0 | 0 |
| 4-rede-instavel | 13 | Physical size: 1080x2340 · Physical density: 440 | 4 | 2 | 0 | 0 | 0 |
| 5-falhas | 12 | Physical size: 1080x2280 · Physical density: 440 | 3 | 3 | 0 | 0 | 0 |

## Por teste

| Teste | Resultado por celular |
|---|---|
| Cadastro da empresa — validações (sem criar conta) | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ✅ · 3-tela-grande: ✅ |
| Contato de emergência — código inválido | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ✅ · 3-tela-grande: ✅ |
| Empresa — login vazio e senha errada | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ❌ No visible element found: "ENTRAR" · 3-tela-grande: ❌ No visible element found: "ENTRAR" · 4-rede-instavel: ❌ Assertion is false: ".*(incorretos/cadastrado/internet/instantes).*" is visible · 5-falhas: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible |
| Família — código de convite inválido | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ✅ · 3-tela-grande: ✅ |
| Funcionário — login vazio e inválido | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ✅ · 3-tela-grande: ❌ No visible element found: "ENTRAR" · 4-rede-instavel: ✅ · 5-falhas: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible |
| Início — 5 opções de acesso | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ✅ · 3-tela-grande: ✅ · 4-rede-instavel: ✅ · 5-falhas: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible |
| Rede — login sem internet, depois reconecta | 4-rede-instavel: ❌ No visible element found: "ENTRAR" |
| Senha nova — abre por link e recusa código errado | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ❌ No visible element found: "SALVAR SENHA NOVA" · 3-tela-grande: ❌ No visible element found: "SALVAR SENHA NOVA" |
| Vigilante individual — validações do cadastro | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ✅ · 3-tela-grande: ✅ |
