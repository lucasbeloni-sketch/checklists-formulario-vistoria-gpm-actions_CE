const test = require("node:test");
const assert = require("node:assert");
const { rangeA1 } = require("../src/timestamp");
const cfg = require("../config.json");

test("rangeA1: aba simples nao leva aspas", () => {
  assert.equal(rangeA1("BD_Config", "C8"), "BD_Config!C8");
});

test("rangeA1: aba com espaco/acento vai entre aspas", () => {
  assert.equal(rangeA1("BD Config", "C8"), "'BD Config'!C8");
  assert.equal(rangeA1("Configuração", "A1"), "'Configuração'!A1");
});

test("rangeA1: aspas simples internas sao dobradas", () => {
  assert.equal(rangeA1("BD 'X'", "C8"), "'BD ''X'''!C8");
});

test("config.timestamp aponta pra uma celula da aba BD_Config_CE da planilha de controle", () => {
  assert.ok(cfg.timestamp, "cfg.timestamp ausente");
  assert.match(cfg.timestamp.spreadsheetId, /^[A-Za-z0-9_-]{20,}$/);
  // Aba PROPRIA de CE. A BD_Config (sem sufixo) e a dos robos de BA, na mesma
  // planilha — carimbar la sobrescreveria o heartbeat do robo errado.
  assert.equal(cfg.timestamp.aba, "BD_Config_CE");
  assert.match(cfg.timestamp.celula, /^[A-Z]+[0-9]+$/);
});
