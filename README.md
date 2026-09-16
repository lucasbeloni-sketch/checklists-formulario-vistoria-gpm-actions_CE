# checklists-formulario-vistoria-gpm-actions_CE

Versão headless (GitHub Actions) da rotina de download do relatório **Checklists
Pergunta/Resposta** do GPM **CE** (`https://sirtecce.gpm.srv.br/`), filtrado em
`Tipo de Checklist = Formulário de Vistoria de Obras`. Extrai o CSV do `.zip` e
sobrescreve `mm.aaaa.csv` na pasta do Drive `Checklists_Vistoria`
(ID `1h7atjC_nVPel0UEsrO9LT-9ekAt9AcOG`, dentro de `.../Bases`).

Terceiro robô desta família. Os dois primeiros são de **BA**:
[`checklists-visita-previa-gpm-actions_BA`](https://github.com/lucasbeloni-sketch/checklists-visita-previa-gpm-actions_BA)
(UTD) e
[`checklists-lpt-gpm-actions_BA`](https://github.com/lucasbeloni-sketch/checklists-lpt-gpm-actions_BA)
(LPT). **Mesma tela (GR669), mesmo código**; aqui mudam a unidade (CE), os dois
filtros e o destino no Drive. O repo UTD é a fonte da verdade sobre o
comportamento da tela — as armadilhas estão documentadas lá, não redescubra.

Upload direto pela Drive API com service account: sem Claude no meio, sem ponte
com o desktop, sem Google Drive Desktop montado.

## O que o robô faz por execução

1. Login no GPM CE (`#idLogin`/`#idSenha`).
2. Abre Segurança > Checklists > Exportações > Checklists Pergunta/Resposta
   chamando a função do shell `abrirTela(url, 0, 'GR669', título)` — não
   `page.goto`, que deixa de funcionar depois de um export vazio.
3. Calcula o período **ancorado em ontem (D-1)**:
   - Início = 1º dia do **mês de ontem**
   - Fim = ontem
   - Os **4** campos recebem esse mesmo par (Data Serviço Início/Fim + Data
     Inspeção Início/Fim), com hora `00:00` nos de início e `23:59` nos de fim.
4. Seleciona `Finalidade = 10 - Vistoria de Obras Elétrica` e
   `Tipo de Checklist = Formulário de Vistoria de Obras`.
5. **Relê os 4 campos de data** antes de exportar; se algum não bateu, falha em
   vez de exportar o período errado.
6. Clica **Exportar** e captura o download.
7. Extrai o CSV do zip, valida linhas + coluna `Data Execução`, e sobrescreve
   `mm.aaaa.csv` no Drive (com auto-dedup de duplicatas de mesmo nome).
8. Carimba data/hora BRT na planilha de controle.

Virada de mês é automática: no dia 1, ontem pertence ao mês anterior, então a
rodada fecha o mês anterior completo. Nenhuma lógica extra.

Mês/período **sem registros** (toast laranja "Nenhum registro encontrado") é
condição normal: o run termina **OK** sem tocar no Drive.

## Pendências desta instalação

Este repo nasceu do gêmeo de BA. Falta **uma** coisa antes do primeiro run de
verdade: rodar o workflow manual **Mapear filtros da tela**.

A lista de tipos de checklist de CE é diferente da de BA, e o robô só aceita o
texto **exato** — enquanto ninguém olhou a lista real, os valores de
`config.json` (`finalidade`, `tipoChecklist` e os tokens de busca) são chute
educado. O workflow loga no GPM de CE e imprime todas as Finalidades e todos os
Tipos com value + texto exato:

```bash
GPM_USER=... GPM_PASS=... npm run tipos    # só a Finalidade do config
TODAS=1 npm run tipos                      # varre todas as finalidades
```

Ele **sai vermelho de propósito** se o config não bater com a tela, e o log diz
exatamente o que trocar. O mapa também vira artefato (`debug/mapa-filtros.json`).

Depois de rodar, duas coisas se resolvem com ele:

1. os textos exatos de `config.json`;
2. a fixture `OPCOES_TIPOS` do `test/dom.test.js`, que hoje é uma lista
   **sintética** — a seção "VIZINHOS do token" do log é exatamente o que deve
   entrar lá (ver *Por que a fixture importa*, abaixo).

Os seletores de tela (`config.json` → `selectors`) vieram da calibração de BA.
Como é a mesma tela do mesmo GPM, a expectativa é que sirvam — mas o
`npm run inspect` confirma.

### Por que a fixture importa

O `test/dom.test.js` monta uma **página falsa** que imita a tela do GPM
(flatpickr, os dois widgets Choices.js, o botão Exportar) e roda o robô de
verdade contra ela. É o que garante, sem tocar no GPM, que o robô clica no tipo
certo. Só que ela só testa o que você colocar na lista de opções: com a lista de
CE de verdade lá dentro, o teste passa a provar que **nenhum tipo vizinho real**
é pego por engano.

## Secrets necessários

| Secret | Pra quê |
|---|---|
| `GOOGLE_CREDENTIALS` | JSON da service account (precisa ser **Editor** na pasta destino) |
| `GPM_USER` / `GPM_PASS` | Login do GPM CE — mesmos secrets dos outros repos de CE |

`GPM_CE_USER`/`GPM_CE_PASS` existem só como override no código, caso um dia este
robô precise de um login próprio. Não precisa criá-los.

## Agenda

`.github/workflows/baixar.yml`: cron a cada 6h (UTC) + botão manual
(`workflow_dispatch`, com checkbox `dry_run`). `concurrency` impede dois runs
escrevendo o mesmo arquivo do mês.

> **O cron nasce DESARMADO** (comentado no `on:`). Enquanto os textos de
> Finalidade/Tipo não forem confirmados contra a tela de CE, cada disparo
> automático só falharia e comentaria na issue rolante. Descomente as duas
> linhas depois do primeiro `dry_run` verde.

> A `concurrency` do GitHub Actions só guarda **um** run na fila: disparando
> vários backfills em sequência, o do meio é cancelado. Dispare um lote de cada
> vez.

## Tela do GPM

Calibrada em 2026-08-10 no repo gêmeo de BA (`npm run inspect` no DOM real):

| Item | Valor |
|---|---|
| Rota | `/ci/Seguranca/ChecklistPerguntaResposta` (código de tela `GR669`) |
| Onde vive | dentro do iframe `#frameTelasGPM` |
| Datas | **flatpickr com `altInput`**: o input visível não tem id; o form submete os hidden `#data_inicial`, `#data_final`, `#data_insp_in`, `#data_insp_out` em `Y-m-d H:i` |
| Finalidade | `<select id="finalidade">` escondido atrás de widget **Choices.js** |
| Tipo de Checklist | `<select id="tipos">`, também Choices.js, **populado por AJAX só depois** de escolher a Finalidade |
| Exportar | `button.btn-success` sem id → casado por classe + texto |

Duas consequências que moldaram o código:

**1. Horas são parte do filtro.** Os 4 campos têm `enableTime: true`, com
`defaultHour` `00:00` nos de início (classe `dta-zero`) e `23:59` nos de fim
(`dta-fim`). Um fim às `00:00` corta o último dia inteiro do intervalo — era
exatamente o bug silencioso da Skill manual em BA, que perdia o último dia de
cada mês.

**2. Nada de `<select>` nativo.** Choices.js tira as opções do select e as
mantém em DOM próprio, com filtro fuzzy na busca. O robô abre o widget, digita um
**token curto** (`finalidadeSearch` / `tipoChecklistSearch` no config — a string
inteira não casa), **clica no item de texto exatamente igual ao alvo** e confere
pelo `<select>` nativo, que é o que o submit usa.

O clique por texto exato não é preciosismo: em BA havia 5 tipos contendo "Visita
Prévia" e dar Enter no primeiro item filtrado exportava o checklist errado sem
ninguém perceber. Aqui o risco é o mesmo — o token `Vistoria de Obras` deve casar
com vários tipos de CE, possivelmente incluindo variantes que são superstring do
alvo.

### Recalibrar / validar

```bash
npm install
npx playwright install chromium

# Abre o browser visível, você faz o login, e ele despeja os candidatos:
HEADED=1 npm run inspect

# Confere se a service account alcança a pasta do Drive:
GOOGLE_CREDENTIALS="$(cat credentials.json)" npm run check

# Ensaio completo sem escrever no Drive:
GPM_USER=... GPM_PASS=... DRY_RUN=1 npm start
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | rotina completa (D-1 → Drive) |
| `DRY_RUN=1 npm start` | baixa e valida, não envia ao Drive |
| `HEADED=1 npm start` | browser visível (debug local; permite login manual) |
| `npm test` | testes unitários (datas, parse, DOM stub da tela) |
| `npm run inspect` | calibra seletores da tela |
| `npm run tipos` | lista Finalidades e Tipos de Checklist reais (value + texto exato) |
| `npm run check` | valida acesso ao Drive e lista a pasta |
| `npm run carimbar` | grava só o timestamp na planilha de controle (valida acesso ao Sheets) |
| `npm run meses` | imprime a lista de dias da **carga inicial** (último dia de cada mês) |
| `npm run gerar-layout` | monta o `layout.json` a partir dos CSVs que já estão na pasta |

## Timestamp de última execução

No **fim** de todo run bem-sucedido (inclusive mês sem registros, marcado
`(sem registros)`), o robô carimba data/hora BRT em `BD_Config_CE!C4` da planilha
`1-_lTKT4wSDlJtTXkF1tLHstV9h-S3Yq_2cE8jOIC3kI` — quem olha a planilha vê quando
a rotina rodou por último sem abrir o GitHub Actions.

É a **mesma planilha** dos robôs de BA, em aba própria de CE. Não mexa na
`BD_Config` (sem sufixo): lá o `C8` é do robô UTD e o `C10` é do LPT.

- Configurável em `config.json` → `timestamp` (`spreadsheetId`, `aba`, `celula`).
- `DRY_RUN=1` e runs que falharam **não** carimbam.
- Escopo `spreadsheets` (não é o do Drive): a service account precisa de acesso
  **Editor** na planilha. Sem acesso, o run diário só emite warning
  `[timestamp] NAO consegui gravar` — não falha, porque o CSV já foi enviado.
- Workflow manual **Carimbar timestamp** roda só esse passo, pra testar acesso.

## Guardas contra sobrescrever o mês com lixo

- CSV com menos de `minLinhasDados` (1) linha de dados → aborta, não envia.
- Alguma `Data Execução` fora do mês do arquivo → aborta (`AVISO_INTERVALO`),
  sinal de filtro de data errado.
- Divergência entre os 4 campos de data e o esperado → aborta antes de exportar.
- Download que veio HTML (sessão expirada) ou XLSX (botão errado) → erro claro.
- Padronização que perderia célula preenchida → aborta antes de subir.

Em qualquer falha, screenshot + HTML da tela sobem como artefato `debug` do run
e uma issue rolante é aberta/comentada.

## Layout da base (layout.json)

O CSV do GPM **não tem schema fixo**: ele traz uma coluna por PERGUNTA, e só as
perguntas presentes nos registros filtrados. Na base UTD de BA os arquivos
variaram de 67 a 78 colunas, e dois arquivos com o mesmo número de colunas
tinham conjuntos de perguntas **diferentes**. Por isso a pasta precisa de um
cabeçalho canônico — é o `layout.json`, versionado no repo.

**Este repo nasce com `layout.json` VAZIO, de propósito.** O formulário de
Vistoria de Obras tem outro conjunto de perguntas: copiar o layout de outro
checklist reordenaria as respostas. Com `colunas` vazio, o robô sobe o export
**como veio**, sem padronizar — o que é o comportamento certo enquanto não
existe base pra comparar.

Depois do primeiro export real:

```bash
GOOGLE_CREDENTIALS="$(cat credentials.json)" npm run gerar-layout
```

Ele lê todos os CSVs da pasta, monta o superconjunto de colunas (as atuais na
ordem do export mais recente, e as perguntas **aposentadas** no fim, pra não
perder resposta histórica) e grava o `layout.json`. Há também o workflow manual
**Gerar layout.json**, que commita o resultado.

Nunca copie `layout.json` entre robôs de checklists diferentes.

## Carga inicial da base

A pasta `Checklists_Vistoria` foi criada vazia em 16/09/2026. A carga combinada é
**de 2026 em diante**.

Com a pasta vazia, `npm run faltantes` não acha nada (ele compara com o que já
existe), então a carga inicial é sempre por `DIAS=` explícito. E atenção: a
estratégia "mês inteiro" do backfill exporta de `01/mm` **até o dia que você
passar** — passar `15/03` traz meio mês. Por isso existe:

```bash
npm run meses          # imprime o ÚLTIMO dia de cada mês, pronto pra colar em DIAS=
```

Sequência sugerida (um lote de cada vez, por causa da `concurrency`):

```bash
DRY_RUN=1 DIAS="31/01/2026,28/02/2026,31/03/2026" npm run backfill   # ensaio
DIAS="31/01/2026,28/02/2026,31/03/2026" npm run backfill             # grava
```

Meses sem nenhum registro saem como `vazio` no manifesto, sem erro, e não geram
arquivo.

### Ferramentas de base

| Comando | O que faz |
|---|---|
| `npm run faltantes` | lista dias provavelmente faltando (só lê o Drive) |
| `npm run auditar` | confere alinhamento estrutural de todos os CSVs (só lê o Drive) |
| `npm run analisar` | mostra o custo de conformar ao layout: perguntas fora e respostas em jogo |
| `npm run padronizar` | reprojeta a pasta no layout (aceita `DRY_RUN=1`) |
| `npm run consolidar` | junta os `mm.aaaa.csv` de cada ano **fechado** num `aaaa.csv` |
| `npm run conferir` | reexporta um mês do GPM e compara célula a célula com o arquivo da pasta |
| `npm run diag` | exporta várias combinações de filtro e loga payload/resposta (`LOG_REDE=1`) |

## Backfill de dias faltando

Depois da carga inicial, o backfill serve para buracos pontuais:

```bash
GOOGLE_CREDENTIALS="$(cat credentials.json)" npm run faltantes   # escopo, só lê o Drive

DRY_RUN=1 npm run backfill              # exporta e mostra o que mudaria, sem gravar
npm run backfill                        # grava
DIAS="31/08/2026" npm run backfill      # só um dia
```

Três estratégias, escolhidas pelo nome do arquivo de destino:

| Modo | Estratégia | Quando |
|---|---|---|
| destino `mm.aaaa.csv` | reexporta o **mês inteiro** (01/mm até o dia passado) e substitui | arquivo = 1 mês; é também o modo da carga inicial |
| destino `aaaa.csv` | exporta **só o dia** e mescla, com guarda de cabeçalho | só se existir arquivo anual consolidado |
| `SAIDA=<nome.csv>` | exporta cada dia e junta num arquivo **novo**, por união de colunas | quando os cabeçalhos divergem e não há encaixe correto no destino |

Guardas do merge (`src/merge.js`):

- **Cabeçalho tem que ser idêntico.** Se o export de hoje vier com colunas
  diferentes do arquivo de destino, aborta aquele dia e registra no manifesto —
  nunca desalinha colunas.
- **Append textual**: as linhas do destino não são reserializadas, então campos
  com quebra de linha dentro de aspas saem byte a byte iguais.
- **Dedup por `cod_checklist`**: o export de um dia pode trazer linhas cuja
  `Data Execução` é de outro dia (o filtro é por Data Serviço / Data Inspeção),
  e essas podem já estar no destino.
- **Não mexe se o dia já existe** no destino.
- Na estratégia de mês inteiro, recusa substituir se o export vier com **menos**
  linhas que o arquivo atual.

Cada dia é um export no GPM; o script vai um a um e no fim imprime um manifesto
`dia;arquivo;status;linhas`.

O detector de buracos separa evidência **forte** (dia da semana comparável
costuma ter registro) de **fraca** (esse dia da semana normalmente tem ~0). Ele
lê só a coluna `Data Execução`, e o filtro do GPM é por Data Serviço/Inspeção —
então um dia pode continuar listado mesmo depois de recuperado, se as linhas
trazidas tiverem execução em outra data. Rodar o backfill nele de novo é
inofensivo (substitui pelo mesmo conteúdo).

## Consolidação dos anos fechados

Convenção da base, igual à dos gêmeos: **ano fechado = 1 arquivo por ano, ano
corrente = 1 arquivo por mês**. O robô diário só escreve o mês corrente, então
consolidar um ano passado não briga com ele. Como a carga aqui começa em 2026
(ano corrente), isso só entra em cena em 2027.

```bash
GOOGLE_CREDENTIALS="$(cat credentials.json)" DRY_RUN=1 npm run consolidar   # ensaio
GOOGLE_CREDENTIALS="$(cat credentials.json)" npm run consolidar             # todos os fechados
ANOS=2026 npm run consolidar             # só esse
MANTER_MENSAIS=1 npm run consolidar      # gera o anual e não mexe nos mensais
```

Guardas (`tools/consolidar-ano.js`):

- **Recusa o ano corrente** — o mês em andamento ainda vai receber escrita.
- Junção por **nome de coluna**, nunca posição; cada parte é reprojetada no
  layout antes, e coluna fora do layout **aborta** (sinal de que o
  `gerar-layout` está desatualizado).
- **Portão de preservação**: a contagem de células preenchidas por coluna do
  consolidado tem que bater com a soma das partes. Qualquer diferença aborta
  antes de gravar qualquer coisa.
- Dedup por `cod_checklist`.
- Se o `aaaa.csv` já existir, ele entra na junção como mais uma parte — nunca é
  sobrescrito às cegas.
- Os mensais só vão pra **lixeira** (reversível, 30 dias) **depois** de o anual
  subir com sucesso.

## Estado

Repo criado em 16/09/2026, a partir do `checklists-lpt-gpm-actions_BA`.
**Ainda não rodou contra o GPM de CE** — o próximo passo é o workflow
**Mapear filtros da tela**. Carimbo já apontado pra `BD_Config_CE!C4`.
Testes: 82, todos verdes.
