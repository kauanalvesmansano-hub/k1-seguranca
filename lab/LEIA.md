# K1 LAB — testes automáticos no Android

Celulares Android virtuais (grátis, nos servidores do GitHub, com aceleração KVM) que instalam o APK publicado em `envio/`, abrem o K1 e testam com o Maestro.

| Celular | Android | Para quê |
|---|---|---|
| 1-compacto | 10 (API 29), Nexus S 480×800 | tela pequena, textos/botões cortados |
| 2-padrao | 13 (API 33), Pixel 6 | fluxos normais |
| 3-tela-grande | 14 (API 34), Pixel C (tablet) | alinhamento em tela grande |
| 4-rede-instavel | 13 (API 33), Pixel 5, rede EDGE + atraso UMTS | sem internet, reconexão |
| 5-falhas | 12 (API 31), Pixel 4 | sem permissão, minimizar, girar, toques rápidos, texto gigante |

Regras do lab: nunca cria conta de verdade, nunca dispara SOS/alerta real, nunca manda e-mail/SMS; códigos inválidos usados nos testes nunca podem coincidir com um convite real.

Resultados: aba Actions (prints, logcat e JUnit de cada celular) e ramo `lab-resultados` (`ULTIMO.md` + `historico/`).
