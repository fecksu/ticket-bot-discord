const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('./config');
const express = require("express");
const commandHandler = require('./handlers/commandHandler');
const interactionHandler = require('./handlers/interactionHandler');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize collections
client.commands = new Collection();

// Load commands
commandHandler.loadCommands(client);

// Create HTTP server for web preview
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

// Start web server on port 5000
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web preview server started on http://0.0.0.0:${PORT}`);
});

// Event handlers
client.once('clientReady', async () => {
    // Display startup preview
    console.log('\n' + '='.repeat(60));
    console.log('🎫 SANTARA TICKET BOT - DISCORD TICKET SYSTEM');
    console.log('='.repeat(60));
    console.log(`✅ Bot online sebagai: ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
    console.log(`👥 Users: ${client.users.cache.size}`);
    console.log('='.repeat(60));
    
    // Show available commands
    console.log('📋 AVAILABLE COMMANDS:');
    console.log('');
    console.log('🔧 ADMIN COMMANDS (/admin):');
    console.log('  • stats - Lihat statistik tiket');
    console.log('  • list - Daftar semua tiket aktif');
    console.log('  • force-close - Paksa tutup tiket');
    console.log('  • user-tickets - Lihat tiket pengguna');
    console.log('  • cleanup - Bersihkan channel tiket');
    console.log('  • set-transcript-channel - Atur channel transkrip');
    console.log('  • set-category - Atur kategori tiket');
    console.log('  • set-color - Atur warna embed');
    console.log('');
    console.log('🎫 TICKET COMMANDS (/ticket):');
    console.log('  • create - Buat tiket baru');
    console.log('  • close - Tutup tiket');
    console.log('  • panel - Buat panel tiket (Admin)');
    console.log('  • status - Cek status tiket');
    console.log('  • add-user - Tambah user ke tiket');
    console.log('');
    console.log('📂 TICKET CATEGORIES:');
    console.log('  🛡️ Report Player');
    console.log('  ⚠️ Report Staff');
    console.log('  🔓 Unban Request');
    console.log('  💰 Asset Refund');
    console.log('');
    console.log('='.repeat(60));
    console.log(`🔗 Invite Link:`);
    console.log(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
    console.log('='.repeat(60));
    
    // Register slash commands
    try {
        console.log('🔄 Mendaftarkan slash commands...');
        await client.application.commands.set([...client.commands.values()].map(command => command.data));
        console.log('✅ Slash commands berhasil didaftarkan');
        console.log('🚀 Bot siap digunakan!');
        console.log('='.repeat(60) + '\n');
    } catch (error) {
        console.error('❌ Error mendaftarkan slash commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    await interactionHandler.handleInteraction(client, interaction);
});

// Error handling
client.on('error', console.error);
client.on('warn', console.warn);

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// ==== KEEP ALIVE SERVER ====
const app = express();
app.get("/", (req, res) => {
  res.send("Bot is alive!");
});
app.listen(3000, () => {
  console.log("Web server running on port 3000");
});

// Login with bot token
const token = process.env.DISCORD_TOKEN || config.token;
if (!token) {
    console.error('❌ Token bot tidak tersedia. Silakan atur DISCORD_TOKEN environment variable atau update config.js');
    process.exit(1);
}

client.login(token);
                                 
