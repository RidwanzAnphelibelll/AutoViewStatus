#!/usr/bin/env node

const {
  default: AutoViewStatusConnect,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  jidDecode,
  proto,
  Browsers,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const chalk = require("chalk");
const pino = require("pino");
const fs = require("fs");
const spinnies = new (require('spinnies'))();
const autoViewStatus = require('./lib/autoview');

const usePairingCode = true;

const store = {
  contacts: {},
  messages: {},
  groupMetadata: {},
  bind: (ev) => {
    ev.on('contacts.update', (update) => {
      for (let contact of update) {
        let id = contact.id;
        if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
      }
    });
  },
  loadMessage: async (jid, id) => {
    return null;
  }
};

function getPhoneNumberInput() {
  return new Promise((resolve) => {
    process.stdout.write(chalk.yellow('\nMasukkan Nomor Anda:\n'));
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

async function startAutoViewStatus() {
  const { state, saveCreds } = await useMultiFileAuthState('session');

  const AutoViewStatusSocket = AutoViewStatusConnect({
    browser: Browsers.ubuntu('Chrome'),
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false,
    syncFullHistory: true,
    auth: state
  });

  if (usePairingCode && !AutoViewStatusSocket.authState.creds.registered) {
    const phoneNumber = await getPhoneNumberInput();
    if (phoneNumber.includes('628')) {
      const code = await AutoViewStatusSocket.requestPairingCode(phoneNumber.trim());
      console.log(chalk.green(`Kode Pairing Anda: ${code}`));
    } else {
      console.log(chalk.red(`Nomor Harus Diawali Dengan 628!`));
      process.exit(0);
    }
  }

  AutoViewStatusSocket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !usePairingCode) {
      console.log(chalk.cyan('Silahkan scan QR Code:'));
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'connecting') {
      spinnies.add('start', { text: 'Sedang Menghubungkan...' });
    } else if (connection === 'open') {
      spinnies.succeed('start', { text: 'Berhasil Terhubung!' });
    }
  });

  store.bind(AutoViewStatusSocket.ev);

  AutoViewStatusSocket.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const m = chatUpdate.messages[0];
      await autoViewStatus(m, AutoViewStatusSocket);
    } catch (err) {
      console.log(err);
    }
  });

  AutoViewStatusSocket.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

  AutoViewStatusSocket.ev.on("contacts.update", (update) => {
    for (let contact of update) {
      let id = AutoViewStatusSocket.decodeJid(contact.id);
      if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
    }
  });

  AutoViewStatusSocket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.badSession) {
        console.log(chalk.red('Sesi Buruk, Harap Hapus Folder session dan Hubungkan Kembali!'));
        process.exit(0);
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log(chalk.yellow('Koneksi Ditutup, Menghubungkan Kembali...'));
        startAutoViewStatus();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log(chalk.yellow('Koneksi Hilang Dari Server, Menghubungkan Kembali...'));
        startAutoViewStatus();
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log(chalk.red('Koneksi Digantikan, Sesi Baru Dibuka, Harap Restart Bot!'));
        process.exit(0);
      } else if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.red('Perangkat Telah Keluar, Harap Hapus Folder session Dan Hubungkan Kembali.'));
        process.exit(0);
      } else if (reason === DisconnectReason.restartRequired) {
        console.log(chalk.blue('Restart Diperlukan, Melakukan Restart...'));
        startAutoViewStatus();
      } else if (reason === DisconnectReason.timedOut) {
        console.log(chalk.yellow('Koneksi Timeout, Menghubungkan Kembali...'));
        startAutoViewStatus();
      } else {
        console.log(chalk.red(`Alasan Disconnect Tidak Diketahui: ${reason}|${connection}`));
        startAutoViewStatus();
      }
    }
  });

  AutoViewStatusSocket.ev.on("creds.update", saveCreds);
  return AutoViewStatusSocket;
}

startAutoViewStatus();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update File: ${__filename}`));
  delete require.cache[file];
  require(file);
});