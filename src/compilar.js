// Compilador: le TODOS os CSVs da pasta do Drive, junta as linhas de dados (sem
// cabecalho) e escreve o bloco inteiro na aba BD_Checklist_GPM da planilha de
// bases, a partir da linha 3.
//
// Roda no fim de toda execucao do robo diario (depois de o CSV do mes subir ao
// Drive) e tambem sozinho, por `npm run compilar` / workflow manual.
//
// Duas escolhas que valem explicacao:
//
// 1. Cada arquivo e REPROJETADO no layout.json antes de entrar. O export do GPM
//    traz uma coluna por pergunta, e so as perguntas presentes no periodo — dois
//    meses podem vir com cabecalhos diferentes. Concatenar na marra desalinharia
//    as respostas na planilha. Reprojetar por NOME casa cada coluna com a
//    posicao certa, e `validar` aborta se alguma celula preenchida se perdesse.
//
// 2. Dedup por cod_checklist. O filtro do GPM e por Data Servico/Inspecao, entao
//    a mesma linha pode aparecer em dois arquivos de mes. Hoje nao ha nenhuma
//    repetida (48 linhas, 48 codigos), mas a base cresce.

const cfg = require("../config.json");
const layout = require("../layout.json");
const { listarCsv, baixarCsv } = require("./drive");
const { parseCsv } = require("./uniao");
const { reprojetar, validar, juntarNoLayout } = require("./padronizar");
const { gravarDados } = require("./sheets");

// Ordem cronologica pelos nomes da pasta: `aaaa.csv` (ano fechado) vem antes dos
// `mm.aaaa.csv` do mesmo ano, e mes 1 antes do 12. Sem isso, ordenacao
// alfabetica poria 10.2026 antes de 09.2026.
function chaveOrdem(nome) {
  let m = /^(\d{2})\.(\d{4})\.csv$/i.exec(nome);
  if (m) return Number(m[2]) * 100 + Number(m[1]);
  m = /^(\d{4})\.csv$/i.exec(nome);
  if (m) return Number(m[1]) * 100;
  return Number.MAX_SAFE_INTEGER;       // nomes fora do padrao vao pro fim
}

function ordenar(arquivos) {
  return [...arquivos].sort((a, b) => {
    const d = chaveOrdem(a.name) - chaveOrdem(b.name);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

async function compilar({ dryRun = false } = {}) {
  const colunas = (layout.colunas || []);
  if (!colunas.length) {
    throw new Error(
      "layout.json esta vazio: sem layout canonico nao da pra alinhar as colunas com o cabecalho da aba. " +
      "Rode `npm run gerar-layout` primeiro."
    );
  }

  const arquivos = ordenar((await listarCsv(cfg)).filter((f) => /\.csv$/i.test(f.name)));
  if (!arquivos.length) throw new Error("nenhum CSV na pasta do Drive — nada a compilar.");

  const partes = [];
  for (const arq of arquivos) {
    const buf = await baixarCsv(arq.name, cfg);
    const { header, rows } = parseCsv(buf.toString("utf8"));
    const destino = reprojetar(colunas, { header, rows });
    const v = validar({ header, rows }, destino);
    if (!v.ok) {
      throw new Error(`${arq.name}: reprojetar no layout perderia dado — ${v.problemas.join("; ")}`);
    }
    partes.push({ nome: arq.name, ...destino });
    console.log(`[compilar] ${arq.name}: ${rows.length} linha(s), ${header.length} coluna(s) -> layout de ${colunas.length}.`);
  }

  const juntado = juntarNoLayout(colunas, partes);
  const total = juntado.rows.length;
  console.log(`[compilar] ${partes.length} arquivo(s) => ${total} linha(s)` +
    (juntado.dup ? `, ${juntado.dup} removida(s) por cod_checklist repetido.` : ", nenhuma repetida."));

  // Portao: nunca limpar a aba pra escrever quase nada. Uma listagem do Drive
  // que volte curta (permissao, arquivo na lixeira) nao pode virar planilha
  // vazia — melhor falhar e manter o que ja estava la.
  const minimo = cfg.sheet.minLinhas || 1;
  if (total < minimo) {
    throw new Error(`so ${total} linha(s) compiladas, abaixo do minimo de ${minimo}: nao vou limpar a aba.`);
  }

  if (dryRun) {
    console.log(`[compilar] DRY_RUN: ${total} linha(s) NAO gravadas em ${cfg.sheet.aba}.`);
    return { total, dup: juntado.dup, arquivos: partes.length, gravado: false };
  }

  const res = await gravarDados(juntado.rows, cfg);
  return { total, dup: juntado.dup, arquivos: partes.length, gravado: true, ...res };
}

module.exports = { compilar, chaveOrdem, ordenar };

if (require.main === module) {
  compilar({ dryRun: !!process.env.DRY_RUN })
    .then((r) => console.log(`[compilar] OK: ${r.total} linha(s) de ${r.arquivos} arquivo(s).`))
    .catch((e) => { console.error(`[compilar] FALHOU: ${e.message}`); process.exit(1); });
}
