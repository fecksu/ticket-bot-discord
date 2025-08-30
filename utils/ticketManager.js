const { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const database = require('./database');

class TicketManager {
    constructor() {
        this.tickets = database.loadTickets();
    }

    generateTicketId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `ticket-${timestamp}-${random}`;
    }

    async createTicket(userId, guildId, category, client) {
        const ticketId = this.generateTicketId();
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        // Get user
        const user = await guild.members.fetch(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Create ticket channel
        const categoryInfo = config.ticket.categories[category];
        const channelName = `ticket-${user.user.username}-${ticketId.split('-')[1]}`;
        
        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        };

        // Add category - first check specific category for ticket type, then fallback to general category
        const ticketCategoryInfo = config.ticket.categories[category];
        if (ticketCategoryInfo && ticketCategoryInfo.categoryId) {
            channelOptions.parent = ticketCategoryInfo.categoryId;
        } else if (config.ticket.categoryId) {
            channelOptions.parent = config.ticket.categoryId;
        }

        // Add support roles permissions
        config.ticket.supportRoles.forEach(roleId => {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                channelOptions.permissionOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages
                    ]
                });
            }
        });

        const channel = await guild.channels.create(channelOptions);

        // Create ticket object
        const ticket = {
            id: ticketId,
            userId: userId,
            guildId: guildId,
            channelId: channel.id,
            category: category,
            status: 'open',
            createdAt: Date.now(),
            closedAt: null,
            closedBy: null,
            closeReason: null
        };

        // Save ticket
        this.tickets.push(ticket);
        database.saveTickets(this.tickets);

        // Send initial message in ticket channel
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`🎫 ${categoryInfo.label}`)
            .setDescription(`Hello <@${userId}>! Thank you for creating a support ticket.\n\n` +
                           `**Ticket ID:** ${ticketId}\n` +
                           `**Category:** ${categoryInfo.label}\n\n` +
                           `Please describe your issue in detail. A support team member will assist you shortly.`)
            .addFields([
                {
                    name: '📝 Guidelines',
                    value: '• Be clear and detailed about your issue\n' +
                           '• Provide screenshots if applicable\n' +
                           '• Be patient while waiting for a response\n' +
                           '• Use `/ticket close` when your issue is resolved'
                }
            ])
            .setFooter({ text: 'Sistem Tiket Dukungan' })
            .setTimestamp();

        const closeButton = new ButtonBuilder()
            .setCustomId(`confirm_close_${ticketId}`)
            .setLabel('Tutup Tiket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const row = new ActionRowBuilder().addComponents(closeButton);

        await channel.send({ 
            content: `<@${userId}>`, 
            embeds: [embed], 
            components: [row] 
        });

        // Log ticket creation
        if (config.ticket.logChannelId) {
            const logChannel = guild.channels.cache.get(config.ticket.logChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('🎫 New Ticket Created')
                    .addFields([
                        { name: 'User', value: `<@${userId}>`, inline: true },
                        { name: 'Ticket ID', value: ticketId, inline: true },
                        { name: 'Category', value: categoryInfo.label, inline: true },
                        { name: 'Channel', value: `<#${channel.id}>`, inline: true }
                    ])
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        }

        return ticket;
    }

    async closeTicket(ticketId, closedBy, reason, client) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        
        if (!ticket || ticket.status === 'closed') {
            throw new Error('Ticket not found or already closed');
        }

        // Update ticket
        ticket.status = 'closed';
        ticket.closedAt = Date.now();
        ticket.closedBy = closedBy;
        ticket.closeReason = reason;

        // Save to database
        database.saveTickets(this.tickets);

        const guild = client.guilds.cache.get(ticket.guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(ticket.channelId);
        if (!channel) return;

        // Create transcript before deleting
        await this.createTranscript(ticket, channel, guild, client);

        // Send closure message
        const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle('🔒 Tiket Ditutup')
            .setDescription(`Tiket ini telah ditutup oleh <@${closedBy}>.\n\n**Alasan:** ${reason}`)
            .addFields([
                { name: 'ID Tiket', value: ticket.id, inline: true },
                { name: 'Ditutup Pada', value: `<t:${Math.floor(ticket.closedAt / 1000)}:F>`, inline: true }
            ])
            .setFooter({ text: 'Channel ini akan dihapus dalam 30 detik.' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });

        // Log ticket closure
        if (config.ticket.logChannelId) {
            const logChannel = guild.channels.cache.get(config.ticket.logChannelId);
            if (logChannel) {
                const categoryInfo = config.ticket.categories[ticket.category];
                const logEmbed = new EmbedBuilder()
                    .setColor(config.colors.warning)
                    .setTitle('🔒 Tiket Ditutup')
                    .addFields([
                        { name: 'ID Tiket', value: ticket.id, inline: true },
                        { name: 'Kategori', value: categoryInfo?.label || ticket.category, inline: true },
                        { name: 'Pengguna', value: `<@${ticket.userId}>`, inline: true },
                        { name: 'Ditutup Oleh', value: `<@${closedBy}>`, inline: true },
                        { name: 'Alasan', value: reason, inline: false }
                    ])
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        }

        // Delete channel after 30 seconds
        setTimeout(async () => {
            try {
                await channel.delete('Tiket ditutup');
            } catch (error) {
                console.error('Error deleting ticket channel:', error);
            }
        }, 30000);

        return ticket;
    }

    async createTicketWithDetails(userId, guildId, category, modalFields, client) {
        const ticketId = this.generateTicketId();
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        // Get user
        const user = await guild.members.fetch(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Create ticket channel
        const categoryInfo = config.ticket.categories[category];
        const channelName = `ticket-${user.user.username}-${ticketId.split('-')[1]}`;
        
        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        };

        // Add category - first check specific category for ticket type, then fallback to general category
        const ticketCategoryInfo = config.ticket.categories[category];
        if (ticketCategoryInfo && ticketCategoryInfo.categoryId) {
            channelOptions.parent = ticketCategoryInfo.categoryId;
        } else if (config.ticket.categoryId) {
            channelOptions.parent = config.ticket.categoryId;
        }

        // Add support roles permissions
        config.ticket.supportRoles.forEach(roleId => {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                channelOptions.permissionOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages
                    ]
                });
            }
        });

        const channel = await guild.channels.create(channelOptions);

        // Create ticket object
        const ticket = {
            id: ticketId,
            userId: userId,
            guildId: guildId,
            channelId: channel.id,
            category: category,
            status: 'open',
            createdAt: Date.now(),
            closedAt: null,
            closedBy: null,
            closeReason: null
        };

        // Save ticket
        this.tickets.push(ticket);
        database.saveTickets(this.tickets);

        // Format modal data based on category
        let formattedData = this.formatModalData(category, modalFields);

        // Send initial message in ticket channel
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`${categoryInfo.emoji} ${categoryInfo.label}`)
            .setDescription(`Halo <@${userId}>! Tiket dukungan Anda telah dibuat.\n\n` +
                           `**ID Tiket:** ${ticketId}\n` +
                           `**Kategori:** ${categoryInfo.label}\n\n` +
                           `Tim dukungan akan segera membantu Anda.`)
            .addFields([
                {
                    name: '📝 Panduan',
                    value: '• Berikan informasi tambahan jika diperlukan\n' +
                           '• Sertakan tangkapan layar jika ada\n' +
                           '• Bersabar saat menunggu respons\n' +
                           '• Gunakan `/ticket close` saat masalah selesai'
                }
            ])
            .setFooter({ text: 'Sistem Tiket Dukungan' })
            .setTimestamp();

        const closeButton = new ButtonBuilder()
            .setCustomId(`confirm_close_${ticketId}`)
            .setLabel('Tutup Tiket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const row = new ActionRowBuilder().addComponents(closeButton);

        await channel.send({ 
            content: `<@${userId}>`, 
            embeds: [embed], 
            components: [row] 
        });

        // Send formatted data from modal
        if (formattedData) {
            await channel.send({ embeds: [formattedData] });
        }

        // Log ticket creation
        if (config.ticket.logChannelId) {
            const logChannel = guild.channels.cache.get(config.ticket.logChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('🎫 Tiket Baru Dibuat')
                    .addFields([
                        { name: 'Pengguna', value: `<@${userId}>`, inline: true },
                        { name: 'ID Tiket', value: ticketId, inline: true },
                        { name: 'Kategori', value: categoryInfo.label, inline: true },
                        { name: 'Channel', value: `<#${channel.id}>`, inline: true }
                    ])
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        }

        return ticket;
    }

    formatModalData(category, modalFields) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📋 Informasi Tiket');

        switch (category) {
            case 'support': // Report Player
                embed.setDescription('**Laporan Player**')
                    .addFields([
                        { name: '👤 Player yang Dilaporkan', value: modalFields.getTextInputValue('player_name'), inline: true },
                        { name: '⚠️ Jenis Pelanggaran', value: modalFields.getTextInputValue('violation_type'), inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: '📝 Deskripsi Kejadian', value: modalFields.getTextInputValue('description'), inline: false }
                    ]);
                
                const evidence = modalFields.getTextInputValue('evidence');
                if (evidence) {
                    embed.addFields([{ name: '📎 Bukti', value: evidence, inline: false }]);
                }
                break;

            case 'bug': // Report Staff
                embed.setDescription('**Laporan Staff**')
                    .addFields([
                        { name: '👨‍💼 Staff yang Dilaporkan', value: modalFields.getTextInputValue('staff_name'), inline: true },
                        { name: '🏆 Rank/Posisi', value: modalFields.getTextInputValue('staff_rank'), inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: '📝 Deskripsi Kejadian', value: modalFields.getTextInputValue('incident_description'), inline: false }
                    ]);
                
                const staffEvidence = modalFields.getTextInputValue('evidence');
                if (staffEvidence) {
                    embed.addFields([{ name: '📎 Bukti', value: staffEvidence, inline: false }]);
                }
                break;

            case 'feature': // Unban Request
                embed.setDescription('**Permintaan Unban**')
                    .addFields([
                        { name: '👤 Username yang Di-ban', value: modalFields.getTextInputValue('banned_username'), inline: true },
                        { name: '📝 Alasan Permintaan Unban', value: modalFields.getTextInputValue('unban_reason'), inline: false },
                        { name: '🤝 Janji/Komitmen', value: modalFields.getTextInputValue('promise'), inline: false }
                    ]);
                
                const banReason = modalFields.getTextInputValue('ban_reason');
                if (banReason) {
                    embed.addFields([{ name: '⚖️ Alasan Ban', value: banReason, inline: true }]);
                }
                break;

            case 'other': // Asset Refund
                embed.setDescription('**Permintaan Refund Asset**')
                    .addFields([
                        { name: '📦 Item/Asset yang Hilang', value: modalFields.getTextInputValue('lost_items'), inline: true },
                        { name: '💥 Penyebab Kehilangan', value: modalFields.getTextInputValue('loss_cause'), inline: true },
                        { name: '🕐 Waktu Kejadian', value: modalFields.getTextInputValue('incident_time'), inline: true }
                    ]);
                
                const additionalInfo = modalFields.getTextInputValue('additional_info');
                if (additionalInfo) {
                    embed.addFields([{ name: '📋 Informasi Tambahan', value: additionalInfo, inline: false }]);
                }
                break;
        }

        return embed;
    }

    async createTranscript(ticket, channel, guild, client) {
        try {
            if (!config.ticket.transcriptChannelId) {
                console.log('Transcript channel ID not configured, skipping transcript creation');
                return;
            }

            const transcriptChannel = guild.channels.cache.get(config.ticket.transcriptChannelId);
            if (!transcriptChannel) {
                console.log('Transcript channel not found, skipping transcript creation');
                return;
            }

            // Fetch all messages from the ticket channel
            let messages = [];
            let lastMessageId = null;

            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const fetchedMessages = await channel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                messages = messages.concat(Array.from(fetchedMessages.values()));
                lastMessageId = fetchedMessages.last().id;
            }

            // Sort messages by creation time (oldest first)
            messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

            // Create transcript content
            let transcriptContent = '';
            const categoryInfo = config.ticket.categories[ticket.category];
            const ticketCreator = await guild.members.fetch(ticket.userId).catch(() => null);
            const ticketCloser = await guild.members.fetch(ticket.closedBy).catch(() => null);

            // Header information
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            transcriptContent += `📋 TRANSKRIP TIKET\n`;
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            transcriptContent += `🆔 ID Tiket: ${ticket.id}\n`;
            transcriptContent += `📂 Kategori: ${categoryInfo?.label || ticket.category}\n`;
            transcriptContent += `👤 Pembuat: ${ticketCreator ? `${ticketCreator.user.username} (${ticketCreator.user.id})` : `ID: ${ticket.userId}`}\n`;
            transcriptContent += `📅 Dibuat: ${new Date(ticket.createdAt).toLocaleString('id-ID')}\n`;
            transcriptContent += `🔒 Ditutup: ${new Date(ticket.closedAt).toLocaleString('id-ID')}\n`;
            transcriptContent += `👨‍💼 Ditutup oleh: ${ticketCloser ? `${ticketCloser.user.username} (${ticketCloser.user.id})` : `ID: ${ticket.closedBy}`}\n`;
            transcriptContent += `📝 Alasan: ${ticket.closeReason}\n`;
            transcriptContent += `💬 Total Pesan: ${messages.length}\n\n`;
            
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            transcriptContent += `📖 RIWAYAT PERCAKAPAN\n`;
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            // Process messages
            for (const message of messages) {
                const timestamp = new Date(message.createdTimestamp).toLocaleString('id-ID');
                const author = message.author;
                const isBot = author.bot;
                const authorName = isBot ? `🤖 ${author.username}` : `👤 ${author.username}`;
                
                transcriptContent += `[${timestamp}] ${authorName} (${author.id})\n`;
                
                // Message content
                if (message.content) {
                    transcriptContent += `💬 ${message.content}\n`;
                }

                // Attachments
                if (message.attachments.size > 0) {
                    message.attachments.forEach(attachment => {
                        transcriptContent += `📎 Lampiran: ${attachment.name} (${attachment.url})\n`;
                    });
                }

                // Embeds
                if (message.embeds.length > 0) {
                    message.embeds.forEach((embed, index) => {
                        transcriptContent += `📋 Embed ${index + 1}:\n`;
                        if (embed.title) transcriptContent += `   Judul: ${embed.title}\n`;
                        if (embed.description) transcriptContent += `   Deskripsi: ${embed.description}\n`;
                        if (embed.fields && embed.fields.length > 0) {
                            embed.fields.forEach(field => {
                                transcriptContent += `   ${field.name}: ${field.value}\n`;
                            });
                        }
                    });
                }

                transcriptContent += `\n`;
            }

            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            transcriptContent += `📊 STATISTIK TIKET\n`;
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            const duration = ticket.closedAt - ticket.createdAt;
            const hours = Math.floor(duration / (1000 * 60 * 60));
            const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
            
            transcriptContent += `⏱️ Durasi tiket: ${hours} jam ${minutes} menit\n`;
            transcriptContent += `📈 Jumlah pesan: ${messages.length}\n`;
            transcriptContent += `👥 Partisipan: ${new Set(messages.map(m => m.author.id)).size} orang\n\n`;
            
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            transcriptContent += `Transkrip dibuat secara otomatis oleh Sistem Tiket pada ${new Date().toLocaleString('id-ID')}\n`;
            transcriptContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

            // Split transcript into chunks if it's too long (Discord has a 2000 character limit per message)
            const maxChunkSize = 1900; // Leave some room for code block formatting
            const chunks = [];
            
            if (transcriptContent.length <= maxChunkSize) {
                chunks.push(transcriptContent);
            } else {
                const lines = transcriptContent.split('\n');
                let currentChunk = '';
                
                for (const line of lines) {
                    if (currentChunk.length + line.length + 1 > maxChunkSize) {
                        chunks.push(currentChunk);
                        currentChunk = line + '\n';
                    } else {
                        currentChunk += line + '\n';
                    }
                }
                
                if (currentChunk.trim()) {
                    chunks.push(currentChunk);
                }
            }

            // Send transcript header embed
            const transcriptEmbed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('📋 Transkrip Tiket')
                .addFields([
                    { name: '🆔 ID Tiket', value: ticket.id, inline: true },
                    { name: '📂 Kategori', value: categoryInfo?.label || ticket.category, inline: true },
                    { name: '👤 Pembuat', value: ticketCreator ? ticketCreator.user.username : `ID: ${ticket.userId}`, inline: true },
                    { name: '📅 Dibuat', value: `<t:${Math.floor(ticket.createdAt / 1000)}:F>`, inline: true },
                    { name: '🔒 Ditutup', value: `<t:${Math.floor(ticket.closedAt / 1000)}:F>`, inline: true },
                    { name: '💬 Total Pesan', value: messages.length.toString(), inline: true }
                ])
                .setFooter({ text: 'Transkrip lengkap tersedia di pesan berikutnya' })
                .setTimestamp();

            await transcriptChannel.send({ embeds: [transcriptEmbed] });

            // Send transcript chunks
            for (let i = 0; i < chunks.length; i++) {
                const chunkHeader = chunks.length > 1 ? `**Bagian ${i + 1}/${chunks.length}**\n\n` : '';
                await transcriptChannel.send({
                    content: `${chunkHeader}\`\`\`${chunks[i]}\`\`\``
                });
                
                // Add a small delay between chunks to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`✅ Transcript created for ticket ${ticket.id}`);

        } catch (error) {
            console.error('Error creating transcript:', error);
        }
    }

    getUserTickets(userId) {
        return this.tickets.filter(ticket => ticket.userId === userId);
    }

    getUserActiveTickets(userId) {
        return this.tickets.filter(ticket => ticket.userId === userId && ticket.status === 'open');
    }

    getTicketById(ticketId) {
        return this.tickets.find(ticket => ticket.id === ticketId);
    }

    getTicketByChannelId(channelId) {
        return this.tickets.find(ticket => ticket.channelId === channelId);
    }

    getAllTickets() {
        return this.tickets;
    }

    getActiveTickets() {
        return this.tickets.filter(ticket => ticket.status === 'open');
    }

    getClosedTickets() {
        return this.tickets.filter(ticket => ticket.status === 'closed');
    }
}

module.exports = new TicketManager();
