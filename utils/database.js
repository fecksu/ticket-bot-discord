const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Database {
    constructor() {
        this.ensureFilesExist();
    }

    ensureFilesExist() {
        // Create tickets.json if it doesn't exist
        if (!fs.existsSync(TICKETS_FILE)) {
            this.saveTickets([]);
        }

        // Create config.json if it doesn't exist
        if (!fs.existsSync(CONFIG_FILE)) {
            this.saveConfig({
                version: '1.0.0',
                lastBackup: null,
                totalTicketsCreated: 0
            });
        }
    }

    loadTickets() {
        try {
            const data = fs.readFileSync(TICKETS_FILE, 'utf8');
            return JSON.parse(data) || [];
        } catch (error) {
            console.error('Error loading tickets:', error);
            return [];
        }
    }

    saveTickets(tickets) {
        try {
            const data = JSON.stringify(tickets, null, 2);
            fs.writeFileSync(TICKETS_FILE, data, 'utf8');
            
            // Update total tickets count
            const config = this.loadConfig();
            config.totalTicketsCreated = tickets.length;
            this.saveConfig(config);
            
            return true;
        } catch (error) {
            console.error('Error saving tickets:', error);
            return false;
        }
    }

    loadConfig() {
        try {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data) || {};
        } catch (error) {
            console.error('Error loading config:', error);
            return {};
        }
    }

    saveConfig(config) {
        try {
            const data = JSON.stringify(config, null, 2);
            fs.writeFileSync(CONFIG_FILE, data, 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving config:', error);
            return false;
        }
    }

    // Backup functionality
    createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(DATA_DIR, 'backups');
            
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir);
            }

            const backupFile = path.join(backupDir, `tickets-backup-${timestamp}.json`);
            const tickets = this.loadTickets();
            
            fs.writeFileSync(backupFile, JSON.stringify(tickets, null, 2));
            
            // Update last backup time
            const config = this.loadConfig();
            config.lastBackup = Date.now();
            this.saveConfig(config);
            
            console.log(`✅ Backup created: ${backupFile}`);
            return backupFile;
        } catch (error) {
            console.error('Error creating backup:', error);
            return null;
        }
    }

    // Clean up old closed tickets (optional)
    cleanupOldTickets(daysOld = 30) {
        try {
            const tickets = this.loadTickets();
            const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
            
            const activeTickets = tickets.filter(ticket => {
                if (ticket.status === 'open') return true;
                if (ticket.status === 'closed' && ticket.closedAt > cutoffDate) return true;
                return false;
            });

            const removedCount = tickets.length - activeTickets.length;
            
            if (removedCount > 0) {
                this.saveTickets(activeTickets);
                console.log(`🧹 Cleaned up ${removedCount} old tickets`);
            }

            return removedCount;
        } catch (error) {
            console.error('Error cleaning up tickets:', error);
            return 0;
        }
    }

    // Get statistics
    getStats() {
        const tickets = this.loadTickets();
        const config = this.loadConfig();
        
        return {
            totalTickets: tickets.length,
            activeTickets: tickets.filter(t => t.status === 'open').length,
            closedTickets: tickets.filter(t => t.status === 'closed').length,
            totalCreated: config.totalTicketsCreated || tickets.length,
            lastBackup: config.lastBackup
        };
    }
}

module.exports = new Database();
