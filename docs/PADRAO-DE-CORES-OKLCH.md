# Padrão de cores do QuickDock — OKLCH

> **Regra permanente:** toda cor nova, ou alterada, no QuickDock é escrita em
> **OKLCH**. Isso vale para CSS, JS (valores guardados em dados ou aplicados em
> `style`), SVG e para qualquer agente de IA que editar este projeto. Não use
> `#hex`, `rgb()` nem `hsl()` em código novo.

## Por que OKLCH

OKLCH descreve a cor do jeito que o olho a percebe:

- **L** (luminosidade, 0–100%) é a claridade *percebida*. Duas cores com o mesmo
  L parecem igualmente claras — o que não acontece em HSL (um amarelo e um azul
  com o mesmo `L` do HSL têm claridades muito diferentes).
- **C** (croma, 0–~0.37) é a saturação, uniforme entre matizes.
- **H** (matiz, 0–360°) é o tom. Trocar o H mantém L e C, então uma paleta de
  7 cores com o mesmo L/C tem o mesmo "peso" visual.

Consequências práticas, que são o motivo da regra:

1. **Contraste previsível.** Para garantir legibilidade basta olhar a diferença
   de L entre texto e fundo. Ver *Contraste* abaixo.
2. **Tema claro/escuro sem refazer a paleta.** O matiz fica fixo; só L e C mudam
   por tema.
3. **Misturas sem "lama".** `color-mix(in oklch, …)` mistura sem a perda de brilho
   e os tons sujos do sRGB.
4. **Gradientes e estados** (hover, ativo, desabilitado) ajustam só o L.

## Sintaxe

```css
color: oklch(26% 0.05 25);              /* L  C   H */
background: oklch(95% 0.035 25 / 0.8);  /* com alfa */
color: color-mix(in oklch, var(--a) 18%, var(--bg));
```

- `L` em porcentagem, `C` sem unidade (duas ou três casas), `H` em graus sem unidade.
- Preto e branco: `oklch(0% 0 0)` e `oklch(100% 0 0)`. Neutros quentes/frios usam C baixo (0.005–0.02).
- Em JS, guarde e aplique a string pronta (`'oklch(64% 0.21 25)'`) — nunca converta
  para hex no meio do caminho.

## Como montar uma paleta

1. Escolha os **matizes** (um por cor) e dê um nome (`--hue-red: 25`).
2. Defina **papéis** por tema, só com L e C, em variáveis (`--tone-bg-l`,
   `--tone-bg-c`, `--tone-fg-l`…).
3. Componha: `oklch(var(--tone-bg-l) var(--tone-bg-c) var(--hue))`.
4. Sobrescreva L/C no tema escuro (`[data-theme="dark"] …`). **Nunca** troque o matiz.

### Referência: cores de cartão do Quadro (`board/style.css`)

Cada cor (vermelho, laranja, amarelo, verde, azul, índigo, violeta) define, **por tema**,
quatro papéis: fundo (`--card-bg-fill`), cabeçalho (`--card-head-fill`), borda
(`--card-stroke`) e texto (`--card-fg`). No tema claro os valores são as cores originais
do projeto, convertidas de hexadecimal sem alterar o RGB; no escuro, fundo e borda são
escuros do mesmo matiz. Exemplo (vermelho):

| Papel     | Claro                     | Escuro                    |
|-----------|---------------------------|---------------------------|
| Fundo     | `oklch(93.6% 0.031 17.7)` | `oklch(25.8% 0.089 26)` |
| Texto     | `oklch(26% 0.05 17.7)`    | `oklch(94% 0.02 26)`    |

As **amostras** (bolinhas do seletor de cor e cores de seta, `board-colors.js`) são as
cores originais em OKLCH e servem sobre fundo claro *e* escuro; não mudam por tema.
## Contraste (obrigatório)

Todo texto precisa de **diferença de L ≥ 55 pontos** para o fundo imediato (≈ WCAG AA
para texto de corpo; use ≥ 70 para texto pequeno, abaixo de 12 px).

- Cartão claro: fundo 95% × texto 26% → diferença **69**. ✔
- Cartão escuro: fundo 27% × texto 94% → diferença **67**. ✔

Ao criar uma cor de fundo nova, **defina a cor do texto junto**, nos dois temas. O erro
que originou este documento foi justamente o contrário: cartões coloridos tinham fundo
claro fixo e o texto herdava `--text`, que no tema escuro é claro → texto ilegível.

## Cores vindas do usuário

- Cores escolhidas por quem usa (`--card-custom-color`) entram como vierem e são
  **misturadas com `--bg`** em OKLCH (`color-mix(in oklch, …)`), nunca com branco/preto
  fixos; o texto continua em `--text`, que já contrasta com `--bg` nos dois temas.
- `<input type="color">` só entrega hex — é limitação do controle nativo, e a única
  exceção aceita. Guarde o valor como veio; não converta de volta.
- Valores já salvos em hex (quadros e notas antigos) continuam válidos: o navegador
  renderiza os dois formatos. Não é preciso migrar dados.

## Exceções

Continuam em hexadecimal, por limitação técnica ou por serem **dados já salvos**:

- `<input type="color">` (só entrega/aceita hex) e os valores de fallback que alimentam esse campo.
- `<meta name="theme-color">`, `manifest.webmanifest` e a cor da barra do sistema
  (`sidepanel/app.js`): o sistema operacional lê hex.
- Paletas cujas cores são **gravadas nos dados do usuário** e comparadas depois:
  cor/ícone de nota (`notes-appearance.js`), cores de tag de Base
  (`bases-cell-editors.js`), marca-texto da barra mobile (`note-mobile-toolbar.js`) e a
  cor da nota-tutorial. Trocar o formato quebraria a comparação com o que já está salvo.
- Comparações com o que o navegador *devolve* (`getComputedStyle(...) === 'rgba(0, 0, 0, 0)'`).
- Arquivos de marca e ícones (`brand/`, `icons/`), bibliotecas de terceiros (`vendor/`,
  `lib/`), protótipos e páginas de teste (`redesign.html`, `MKP/`, `test/`).
- Conteúdo que sai do app (exportações, JSON Canvas) mantém o valor guardado.

Valores já salvos em hex (quadros e notas antigos) continuam válidos: o navegador renderiza
os dois formatos, não é preciso migrar dados.

## Migração do código existente

**Concluída em 2026-10-06** para todo o CSS (`sidepanel/css/*.css`, `board/style.css`),
`privacidade.html`, `content/content.js` e as cores aplicadas por JS que só são desenhadas
(grafo, JSON Studio, quadro, calendário, painel inicial, seletor de mapa). A conversão foi
mecânica e **exata**: cada `#hex`, `rgb()` e `rgba()` virou `oklch()` com a menor precisão
cujo caminho de volta devolve o mesmo RGB de 8 bits (transparência preservada em `/ alfa`).

Sobraram duas coisas de propósito:

- `color-mix(in srgb, …)` antigos ficam como estão (mudar o espaço de interpolação muda o
  resultado visível); ao tocar numa regra com `color-mix`, troque para `in oklch`.
- Os casos da seção *Exceções*.

Para código novo vale a regra do topo. Se precisar converter uma cor avulsa, use um
conversor sRGB→OKLCH e **confira o resultado nos dois temas**.
## Checklist antes de commitar uma mudança de cor

- [ ] Está em `oklch()` / `color-mix(in oklch, …)`?
- [ ] Existe valor para o tema claro **e** para o escuro?
- [ ] Texto e fundo têm diferença de L ≥ 55 nos dois temas?
- [ ] O matiz é o mesmo nos dois temas?
- [ ] Olhei no navegador, nos dois temas?
