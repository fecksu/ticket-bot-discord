const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const ticketManager = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Perintah sistem tiket')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Buat tiket dukungan baru')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Tutup tiket saat ini')
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Alasan menutup tiket')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Buat panel tiket dengan tombol (Hanya Admin)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Periksa status tiket Anda')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-user')
                .setDescription('Tambahkan pengguna ke tiket ini')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Pengguna yang akan ditambahkan ke tiket')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await handleCreateTicket(interaction);
                break;
            case 'close':
                await handleCloseTicket(interaction);
                break;
            case 'panel':
                await handleCreatePanel(interaction);
                break;
            case 'status':
                await handleTicketStatus(interaction);
                break;
            case 'add-user':
                await handleAddUser(interaction);
                break;
        }
    }
};

async function handleCreateTicket(interaction) {
    // Check if user already has an active ticket
    const activeTickets = ticketManager.getUserActiveTickets(interaction.user.id);
    
    if (activeTickets.length >= config.ticket.maxTicketsPerUser) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Tidak Bisa Membuat Tiket')
            .setDescription(`Kamu sudah mempunyai ${activeTickets.length} tiket aktif. Tutup terlebih dahulu tiket yang ada untuk membuat yang baru.`)
            .addFields(
                activeTickets.map((ticket, index) => ({
                    name: `Tiket Aktif #${index + 1}`,
                    value: `**ID:** ${ticket.id}\n**Kategori:** ${ticket.category}\n**Channel:** <#${ticket.channelId}>`,
                    inline: true
                }))
            )
            .setTimestamp();

        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Create category selection menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Pilih kategori tiket...')
        .addOptions(
            Object.entries(config.ticket.categories).map(([key, category]) => ({
                label: category.label,
                description: category.description,
                value: key,
                emoji: category.emoji
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🎫 Buat Tiket')
        .setDescription('Tolong pilih kategori tiket yang sesuai dengan kebutuhanmu.')
        .setFooter({ text: 'Tiketmu akan segera dibuat setelah memilih kategori.' });

    await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

async function handleCloseTicket(interaction) {
    const ticket = ticketManager.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Bukan Channel Tiket')
            .setDescription('Perintah ini hanya bisa digunakan di channel tiket.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Check if user has permission to close the ticket
    const canClose = ticket.userId === interaction.user.id || 
                     interaction.member.permissions.has('ManageChannels') ||
                     config.ticket.supportRoles.some(roleId => interaction.member.roles.cache.has(roleId));

    if (!canClose) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Akses Ditolak')
            .setDescription('Kamu tidak punya akses untuk menutup tiket ini. Hanya pemilik tiket atau staff yang bisa menutupnya.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    const reason = interaction.options.getString('reason') || 'Tidak ada alasan yang diberikan.';

    // Create confirmation buttons
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_close_${ticket.id}`)
                .setLabel('Ya, Tutup Tiket')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_close')
                .setLabel('Batal')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Konfirmasi penutupan tiket')
        .setDescription(`Apa kamu yakin untuk menutup tiket?\n\n**Alasan:** ${reason}`)
        .setFooter({ text: 'Aksi ini tidak bisa dibatalkan.' });

    await interaction.reply({ embeds: [embed], components: [confirmRow] });
}

async function handleCreatePanel(interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Akses Ditolak')
            .setDescription('Kamu tidak punya akses untuk membuat panel tiket. Hanya admin yang bisa melakukaknnya.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Create ticket creation button
    const button = new ButtonBuilder()
        .setCustomId('create_ticket_panel')
        .setLabel('Buat Tiket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫');

    const row = new ActionRowBuilder().addComponents(button);

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🎫 Tiket Sistem')
        .setDescription('Butuh bantuan? Silahkan buat tiket dengan mengklik tombol dibawah\n\n' +
                       '**Kategori Tersediau:**\n' +
                       Object.values(config.ticket.categories)
                           .map(cat => `${cat.emoji} ${cat.label}`)
                           .join('\n'))
        .addFields([
            {
                name: '📋 How it works:',
                value: '1. Click the "Create Ticket" button\n' +
                       '2. Select your ticket category\n' +
                       '3. A private channel will be created for you\n' +
                       '4. Describe your issue and wait for support'
            }
        ])
        .setFooter({ text: 'Only create tickets for legitimate support needs.' });

    await interaction.channel.send({ embeds: [embed], components: [row] });
    
    const successEmbed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Ticket Panel Created')
        .setDescription('The ticket panel has been created successfully.');
    
    await interaction.reply({ embeds: [successEmbed], flags: 64 });
}

async function handleTicketStatus(interaction) {
    const userTickets = ticketManager.getUserTickets(interaction.user.id);
    
    if (userTickets.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📋 Your Ticket Status')
            .setDescription('You currently have no tickets.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    const activeTickets = userTickets.filter(ticket => ticket.status === 'open');
    const closedTickets = userTickets.filter(ticket => ticket.status === 'closed');

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📋 Your Ticket Status')
        .setDescription(`**Active Tickets:** ${activeTickets.length}\n**Closed Tickets:** ${closedTickets.length}`)
        .setTimestamp();

    if (activeTickets.length > 0) {
        embed.addFields([
            {
                name: '🟢 Active Tickets',
                value: activeTickets.map(ticket => 
                    `**${ticket.id}** - ${config.ticket.categories[ticket.category]?.label || ticket.category} (<#${ticket.channelId}>)`
                ).join('\n')
            }
        ]);
    }

    if (closedTickets.length > 0) {
        embed.addFields([
            {
                name: '🔴 Recent Closed Tickets',
                value: closedTickets.slice(-3).map(ticket => 
                    `**${ticket.id}** - ${config.ticket.categories[ticket.category]?.label || ticket.category} (Closed: <t:${Math.floor(ticket.closedAt / 1000)}:R>)`
                ).join('\n')
            }
        ]);
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleAddUser(interaction) {
    const ticket = ticketManager.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Bukan Channel Tiket')
            .setDescription('Perintah ini hanya bisa digunakan di channel tiket.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Check if user has permission to add users to the ticket
    const canAddUser = ticket.userId === interaction.user.id || 
                       interaction.member.permissions.has('ManageChannels') ||
                       config.ticket.supportRoles.some(roleId => interaction.member.roles.cache.has(roleId));

    if (!canAddUser) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Akses Ditolak')
            .setDescription('Hanya pembuat tiket atau staff support yang dapat menambahkan pengguna ke tiket.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    const userToAdd = interaction.options.getUser('user');
    const memberToAdd = await interaction.guild.members.fetch(userToAdd.id).catch(() => null);
    
    if (!memberToAdd) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Pengguna Tidak Ditemukan')
            .setDescription('Pengguna yang dimaksud tidak ditemukan di server ini.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Check if user is already in the ticket
    const channel = interaction.channel;
    const existingPermissions = channel.permissionOverwrites.cache.get(userToAdd.id);
    
    if (existingPermissions && existingPermissions.allow.has('ViewChannel')) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle('⚠️ Pengguna Sudah Ada')
            .setDescription(`<@${userToAdd.id}> sudah memiliki akses ke tiket ini.`);
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    try {
        // Add user to ticket channel
        await channel.permissionOverwrites.create(userToAdd.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        });

        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Pengguna Ditambahkan')
            .setDescription(`<@${userToAdd.id}> berhasil ditambahkan ke tiket ini.`)
            .addFields([
                { name: 'ID Tiket', value: ticket.id, inline: true },
                { name: 'Ditambahkan oleh', value: `<@${interaction.user.id}>`, inline: true }
            ])
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Send notification message to the channel
        const notificationEmbed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('👥 Pengguna Ditambahkan ke Tiket')
            .setDescription(`<@${userToAdd.id}> telah ditambahkan ke tiket ini oleh <@${interaction.user.id}>.`)
            .setTimestamp();

        await channel.send({ 
            content: `<@${userToAdd.id}>`, 
            embeds: [notificationEmbed] 
        });

        // Log the addition if log channel is configured
        if (config.ticket.logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(config.ticket.logChannelId);
            if (logChannel) {
                const categoryInfo = config.ticket.categories[ticket.category];
                const logEmbed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('👥 Pengguna Ditambahkan ke Tiket')
                    .addFields([
                        { name: 'ID Tiket', value: ticket.id, inline: true },
                        { name: 'Kategori', value: categoryInfo?.label || ticket.category, inline: true },
                        { name: 'Channel', value: `<#${ticket.channelId}>`, inline: true },
                        { name: 'Pengguna Ditambahkan', value: `<@${userToAdd.id}>`, inline: true },
                        { name: 'Ditambahkan oleh', value: `<@${interaction.user.id}>`, inline: true }
                    ])
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        }

    } catch (error) {
        console.error('Error adding user to ticket:', error);
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Error')
            .setDescription('Terjadi kesalahan saat menambahkan pengguna ke tiket. Silakan coba lagi.');

        await interaction.reply({ embeds: [embed], flags: 64 });
    }
    }
                             
