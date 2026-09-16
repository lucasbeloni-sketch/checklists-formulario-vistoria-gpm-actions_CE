// Escreve a base compilada na aba de destino do Google Sheets, via service
// account. NAO toca as linhas de cabecalho (1-2): limpa e reescreve SO da linha
// `linhaInicioDados` (3) pra baixo. Se a aba tiver menos colunas ou linhas que o
// necessario, cresce a grade antes.
//
// Portado do repo irmao consulta-vistoria-obras-gpm-actions_CE, que escreve na
// aba BD_Vistoria_GPM da MESMA planilha — mesma convencao de layout:
//   L1: A1 "Última atualização:" | B1 timestamp
//   L2: cabecalhos
//   L3+: dados

const { google } = require("googleapis");
const { getAuthClient, withRetry, stampBR } = require("../lib/google");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function getSheets() {
  const auth = await getAuthClient(SCOPES);
  return google.sheets({ version: "v4", auth });
}

// Numero da coluna (1-based) -> letra A1 (1->A, 27->AA).
function colLetra(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

async function propsAba(sheets, spreadsheetId, aba) {
  const meta = await withRetry(
    () => sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,sheetId,gridProperties)" }),
    { label: "get meta" }
  );
  const s = (meta.data.sheets || []).find((x) => x.properties.title === aba);
  if (!s) throw new Error(`aba "${aba}" nao existe na planilha ${spreadsheetId}.`);
  return s.properties;
}

// Cresce a grade da aba se as linhas/colunas nao couberem. Sem isso, o update
// estoura com "exceeds grid limits" quando a base passa do tamanho da aba (a
// BD_Checklist_GPM nasceu com 1000 linhas).
async function garantirGrade(sheets, spreadsheetId, props, nLinhas, nCols) {
  const gp = props.gridProperties || {};
  const requests = [];
  if ((gp.columnCount || 0) < nCols) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: props.sheetId, gridProperties: { columnCount: nCols } },
        fields: "gridProperties.columnCount",
      },
    });
  }
  if ((gp.rowCount || 0) < nLinhas) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: props.sheetId, gridProperties: { rowCount: nLinhas } },
        fields: "gridProperties.rowCount",
      },
    });
  }
  if (!requests.length) return false;
  await withRetry(
    () => sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }),
    { label: "crescer grade" }
  );
  console.log(`[sheets] grade da aba crescida para ${Math.max(gp.rowCount || 0, nLinhas)} linhas x ${Math.max(gp.columnCount || 0, nCols)} colunas.`);
  return true;
}

// Grava `matriz` (array de linhas, SEM cabecalho) a partir de
// A{linhaInicioDados}, e carimba o horario em `timestampCell`.
async function gravarDados(matriz, cfg) {
  const sheets = await getSheets();
  const { spreadsheetId, aba, linhaInicioDados } = cfg.sheet;
  const inicio = linhaInicioDados || 3;
  const vio = cfg.sheet.valueInputOption || "USER_ENTERED";
  const nCols = matriz.reduce((m, r) => Math.max(m, r.length), 1);
  const ate = colLetra(nCols);

  const props = await propsAba(sheets, spreadsheetId, aba);
  await garantirGrade(sheets, spreadsheetId, props, inicio + matriz.length, nCols);

  // Limpa o bloco de dados inteiro antes de escrever: sem isso, uma base que
  // encolheu deixaria linhas velhas orfas embaixo das novas.
  await withRetry(
    () => sheets.spreadsheets.values.clear({ spreadsheetId, range: `${aba}!A${inicio}:${ate}` }),
    { label: "clear" }
  );
  const res = await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${aba}!A${inicio}`,
      valueInputOption: vio,
      requestBody: { values: matriz },
    }),
    { label: "update" }
  );
  console.log(`[sheets] ${matriz.length} linha(s) gravadas em ${aba}!A${inicio}:${ate}${inicio + matriz.length - 1}.`);

  // Rotulo + timestamp na linha 1, do jeito das abas irmas desta planilha.
  const cel = cfg.sheet.timestampCell || "B1";
  const rotulo = cfg.sheet.rotuloTimestamp || "Última atualização:";
  const celRotulo = cel.replace(/^[A-Z]+/, (L) => colLetra(Math.max(1, letraCol(L) - 1)));
  const stamp = stampBR(cfg.timezone);
  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${aba}!${celRotulo}:${cel}`,
      valueInputOption: vio,
      requestBody: { values: [[rotulo, stamp]] },
    }),
    { label: "timestamp" }
  );
  console.log(`[sheets] timestamp ${stamp} gravado em ${aba}!${cel} (rotulo em ${celRotulo}).`);
  return { atualizadas: res.data.updatedRows || matriz.length, stamp, celula: `${aba}!${cel}` };
}

// Letra A1 -> numero da coluna (A->1, AA->27). Inverso de colLetra.
function letraCol(s) {
  let n = 0;
  for (const c of String(s).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

module.exports = { gravarDados, colLetra, letraCol };
