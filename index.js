#!/usr/bin/env node

const {
  default: AutoViewStatusConnect,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  jidDecode,
  makeWASocket,
} = require("@whiskeysockets/baileys");
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const readline = require('readline');
const spinnies = new (require('spinnies'))();
const autoViewStatus = require('./lib/autoview');
const usePairingCode = true;

let isFileUpdated = false;

async function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

const main = async () => {
  const store = makeInMemoryStore({
    logger: pino().child({
      level: 'silent',
      stream: 'store',
    }),
  });

  const { state, saveCreds } = await useMultiFileAuthState('session');
  const AutoViewStatusSocket = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !usePairingCode,
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: false,
    syncFullHistory: true,
    browser: ["Ubuntu", "Chrome", "20.04.6"],
    auth: state,
  });

  if (usePairingCode && !state.creds.registered) {
    const phoneNumber = await question(chalk.yellow('\nMasukkan Nomor Anda:\n')); 
    const code = await AutoViewStatusSocket.requestPairingCode(phoneNumber.trim());
    console.log(chalk.green(`Kode Pairing Anda: ${code}`));
  }

  AutoViewStatusSocket.ev.on('messages.upsert', async (chatUpdate) => {
    const m = chatUpdate.messages[0];
    await autoViewStatus(m, AutoViewStatusSocket);
  });

  AutoViewStatusSocket.decodeJid = (jid) => {
    if (!jid) return jid;
    return /:\d+@/gi.test(jid)
      ? (jidDecode(jid) || {}).user + '@' + (jidDecode(jid) || {}).server
      : jid;
  };

  AutoViewStatusSocket.ev.on('connection.update', (update) =>
    handleConnectionUpdate(update, AutoViewStatusSocket, saveCreds)
  );
  AutoViewStatusSocket.ev.on('creds.update', saveCreds);
};

const handleConnectionUpdate = (update, AutoViewStatusSocket, saveCreds) => {
  const { connection, lastDisconnect } = update;
  if (connection === 'connecting') {
    spinnies.add('start', { text: 'Menghubungkan...' });
  } else if (connection === 'open') {
    spinnies.succeed('start', { text: 'Berhasil Terhubung!' });
  } else if (connection === 'close' && !isFileUpdated) {
    if (lastDisconnect.error.output.statusCode === DisconnectReason.loggedOut) {
      console.log(chalk.red('Perangkat Telah Keluar, Harap Hapus Folder session Dan Hubungkan Kembali.'));
      process.exit(0);
    } else {
      main().catch(() => main());
    }
  }
};

const start = () => {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
};

start();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  isFileUpdated = true;
  console.log(chalk.redBright(`Update File: ${__filename}`));
  delete require.cache[file];
  require(file);
});