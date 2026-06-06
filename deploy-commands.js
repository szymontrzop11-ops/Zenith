require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Load config with fallback to environment variables
let config;
try {
  config = require('./config.json');
} catch (e) {
  config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID
  };
}

const { clientId, guildId, token } = config;

const commands = [
  {
    name: 'ban',
    description: 'Ban a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'user',
        type: 6,
        description: 'The user to ban',
        required: true,
      },
      {
        name: 'reason',
        type: 3,
        description: 'Reason for banning (optional)',
        required: false,
      },
    ],
  },
  {
    name: 'unban',
    description: 'Unban a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'userid',
        type: 3,
        description: 'The user ID to unban',
        required: true,
      },
    ],
  },
  {
    name: 'mute',
    description: 'Mute a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'user',
        type: 6,
        description: 'The user to mute',
        required: true,
      },
      {
        name: 'time',
        type: 3,
        description: 'Duration (e.g., 1h, 30m, 2d)',
        required: true,
      },
      {
        name: 'reason',
        type: 3,
        description: 'Reason for muting (optional)',
        required: false,
      },
    ],
  },
  {
    name: 'unmute',
    description: 'Unmute a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'user',
        type: 6,
        description: 'The user to unmute',
        required: true,
      },
    ],
  },
  {
    name: 'purge',
    description: 'Delete multiple messages',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'amount',
        type: 4,
        description: 'Number of messages to delete (1-100)',
        required: true,
      },
    ],
  },
  {
    name: 'setrole',
    description: 'Add a role to a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'user',
        type: 6,
        description: 'The user to add the role to',
        required: true,
      },
      {
        name: 'role',
        type: 8,
        description: 'The role to add',
        required: true,
      },
    ],
  },
  {
    name: 'removerole',
    description: 'Remove a role from a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'user',
        type: 6,
        description: 'The user to remove the role from',
        required: true,
      },
      {
        name: 'role',
        type: 8,
        description: 'The role to remove',
        required: true,
      },
    ],
  },
  {
    name: 'kick',
    description: 'Kick a user',
    default_member_permissions: '8', // Administrator permission
    options: [
      {
        name: 'user',
        type: 6,
        description: 'The user to kick',
        required: true,
      },
      {
        name: 'reason',
        type: 3,
        description: 'Reason for kicking (optional)',
        required: false,
      },
    ],
  },
  {
    name: 'ticketpanel',
    description: 'Send the ticket panel to the configured channel',
    default_member_permissions: '8', // Administrator permission
  },
  {
    name: 'close',
    description: 'Close the current ticket (support only)',
  },
  {
    name: 'closerequest',
    description: 'Request to close the ticket',
  },
  {
    name: 'lock',
    description: 'Lock the current channel (prevent members from sending messages)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'unlock',
    description: 'Unlock the current channel (allow members to send messages again)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'setuprules',
    description: 'Send the rules embed in the rules channel',
    default_member_permissions: '8', // Administrator
  },
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
