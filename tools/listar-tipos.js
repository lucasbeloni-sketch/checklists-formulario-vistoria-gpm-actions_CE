// Mapeia os DOIS dropdowns da tela no GPM de CE: lista todas as Finalidades e,
// pra cada uma que interessa, todos os Tipos de Checklist (value + texto exato).
//
// Por que existe: o `inspect` so mostra as 6 primeiras opcoes de cada select, e
// o #tipos so e populado por AJAX DEPOIS de escolher a Finalidade — entao ele
// aparece vazio la. Sem esta lista, o texto exato do config e chute, e o robo
// so descobre que errou quando a rodada falha.
//
// Uso:
//   GPM_USER=... GPM_PASS=... npm run tipos     (so a Finalidade do config)
//   TODAS=1 npm run tipos                       (varre TODAS as finalidades)
//
// Sai 0 se o config bate com a tela, 1 se nao bate (o JSON do mapa e gravado em
// debug/ nos dois casos, pra virar artefato do workflow).

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const cfg = require("../config.json");
const {
  login, abrirChecklists, selecionarChoices, esperarTiposCarregar, norm,
} = require("../src/gpm");

// Le TODAS as opcoes de um <select> nativo (value + texto), pulando o
// placeholder "Selecione...". O nativo e a fonte da verdade: e ele que o form
// submete, o widget Choices.js e so a casca visual.
async function opcoesDe(root, sel) {
  return root.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return [...el.options]
      .map((o) => ({ value: o.value, texto: o.text.trim() }))
      .filter((o) => o.value && !/^selecione/i.test(o.texto));
  }, sel);
}

function imprimir(titulo, opcoes) {
  console.log(`\n=== ${titulo} (${opcoes ? opcoes.length : 0}) ===`);
  if (!opcoes) return console.log("  <select nao encontrado>");
  for (const o of opcoes) console.log(`  [${o.value}] ${o.texto}`);
}

(async () => {
  const browser = await chromium.launch({ headless: process.env.HEADED ? false : true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const mapa = { geradoEm: new Date().toISOString(), baseUrl: cfg.baseUrl, finalidades: [], tipos: {} };
  let problemas = [];

  try {
    await login(page, cfg);
    const root = await abrirChecklists(page, cfg);

    const finalidades = await opcoesDe(root, cfg.selectors.finalidade || "#finalidade");
    mapa.finalidades = finalidades || [];
    imprimir("FINALIDADES", finalidades);

    // Confere o texto do config contra a tela (comparacao normalizada: sem
    // acento, minusculo, espacos colapsados — igual a do robo).
    const alvoF = (finalidades || []).find((o) => norm(o.texto) === norm(cfg.finalidade));
    if (alvoF) {
      console.log(`\n[ok] config.finalidade "${cfg.finalidade}" existe na tela (value=${alvoF.value}).`);
    } else {
      problemas.push(`config.finalidade "${cfg.finalidade}" NAO existe na lista acima.`);
    }

    // Quais finalidades varrer: a do config, ou todas com TODAS=1.
    const varrer = process.env.TODAS
      ? (finalidades || [])
      : (alvoF ? [alvoF] : []);

    for (const f of varrer) {
      console.log(`\n--- carregando tipos de "${f.texto}" ---`);
      try {
        await selecionarChoices(root, cfg, "finalidade", f.texto, f.texto.slice(0, 12));
        const carregou = await esperarTiposCarregar(root, cfg);
        const tipos = await opcoesDe(root, cfg.selectors.tipoChecklist || "#tipos");
        mapa.tipos[f.texto] = tipos || [];
        imprimir(`TIPOS DE CHECKLIST — ${f.texto}`, tipos);
        // Lista vazia tem dois significados MUITO diferentes: "esta finalidade
        // nao tem tipo nenhum" e "o AJAX nao respondeu". Separar os dois aqui
        // evita concluir que o alvo nao existe quando so faltou esperar.
        if (!tipos || tipos.length === 0) {
          console.log(`  [${carregou ? "vazio de verdade" : "AJAX NAO RESPONDEU"}] nenhum tipo sob esta finalidade.`);
        }
      } catch (e) {
        console.warn(`  [aviso] nao consegui listar os tipos desta finalidade: ${e.message}`);
        mapa.tipos[f.texto] = null;
      }
    }

    // Confere o Tipo do config dentro da Finalidade do config.
    if (alvoF) {
      const lista = mapa.tipos[alvoF.texto] || [];
      const alvoT = lista.find((o) => norm(o.texto) === norm(cfg.tipoChecklist));
      if (alvoT) {
        console.log(`\n[ok] config.tipoChecklist "${cfg.tipoChecklist}" existe (value=${alvoT.value}).`);
      } else {
        problemas.push(`config.tipoChecklist "${cfg.tipoChecklist}" NAO existe sob a finalidade "${alvoF.texto}".`);
      }

      // Os tipos que o token de busca tambem filtra — sao os decoys que o
      // clique por texto exato precisa descartar, e o que deve ir pro fixture
      // do test/dom.test.js.
      const tk = norm(cfg.tipoChecklistSearch);
      const vizinhos = lista.filter((o) => norm(o.texto).includes(tk));
      console.log(`\n=== VIZINHOS do token "${cfg.tipoChecklistSearch}" (${vizinhos.length}) ===`);
      for (const v of vizinhos) console.log(`  [${v.value}] ${v.texto}`);
      if (vizinhos.length === 0) {
        problemas.push(`o token "${cfg.tipoChecklistSearch}" nao filtra nenhum tipo — o widget nao vai mostrar o alvo.`);
      }
      mapa.vizinhosDoToken = vizinhos;
    }
  } finally {
    fs.mkdirSync(path.join(__dirname, "..", "debug"), { recursive: true });
    const saida = path.join(__dirname, "..", "debug", "mapa-filtros.json");
    fs.writeFileSync(saida, JSON.stringify(mapa, null, 2), "utf8");
    console.log(`\n[tipos] mapa gravado em ${saida}`);
    await browser.close();
  }

  if (problemas.length) {
    console.error("\n=== VEREDITO: o config NAO bate com a tela ===");
    for (const p of problemas) console.error(`  - ${p}`);
    console.error("\nAjuste config.json (finalidade / tipoChecklist / tokens de busca) com os textos EXATOS listados acima.");
    process.exit(1);
  }
  console.log("\n=== VEREDITO: config bate com a tela. ===");
})();
