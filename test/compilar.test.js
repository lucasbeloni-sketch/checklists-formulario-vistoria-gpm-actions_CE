const test = require("node:test");
const assert = require("node:assert");
const { chaveOrdem, ordenar } = require("../src/compilar");
const { colLetra, letraCol } = require("../src/sheets");
const cfg = require("../config.json");

// --- ordem dos arquivos ---

test("ordem: mes 09 vem antes de 10 (alfabetico poria ao contrario)", () => {
  const nomes = ordenar([{ name: "10.2026.csv" }, { name: "09.2026.csv" }]).map((f) => f.name);
  assert.deepStrictEqual(nomes, ["09.2026.csv", "10.2026.csv"]);
});

test("ordem: anos separam os meses", () => {
  const nomes = ordenar([
    { name: "01.2027.csv" }, { name: "12.2026.csv" }, { name: "01.2026.csv" },
  ]).map((f) => f.name);
  assert.deepStrictEqual(nomes, ["01.2026.csv", "12.2026.csv", "01.2027.csv"]);
});

test("ordem: o anual aaaa.csv vem antes dos meses do MESMO ano", () => {
  // Nunca coexistem na pratica (consolidar apaga os mensais), mas se
  // coexistirem o anual e o bloco mais antigo — tem que entrar primeiro.
  const nomes = ordenar([{ name: "03.2026.csv" }, { name: "2026.csv" }]).map((f) => f.name);
  assert.deepStrictEqual(nomes, ["2026.csv", "03.2026.csv"]);
});

test("ordem: nome fora do padrao vai pro fim, nao quebra", () => {
  const nomes = ordenar([
    { name: "dias_recuperados.csv" }, { name: "08.2026.csv" }, { name: "07.2026.csv" },
  ]).map((f) => f.name);
  assert.deepStrictEqual(nomes, ["07.2026.csv", "08.2026.csv", "dias_recuperados.csv"]);
});

test("chaveOrdem: mensal e anual do mesmo ano nao empatam", () => {
  assert.ok(chaveOrdem("2026.csv") < chaveOrdem("01.2026.csv"));
  assert.ok(chaveOrdem("12.2025.csv") < chaveOrdem("01.2026.csv"));
});

// --- colunas A1 ---

test("colLetra: 27 colunas chegam ate AA", () => {
  assert.strictEqual(colLetra(1), "A");
  assert.strictEqual(colLetra(26), "Z");
  assert.strictEqual(colLetra(27), "AA");
});

test("letraCol e o inverso de colLetra", () => {
  for (const n of [1, 5, 26, 27, 52, 53, 100]) {
    assert.strictEqual(letraCol(colLetra(n)), n, `falhou em ${n}`);
  }
});

// --- config ---

test("config.sheet aponta pra aba BD_Checklist_GPM, dados da linha 3", () => {
  assert.ok(cfg.sheet, "cfg.sheet ausente");
  assert.match(cfg.sheet.spreadsheetId, /^[A-Za-z0-9_-]{20,}$/);
  assert.strictEqual(cfg.sheet.aba, "BD_Checklist_GPM");
  assert.strictEqual(cfg.sheet.linhaInicioDados, 3);
});

test("config.sheet: o carimbo fica na linha 1, FORA do bloco de dados", () => {
  // B2 seria em cima do cabecalho "Ordem trabalho"; qualquer celula da linha 3
  // pra baixo seria apagada pelo clear do proprio compilador.
  const m = /^([A-Z]+)(\d+)$/.exec(cfg.sheet.timestampCell);
  assert.ok(m, `timestampCell "${cfg.sheet.timestampCell}" nao e uma celula A1 valida`);
  assert.ok(Number(m[2]) < cfg.sheet.linhaInicioDados,
    `timestampCell ${cfg.sheet.timestampCell} cairia dentro do bloco de dados (linha >= ${cfg.sheet.linhaInicioDados})`);
  assert.strictEqual(Number(m[2]), 1, "a convencao das abas irmas e o carimbo na linha 1");
});

test("config.sheet: o rotulo cabe a esquerda do carimbo", () => {
  const col = letraCol(/^([A-Z]+)/.exec(cfg.sheet.timestampCell)[1]);
  assert.ok(col > 1, "com o carimbo em A nao sobraria celula pro rotulo");
});
