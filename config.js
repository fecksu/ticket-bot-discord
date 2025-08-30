module.exports = {
    // Bot token (use environment variable in production)
    token: process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    
    // Ticket system configuration
    ticket: {
        // Category ID where ticket channels will be created
        categoryId: process.env.TICKET_CATEGORY_ID || null,
        
        // Role IDs that can manage tickets
        supportRoles: process.env.SUPPORT_ROLES ? process.env.SUPPORT_ROLES.split(',') : [],
        
        // Channel ID for ticket logs
        logChannelId: process.env.LOG_CHANNEL_ID || null,
        
        // Channel ID for ticket transcripts
        transcriptChannelId: process.env.TRANSCRIPT_CHANNEL_ID || null,
        
        // Maximum tickets per user
        maxTicketsPerUser: parseInt(process.env.MAX_TICKETS_PER_USER) || 1,
        
        // Ticket categories
        categories: {
            'support': {
                label: 'Report Player',
                description: 'Melaporkan player yang melanggar aturan.',
                emoji: '✋🏻',
                categoryId: process.env.SUPPORT_CATEGORY_ID || null
            },
            'bug': {
                label: 'Report Staff',
                description: 'Melaporkan Staff yang melanggar aturan.',
                emoji: '⛔',
                categoryId: process.env.BUG_CATEGORY_ID || null
            },
            'feature': {
                label: 'Unban Request',
                description: 'Mengajukan banding terkait larangan bermain.',
                emoji: '🔓',
                categoryId: process.env.FEATURE_CATEGORY_ID || null
            },
            'other': {
                label: 'Asset Refund',
                description: 'Meminta untuk pengembalian aset yang hilang.',
                emoji: '💵',
                categoryId: process.env.OTHER_CATEGORY_ID || null
            }
        }
    },
    
    // Colors for embeds
    colors: {
        primary: parseInt(process.env.SERVER_MAIN_COLOR) || 0x5865F2,
        success: 0x57F287,
        error: 0xED4245,
        warning: 0xFEE75C
    }
};
      
