#!/usr/bin/env node
// Server MCP del Condominio Manager, FASE A: sola lettura, solo emulatori, trasporto stdio.
// Variabili: MCP_EMAIL, MCP_PASSWORD (utente di prova sull'emulatore), MCP_EDIFICIO (solo se l'utente è Super Admin).
process.env.TZ = 'Europe/Rome'; // le date dell'app sono di calendario locale
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { controllaAmbiente } = require('./lib/guardia');
const { apriSessione } = require('./lib/lettura');
const { registra } = require('./lib/tools');

async function avvia() {
  const amb = controllaAmbiente();
  const { MCP_EMAIL: email, MCP_PASSWORD: password, MCP_EDIFICIO: edificio } = process.env;
  if (!email || !password) throw new Error('Impostare MCP_EMAIL e MCP_PASSWORD (utente di prova dell\'emulatore).');
  const sessione = await apriSessione({ ...amb, email, password, edificio });
  const server = new McpServer({ name: 'condominio-manager', version: '0.1.0-faseA' });
  registra(server, sessione);
  await server.connect(new StdioServerTransport());
  console.error('MCP fase A pronto: edificio ' + sessione.edificioId + ', ruolo ' + sessione.ruolo + ' (sola lettura, emulatori).');
}
avvia().catch((e) => { console.error(e.message); process.exit(1); });
