const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionResponseType } = require('discord.js');
const config = require('../config');
const ticketManager = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Perintah admin untuk manajemen tiket')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Lihat statistik tiket')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Daftar semua tiket aktif')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-close')
                .setDescription('Paksa tutup tiket berdasarkan ID')
                .addStringOption(option =>
                    option
                        .setName('ticket-id')
                        .setDescription('ID tiket yang akan ditutup')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Alasan untuk penutupan paksa')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user-tickets')
                .setDescription('Lihat tiket untuk pengguna tertentu')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Pengguna yang akan diperiksa tiketnya')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Bersihkan channel tiket yang sudah ditutup')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-transcript-channel')
                .setDescription('Atur channel untuk transkrip tiket')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel untuk menyimpan transkrip tiket')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-category')
                .setDescription('Atur kategori Discord untuk jenis tiket tertentu')
                .addStringOption(option =>
                    option
                        .setName('ticket-type')
                        .setDescription('Jenis tiket')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Report Player', value: 'support' },
                            { name: 'Report Staff', value: 'bug' },
                            { name: 'Unban Request', value: 'feature' },
                            { name: 'Asset Refund', value: 'other' }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName('category')
                        .setDescription('Kategori Discord tempat tiket akan dibuat')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-color')
                .setDescription('Atur warna utama server untuk embed tiket')
                .addStringOption(option =>
                    option
                        .setName('color')
                        .setDescription('Kode warna hex (contoh: #FF5733 atau FF5733)')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        // Check permissions
        if (!interaction.member.permissions.has('ManageChannels') && 
            !config.ticket.supportRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('❌ Akses Ditolak')
                .setDescription('Anda memerlukan izin Manage Channels atau peran support untuk menggunakan perintah admin.');
            
            return await interaction.reply({ embeds: [embed], flags: 64 });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'stats':
                await handleStats(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'force-close':
                await handleForceClose(interaction);
                break;
            case 'user-tickets':
                await handleUserTickets(interaction);
                break;
            case 'cleanup':
                await handleCleanup(interaction);
                break;
            case 'set-transcript-channel':
                await handleSetTranscriptChannel(interaction);
                break;
            case 'set-category':
                await handleSetCategory(interaction);
                break;
            case 'set-color':
                await handleSetColor(interaction);
                break;
        }
    }
};

async function handleStats(interaction) {
    const allTickets = ticketManager.getAllTickets();
    const activeTickets = allTickets.filter(ticket => ticket.status === 'open');
    const closedTickets = allTickets.filter(ticket => ticket.status === 'closed');
    
    // Calculate statistics
    const totalTickets = allTickets.length;
    const todayTickets = allTickets.filter(ticket => {
        const today = new Date();
        const ticketDate = new Date(ticket.createdAt);
        return ticketDate.toDateString() === today.toDateString();
    }).length;

    // Category breakdown
    const categoryStats = {};
    allTickets.forEach(ticket => {
        categoryStats[ticket.category] = (categoryStats[ticket.category] || 0) + 1;
    });

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📊 Ticket Statistics')
        .addFields([
            {
                name: '📈 Overview',
                value: `**Total Tickets:** ${totalTickets}\n` +
                       `**Active:** ${activeTickets.length}\n` +
                       `**Closed:** ${closedTickets.length}\n` +
                       `**Today:** ${todayTickets}`,
                inline: true
            },
            {
                name: '📂 Categories',
                value: Object.entries(categoryStats)
                    .map(([category, count]) => {
                        const categoryInfo = config.ticket.categories[category];
                        const label = categoryInfo ? categoryInfo.label : category;
                        return `**${label}:** ${count}`;
                    })
                    .join('\n') || 'No tickets yet',
                inline: true
            }
        ])
        .setTimestamp()
        .setFooter({ text: 'Admin Statistics' });

    await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleList(interaction) {
    const activeTickets = ticketManager.getActiveTickets();
    
    if (activeTickets.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📋 Active Tickets')
            .setDescription('No active tickets at the moment.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    const ticketList = activeTickets.slice(0, 10).map(ticket => {
        const category = config.ticket.categories[ticket.category];
        const createdAt = new Date(ticket.createdAt);
        return `**${ticket.id}** - ${category?.emoji || '🎫'} ${category?.label || ticket.category}\n` +
               `└ <@${ticket.userId}> • <#${ticket.channelId}> • <t:${Math.floor(createdAt.getTime() / 1000)}:R>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📋 Active Tickets')
        .setDescription(ticketList)
        .setFooter({ 
            text: `Showing ${Math.min(activeTickets.length, 10)} of ${activeTickets.length} active tickets` 
        });

    await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleForceClose(interaction) {
    const ticketId = interaction.options.getString('ticket-id');
    const reason = interaction.options.getString('reason') || 'Force closed by admin';
    
    const ticket = ticketManager.getTicketById(ticketId);
    
    if (!ticket) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Ticket Not Found')
            .setDescription(`No ticket found with ID: **${ticketId}**`);
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (ticket.status === 'closed') {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Ticket Already Closed')
            .setDescription(`Ticket **${ticketId}** is already closed.`);
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    try {
        await ticketManager.closeTicket(ticket.id, interaction.user.id, reason, interaction.client);
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Ticket Force Closed')
            .setDescription(`Ticket **${ticketId}** has been force closed.\n**Reason:** ${reason}`)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
        
    } catch (error) {
        console.error('Error force closing ticket:', error);
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Error')
            .setDescription('An error occurred while closing the ticket. Please try again.');
        
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
}

async function handleUserTickets(interaction) {
    const user = interaction.options.getUser('user');
    const userTickets = ticketManager.getUserTickets(user.id);
    
    if (userTickets.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`📋 Tickets for ${user.displayName}`)
            .setDescription('This user has no tickets.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    const activeTickets = userTickets.filter(ticket => ticket.status === 'open');
    const closedTickets = userTickets.filter(ticket => ticket.status === 'closed');

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`📋 Tickets for ${user.displayName}`)
        .setDescription(`**Total:** ${userTickets.length} | **Active:** ${activeTickets.length} | **Closed:** ${closedTickets.length}`);

    if (activeTickets.length > 0) {
        const activeList = activeTickets.map(ticket => {
            const category = config.ticket.categories[ticket.category];
            return `**${ticket.id}** - ${category?.label || ticket.category} (<#${ticket.channelId}>)`;
        }).join('\n');
        
        embed.addFields([
            { name: '🟢 Active Tickets', value: activeList }
        ]);
    }

    if (closedTickets.length > 0) {
        const closedList = closedTickets.slice(-5).map(ticket => {
            const category = config.ticket.categories[ticket.category];
            return `**${ticket.id}** - ${category?.label || ticket.category} (Closed: <t:${Math.floor(ticket.closedAt / 1000)}:R>)`;
        }).join('\n');
        
        embed.addFields([
            { name: '🔴 Recent Closed Tickets', value: closedList }
        ]);
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleCleanup(interaction) {
    await interaction.deferReply({ flags: 64 });
    
    const closedTickets = ticketManager.getClosedTickets();
    let cleanedCount = 0;
    
    for (const ticket of closedTickets) {
        try {
            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
                // Delete the channel if it still exists
                await channel.delete('Ticket cleanup');
                cleanedCount++;
            }
        } catch (error) {
            console.error(`Error cleaning up channel ${ticket.channelId}:`, error);
        }
    }

    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🧹 Cleanup Complete')
        .setDescription(`Cleaned up ${cleanedCount} closed ticket channels.`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleSetTranscriptChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    
    // Check if the channel is a text channel
    if (channel.type !== 0) { // 0 = GUILD_TEXT
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Channel Tidak Valid')
            .setDescription('Channel transkrip harus berupa text channel.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Update config (in a real application, you might want to store this in a database)
    config.ticket.transcriptChannelId = channel.id;
    
    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Channel Transkrip Diatur')
        .setDescription(`Channel transkrip berhasil diatur ke <#${channel.id}>.`)
        .addFields([
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'ID Channel', value: channel.id, inline: true }
        ])
        .setFooter({ text: 'Transkrip tiket akan disimpan di channel ini saat tiket ditutup.' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: 64 });
    
    console.log(`✅ Transcript channel set to ${channel.name} (${channel.id})`);
}

async function handleSetCategory(interaction) {
    const ticketType = interaction.options.getString('ticket-type');
    const category = interaction.options.getChannel('category');
    
    // Check if the channel is a category
    if (category.type !== 4) { // 4 = GUILD_CATEGORY
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Channel Tidak Valid')
            .setDescription('Channel yang dipilih harus berupa kategori (category channel).');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Update config (in a real application, you might want to store this in a database)
    if (config.ticket.categories[ticketType]) {
        config.ticket.categories[ticketType].categoryId = category.id;
    }
    
    const ticketTypeInfo = config.ticket.categories[ticketType];
    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Kategori Tiket Diatur')
        .setDescription(`Kategori untuk **${ticketTypeInfo.label}** berhasil diatur.`)
        .addFields([
            { name: 'Jenis Tiket', value: ticketTypeInfo.label, inline: true },
            { name: 'Kategori Discord', value: category.name, inline: true },
            { name: 'ID Kategori', value: category.id, inline: true }
        ])
        .setFooter({ text: 'Tiket baru untuk jenis ini akan dibuat di kategori yang dipilih.' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: 64 });
    
    console.log(`✅ Category for ${ticketType} set to ${category.name} (${category.id})`);
}

async function handleSetColor(interaction) {
    let colorInput = interaction.options.getString('color');
    
    // Remove # if present
    if (colorInput.startsWith('#')) {
        colorInput = colorInput.substring(1);
    }
    
    // Validate hex color
    const hexPattern = /^[0-9A-Fa-f]{6}$/;
    if (!hexPattern.test(colorInput)) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Format Warna Tidak Valid')
            .setDescription('Silakan masukkan kode warna hex yang valid.\n\n**Contoh format yang benar:**\n• `FF5733`\n• `#FF5733`\n• `5865F2`\n• `#5865F2`');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }
    
    // Convert hex to decimal
    const colorDecimal = parseInt(colorInput, 16);
    
    // Update config
    config.colors.primary = colorDecimal;
    
    const embed = new EmbedBuilder()
        .setColor(colorDecimal)
        .setTitle('✅ Warna Server Diatur')
        .setDescription(`Warna utama server berhasil diatur ke **#${colorInput.toUpperCase()}**.`)
        .addFields([
            { name: 'Kode Hex', value: `#${colorInput.toUpperCase()}`, inline: true },
            { name: 'Nilai Decimal', value: colorDecimal.toString(), inline: true },
            { name: 'Preview', value: 'Embed ini menggunakan warna baru!', inline: false }
        ])
        .setFooter({ text: 'Warna ini akan digunakan untuk semua embed panel tiket.' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: 64 });
    
    console.log(`✅ Server main color set to #${colorInput.toUpperCase()} (${colorDecimal})`);
}

                                 
