const fs = require('fs');
const path = require('path');

module.exports = {
    loadCommands(client) {
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`✅ Command dimuat: ${command.data.name}`);
            } else {
                console.log(`⚠️  Command di ${filePath} kehilangan properti "data" atau "execute" yang diperlukan.`);
            }
        }
    }
};
