#!/usr/bin/env node

const chalk = require('chalk');
const moment = require('moment-timezone');

const autoViewStatus = (m, bot) => {
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    m.sender = bot.decodeJid((m.fromMe && bot.user.id) || m.participant || m.key.participant || m.chat);

    if (!m.message || m.isStatusViewed) return;

    if (autoViewStatus && m.chat.endsWith('status@broadcast')) {
        bot.readMessages([m.key]);
        m.isStatusViewed = true;

        if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
            const tanggal = moment().tz('Asia/Jakarta').format('DD-MM-YYYY');
            const waktu = moment().tz('Asia/Jakarta').format('HH:mm');
            console.log(chalk.red(`[${tanggal}, ${waktu} WIB]\nStatus dari nomor ${m.sender.split('@')[0]} telah dihapus.`));
            return;
        }

        const tanggal = moment().tz('Asia/Jakarta').format('DD-MM-YYYY');
        const waktu = moment().tz('Asia/Jakarta').format('HH:mm');
        console.log(chalk.blue(`[${tanggal}, ${waktu} WIB]\nBerhasil Melihat Status Dari Nomor ${m.sender.split('@')[0]}`));
    }
};

module.exports = autoViewStatus;