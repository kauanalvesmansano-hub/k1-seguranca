# K1 LAB — relatório

- Quando: 28/11/2026 04:10 UTC
- APK testado: **teste-76**
- Modo: completo
- Execução: https://github.com/kauanalvesmansano-hub/k1-seguranca/actions/runs/46105489523

**Celulares usados: 5 · testes: 26 · passaram: 6 · falharam: 20 · crashes: 0**

| Celular | Android | Tela | Testes | Falhas | Crashes | Erros no log | Vazamento no log |
|---|---|---|---|---|---|---|---|
| 1-compacto | 10 | Physical size: 480x800 · Physical density: 240 | 3 | 3 | 0 | 0 | 0 |
| 2-padrao | 13 | Physical size: 1080x2400 · Physical density: 420 | 8 | 8 | 0 | 0 | 0 |
| 3-tela-grande | 14 | Physical size: 2560x1800 · Physical density: 320 | 8 | 2 | 0 | 0 | 0 |
| 4-rede-instavel | 13 | Physical size: 1080x2340 · Physical density: 440 | 4 | 4 | 0 | 0 | 0 |
| 5-falhas | 12 | Physical size: 1080x2280 · Physical density: 440 | 3 | 3 | 0 | 0 | 0 |

## Por teste

| Teste | Resultado por celular |
|---|---|
| Cadastro da empresa — validações (sem criar conta) | 2-padrao: ❌ Element not found: Text matching regex: .*CADASTRE SUA EMPRESA.* · 3-tela-grande: ✅ |
| Contato de emergência — código inválido | 2-padrao: ❌ Unknown error · 3-tela-grande: ✅ |
| Empresa — login vazio e senha errada | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ❌ Element not found: Text matching regex: ENTRAR · 3-tela-grande: ❌ Element not found: Text matching regex: SENHA · 4-rede-instavel: ❌ Element not found: Text matching regex: ENTRAR · 5-falhas: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible |
| Família — código de convite inválido | 2-padrao: ❌ Element not found: Text matching regex: ENTRAR NA FAMÍLIA · 3-tela-grande: ✅ |
| Funcionário — login vazio e inválido | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ❌ Element not found: Text matching regex: ENTRAR · 3-tela-grande: ✅ · 4-rede-instavel: ❌ Element not found: Text matching regex: ENTRAR · 5-falhas: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible |
| Início — 5 opções de acesso | 1-compacto: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible · 2-padrao: ❌ Unknown error · 3-tela-grande: ✅ · 4-rede-instavel: ❌ Unknown error · 5-falhas: ❌ Assertion is false: "COMO VOCÊ VAI ACESSAR?" is visible |
| Rede — login sem internet, depois reconecta | 4-rede-instavel: ❌ Element not found: Text matching regex: SENHA |
| Senha nova — abre por link e recusa código errado | 2-padrao: ❌ Assertion is false: "CÓDIGO DO E-MAIL" is visible · 3-tela-grande: ❌ Assertion is false: ".*8 ou mais caracteres.*" is visible |
| Vigilante individual — validações do cadastro | 2-padrao: ❌ Unknown error · 3-tela-grande: ✅ |
