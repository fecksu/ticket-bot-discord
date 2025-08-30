const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../config');
const ticketManager = require('../utils/ticketManager');

module.exports = {
    async handleInteraction(client, interaction) {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(client, interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(client, interaction);
        } else if (interaction.isButton()) {
            await handleButton(client, interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(client, interaction);
        }
    }
};

async function handleSlashCommand(client, interaction) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Error Perintah')
            .setDescription('Terjadi kesalahan saat menjalankan perintah ini.');

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    }
}

async function handleSelectMenu(client, interaction) {
    if (interaction.customId === 'ticket_category_select') {
        await handleCategorySelection(client, interaction);
    }
}

async function handleButton(client, interaction) {
    if (interaction.customId === 'create_ticket_panel') {
        await handleTicketPanelClick(client, interaction);
    } else if (interaction.customId.startsWith('confirm_close_')) {
        await handleConfirmClose(client, interaction);
    } else if (interaction.customId === 'cancel_close') {
        await handleCancelClose(interaction);
    }
}

async function handleCategorySelection(client, interaction) {
    const category = interaction.values[0];
    
    // Double-check if user still has no active tickets
    const activeTickets = ticketManager.getUserActiveTickets(interaction.user.id);
    
    if (activeTickets.length >= config.ticket.maxTicketsPerUser) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Tidak Dapat Membuat Tiket')
            .setDescription('Anda sudah memiliki tiket aktif. Silakan tutup dulu sebelum membuat yang baru.');

        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Show modal based on category
    await showCategoryModal(interaction, category);
}

async function handleTicketPanelClick(client, interaction) {
    // Check if user already has an active ticket
    const activeTickets = ticketManager.getUserActiveTickets(interaction.user.id);
    
    if (activeTickets.length >= config.ticket.maxTicketsPerUser) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Tidak Dapat Membuat Tiket')
            .setDescription(`Anda sudah memiliki ${activeTickets.length} tiket aktif. Silakan tutup tiket yang ada sebelum membuat yang baru.`)
            .addFields(
                activeTickets.map((ticket, index) => ({
                    name: `Active Ticket #${index + 1}`,
                    value: `**ID:** ${ticket.id}\n**Category:** ${config.ticket.categories[ticket.category]?.label || ticket.category}\n**Channel:** <#${ticket.channelId}>`,
                    inline: true
                }))
            )
            .setTimestamp();

        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Create category selection menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Select a ticket category...')
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
        .setTitle('🎫 Create Support Ticket')
        .setDescription('Please select a category for your ticket:')
        .setFooter({ text: 'Your ticket will be created in a private channel.' });

    await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

async function handleConfirmClose(client, interaction) {
    const ticketId = interaction.customId.split('_')[2];
    const ticket = ticketManager.getTicketById(ticketId);
    
    if (!ticket) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Ticket Not Found')
            .setDescription('This ticket no longer exists.');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Check if ticket is already closed
    if (ticket.status === 'closed') {
        const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle('⚠️ Ticket Already Closed')
            .setDescription(`This ticket was already closed on <t:${Math.floor(ticket.closedAt / 1000)}:F>.`);
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    await interaction.deferReply();

    try {
        await ticketManager.closeTicket(ticketId, interaction.user.id, 'Closed by user', client);
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Ticket Closed')
            .setDescription(`Ticket **${ticketId}** has been closed successfully.`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error closing ticket:', error);
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Error Closing Ticket')
            .setDescription('There was an error closing the ticket. Please try again.');

        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleCancelClose(interaction) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('❌ Closure Cancelled')
        .setDescription('Ticket closure has been cancelled.');

    await interaction.update({ embeds: [embed], components: [] });
}

async function showCategoryModal(interaction, category) {
    const categoryInfo = config.ticket.categories[category];
    
    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${category}`)
        .setTitle(`${categoryInfo.label} - Buat Tiket`);

    let inputs = [];

    // Different modal content based on category
    switch (category) {
        case 'support': // Report Player
            inputs = [
                new TextInputBuilder()
                    .setCustomId('player_name')
                    .setLabel('Nama Player yang Dilaporkan')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Masukkan nama player...')
                    .setRequired(true)
                    .setMaxLength(50),
                new TextInputBuilder()
                    .setCustomId('violation_type')
                    .setLabel('Jenis Pelanggaran')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Contoh: Cheating, Griefing, Toxic, dll.')
                    .setRequired(true)
                    .setMaxLength(100),
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Deskripsi Detail Kejadian')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Jelaskan secara detail apa yang terjadi...')
                    .setRequired(true)
                    .setMaxLength(1000),
                new TextInputBuilder()
                    .setCustomId('evidence')
                    .setLabel('Bukti (Link Screenshot/Video)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Link ke screenshot atau video (opsional)')
                    .setRequired(false)
                    .setMaxLength(200)
            ];
            break;

        case 'bug': // Report Staff
            inputs = [
                new TextInputBuilder()
                    .setCustomId('staff_name')
                    .setLabel('Nama Staff yang Dilaporkan')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Masukkan nama staff...')
                    .setRequired(true)
                    .setMaxLength(50),
                new TextInputBuilder()
                    .setCustomId('staff_rank')
                    .setLabel('Rank/Posisi Staff')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Contoh: Helper, Moderator, Admin, dll.')
                    .setRequired(true)
                    .setMaxLength(50),
                new TextInputBuilder()
                    .setCustomId('incident_description')
                    .setLabel('Deskripsi Kejadian')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Jelaskan secara detail apa yang dilakukan staff tersebut...')
                    .setRequired(true)
                    .setMaxLength(1000),
                new TextInputBuilder()
                    .setCustomId('evidence')
                    .setLabel('Bukti (Link Screenshot/Video)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Link ke screenshot atau video (opsional)')
                    .setRequired(false)
                    .setMaxLength(200)
            ];
            break;

        case 'feature': // Unban Request
            inputs = [
                new TextInputBuilder()
                    .setCustomId('banned_username')
                    .setLabel('Username yang Di-ban')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Masukkan username yang di-ban...')
                    .setRequired(true)
                    .setMaxLength(50),
                new TextInputBuilder()
                    .setCustomId('ban_reason')
                    .setLabel('Alasan Ban (Jika Diketahui)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Alasan kenapa di-ban...')
                    .setRequired(false)
                    .setMaxLength(100),
                new TextInputBuilder()
                    .setCustomId('unban_reason')
                    .setLabel('Alasan Permintaan Unban')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Jelaskan mengapa Anda merasa harus di-unban...')
                    .setRequired(true)
                    .setMaxLength(1000),
                new TextInputBuilder()
                    .setCustomId('promise')
                    .setLabel('Janji/Komitmen')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Apa yang akan Anda lakukan agar tidak melanggar lagi...')
                    .setRequired(true)
                    .setMaxLength(500)
            ];
            break;

        case 'other': // Asset Refund
            inputs = [
                new TextInputBuilder()
                    .setCustomId('lost_items')
                    .setLabel('Item/Asset yang Hilang')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Sebutkan item yang hilang...')
                    .setRequired(true)
                    .setMaxLength(100),
                new TextInputBuilder()
                    .setCustomId('loss_cause')
                    .setLabel('Penyebab Kehilangan')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Contoh: Bug, Server lag, Rollback, dll.')
                    .setRequired(true)
                    .setMaxLength(100),
                new TextInputBuilder()
                    .setCustomId('incident_time')
                    .setLabel('Waktu Kejadian')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Kapan kejadian ini terjadi...')
                    .setRequired(true)
                    .setMaxLength(100),
                new TextInputBuilder()
                    .setCustomId('additional_info')
                    .setLabel('Informasi Tambahan')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Detail tambahan yang perlu diketahui...')
                    .setRequired(false)
                    .setMaxLength(500)
            ];
            break;
    }

    // Add inputs to modal (Discord allows max 5 components per action row, and max 5 action rows)
    const actionRows = [];
    for (let i = 0; i < inputs.length; i++) {
        actionRows.push(new ActionRowBuilder().addComponents(inputs[i]));
    }

    modal.addComponents(...actionRows);
    await interaction.showModal(modal);
}

async function handleModalSubmit(client, interaction) {
    if (!interaction.customId.startsWith('ticket_modal_')) return;

    const category = interaction.customId.replace('ticket_modal_', '');
    
    // Check if user still has no active tickets
    const activeTickets = ticketManager.getUserActiveTickets(interaction.user.id);
    
    if (activeTickets.length >= config.ticket.maxTicketsPerUser) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Tidak Dapat Membuat Tiket')
            .setDescription('Anda sudah memiliki tiket aktif. Silakan tutup dulu sebelum membuat yang baru.');

        return await interaction.reply({ embeds: [embed], flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
        // Create ticket with modal data
        const ticket = await ticketManager.createTicketWithDetails(
            interaction.user.id,
            interaction.guild.id,
            category,
            interaction.fields,
            client
        );

        const categoryInfo = config.ticket.categories[category];
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Tiket Berhasil Dibuat')
            .setDescription(`Tiket **${categoryInfo.label}** Anda telah dibuat!`)
            .addFields([
                { name: 'ID Tiket', value: ticket.id, inline: true },
                { name: 'Kategori', value: categoryInfo.label, inline: true },
                { name: 'Channel', value: `<#${ticket.channelId}>`, inline: true }
            ])
            .setFooter({ text: 'Staff akan segera menangani tiket Anda.' });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error creating ticket:', error);
        
        const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('❌ Error Membuat Tiket')
            .setDescription('Terjadi kesalahan saat membuat tiket. Silakan coba lagi atau hubungi administrator.');

        await interaction.editReply({ embeds: [embed] });
    }
}
