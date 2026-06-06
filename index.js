require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Load config with fallback to environment variables
let config;
try {
  config = require('./config.json');
} catch (e) {
  // Use environment variables if config.json is not found
  config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    logsChannelId: process.env.LOGS_CHANNEL_ID,
    ticketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID,
    ticketTranscriptsChannelId: process.env.TICKET_TRANSCRIPTS_CHANNEL_ID,
    ticketCategoryId: process.env.TICKET_CATEGORY_ID,
    ticketSupportRoleId: process.env.TICKET_SUPPORT_ROLE_ID,
    welcomeChannelId: process.env.WELCOME_CHANNEL_ID,
    rulesChannelId: process.env.RULES_CHANNEL_ID
  };
}

const { token, logsChannelId, ticketPanelChannelId, ticketTranscriptsChannelId, ticketCategoryId, ticketSupportRoleId, welcomeChannelId, rulesChannelId } = config;

const welcomedMembers = new Set(); // To prevent duplicate welcomes
const automodDeletedMessages = new Set(); // To prevent duplicate message delete logs from automod
const ticketCooldowns = new Map(); // To track ticket cooldowns (userId → timestamp)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Curse words in multiple languages
const curseWords = [
  // English
  'fuck', 'shit', 'asshole', 'bitch', 'bastard', 'cunt', 'dick', 'pussy',
  'motherfucker', 'whore', 'slut', 'cock', 'cocksucker', 'douchebag',
  'nigger', 'nigga', 'faggot', 'fag', 'retard',
  // Spanish
  'puta', 'mierda', 'pendejo', 'coño', 'joder', 'chingar', 'puto', 'maricón',
  'culero', 'verga', 'polla', 'pinche', 'cabrón', 'chupa pingas',
  // French
  'merde', 'putain', 'foutre', 'connard', 'salope', 'enculé', 'bordel',
  'chier', 'fils de pute', 'va te faire foutre', 'cul', 'bite',
  // German
  'scheiße', 'fuck', 'arschloch', 'schlampe', 'wichser', 'hure', 'mist',
  'verdammt', 'fick', 'kacke', 'hurensohn', 'fotze',
  // Italian
  'merda', 'puttana', 'cazzo', 'figa di merda', 'stronzo', 'vaffanculo',
  'porca puttana', 'figa', 'coglione',
  // Portuguese
  'puta', 'merda', 'foda', 'caralho', 'pau', 'bunda', 'filho da puta',
  'vai se foder', 'cú', 'pinto',
  // Russian
  'хуй', 'пизда', 'блядь', 'сука', 'ебать', 'мудак', 'дрочить', 'хер',
  // Arabic
  'عير', 'كس امك', 'كس اختك', 'يا حمار', 'يا ابن الحمار',
  // Hindi
  'madarchod', 'behenchod', 'lund', 'chutiya', 'gandu', 'bhen ke lode',
  'maa ki chut', 'bc', 'mc',
];

function parseTime(time) {
  const regex = /^(\d+)(s|m|h|d|w)$/;
  const match = time.match(regex);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

async function sendLog(guild, embed) {
  try {
    const channel = guild.channels.cache.get(logsChannelId);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Failed to send log:', error);
  }
}

// Helper function to check if channel is a ticket channel
function isTicketChannel(channel, guild) {
  return channel.parentId === ticketCategoryId;
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Welcome message when a member joins
client.on('guildMemberAdd', async (member) => {
  if (!welcomeChannelId) return;
  if (member.user.bot) return; // Prevent sending for bots
  if (welcomedMembers.has(member.id)) return; // Prevent duplicates

  const channel = member.guild.channels.cache.get(welcomeChannelId);
  if (!channel) return;

  const welcomeEmbed = new EmbedBuilder()
    .setColor('#e600ff') // Pink-purple color
    .setTitle('Welcome!')
    .setDescription(`Welcome to the server, ${member}! We're glad you're here! 🎉`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  try {
    await channel.send({ embeds: [welcomeEmbed] });
    welcomedMembers.add(member.id);
    // Remove from set after 10 seconds to allow re-welcoming if needed
    setTimeout(() => welcomedMembers.delete(member.id), 10000);
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

client.on('messageDelete', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  
  // Skip if this message was deleted by automod to prevent duplicate logs
  if (automodDeletedMessages.has(message.id)) {
    automodDeletedMessages.delete(message.id);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#ff9900')
    .setTitle('Message Deleted')
    .addFields(
      { name: 'Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Content', value: message.content || 'No content (image/embed only)' }
    )
    .setTimestamp();

  if (message.attachments.size > 0) {
    embed.addFields({
      name: 'Attachments',
      value: message.attachments.map((a) => a.url).join('\n'),
    });
  }

  await sendLog(message.guild, embed);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const member = message.member;
  const lowerContent = message.content.toLowerCase();

  // Check for curse words
  const foundCurse = curseWords.some(word => lowerContent.includes(word.toLowerCase()));

  if (foundCurse) {
          try {
            // Add message ID to set to prevent duplicate log
            automodDeletedMessages.add(message.id);
            // Delete the message
            await message.delete();

      // Mute for 1 hour
      const oneHour = 60 * 60 * 1000;
      await member.timeout(oneHour, 'Automod: Curse word detected');

      // Send warning DM if possible
      try {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('You have been muted')
              .setDescription(`You have been muted for **1 hour** in **${message.guild.name}** for using inappropriate language.`)
              .setTimestamp()
          ]
        });
      } catch (e) {
        // DM failed - continue anyway
      }

      // Log to logs channel
      const logEmbed = new EmbedBuilder()
        .setColor('#ff3333')
        .setTitle('Automod: Curse Word Detected')
        .addFields(
          { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Message', value: message.content.substring(0, 1024) || 'N/A' },
          { name: 'Action', value: 'Message deleted + 1 hour mute' }
        )
        .setTimestamp();

      await sendLog(message.guild, logEmbed);

    } catch (error) {
      console.error('Automod error:', error);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  const { customId, commandName, options, member, guild, user, channel } = interaction;

  // Handle chat input commands first
  if (interaction.isChatInputCommand()) {
    try {
      if (commandName === 'ban') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to ban members!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const memberTarget = guild.members.cache.get(target.id);

        if (!memberTarget) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Could not find that user!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (memberTarget.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Cannot ban an administrator!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await memberTarget.ban({ reason });

        const logEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('User Banned')
          .addFields(
            { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('User Banned')
              .setDescription(`Successfully banned **${target.tag}**\nReason: ${reason}`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'kick') {
        if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to kick members!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const memberTarget = guild.members.cache.get(target.id);

        if (!memberTarget) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Could not find that user!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (memberTarget.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Cannot kick an administrator!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await memberTarget.kick(reason);

        const logEmbed = new EmbedBuilder()
          .setColor('#ff6600')
          .setTitle('User Kicked')
          .addFields(
            { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('User Kicked')
              .setDescription(`Successfully kicked **${target.tag}**\nReason: ${reason}`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'unban') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to unban members!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const userId = options.getString('userid');
        const bans = await guild.bans.fetch();
        const bannedUser = bans.find((ban) => ban.user.id === userId);

        if (!bannedUser) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('That user is not banned!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await guild.members.unban(userId);

        const logEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('User Unbanned')
          .addFields(
            { name: 'User', value: `${bannedUser.user.tag} (${userId})`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('User Unbanned')
              .setDescription(`Successfully unbanned **${bannedUser.user.tag}**`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'mute') {
        if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to mute members!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const target = options.getUser('user');
        const timeStr = options.getString('time');
        const reason = options.getString('reason') || 'No reason provided';
        const memberTarget = guild.members.cache.get(target.id);

        if (!memberTarget) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Could not find that user!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (memberTarget.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Cannot mute an administrator!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const ms = parseTime(timeStr);
        if (!ms) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Invalid time format! Use s, m, h, d, w (e.g., 1h, 30m)'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (ms > 28 * 24 * 60 * 60 * 1000) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Time cannot be longer than 28 days!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        // Send DM to the user being muted
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('You have been muted')
            .setDescription(`You have been muted for **${timeStr}** in **${guild.name}**${reason !== 'No reason provided' ? ` for **${reason}**` : ''}.`)
            .setTimestamp();
          await target.send({ embeds: [dmEmbed] });
        } catch (error) {
          console.error('Could not send DM to muted user:', error);
        }

        await memberTarget.timeout(ms, reason);

        const logEmbed = new EmbedBuilder()
          .setColor('#ffff00')
          .setTitle('User Muted')
          .addFields(
            { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true },
            { name: 'Duration', value: timeStr, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('User Muted')
              .setDescription(`Successfully muted **${target.tag}** for **${timeStr}**\nReason: ${reason}`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'unmute') {
        if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to unmute members!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const target = options.getUser('user');
        const memberTarget = guild.members.cache.get(target.id);

        if (!memberTarget) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Could not find that user!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (!memberTarget.isCommunicationDisabled()) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('That user is not muted!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        // Send DM to the user being unmuted
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor('#00ffff')
            .setTitle('You have been unmuted')
            .setDescription(`You have been unmuted in **${guild.name}**.`)
            .setTimestamp();
          await target.send({ embeds: [dmEmbed] });
        } catch (error) {
          console.error('Could not send DM to unmuted user:', error);
        }

        await memberTarget.timeout(null);

        const logEmbed = new EmbedBuilder()
          .setColor('#00ffff')
          .setTitle('User Unmuted')
          .addFields(
            { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('User Unmuted')
              .setDescription(`Successfully unmuted **${target.tag}**`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'purge') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to manage messages!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const amount = options.getInteger('amount');
        if (amount < 1 || amount > 100) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Amount must be between 1 and 100!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const messages = await interaction.channel.bulkDelete(amount, true);

        const logEmbed = new EmbedBuilder()
          .setColor('#ff6600')
          .setTitle('Messages Purged')
          .addFields(
            { name: 'Amount', value: `${messages.size}`, inline: true },
            { name: 'Channel', value: `${interaction.channel}`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('Messages Purged')
              .setDescription(`Successfully deleted **${messages.size}** message(s)!`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return;
      }

      if (commandName === 'setrole') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to manage roles!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const target = options.getUser('user');
        const role = options.getRole('role');
        const memberTarget = guild.members.cache.get(target.id);

        if (!memberTarget) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Could not find that user!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (role.managed) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Cannot manage a bot-managed role!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (memberTarget.roles.cache.has(role.id)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`**${target.tag}** already has that role!`),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await memberTarget.roles.add(role);

        const logEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Role Added')
          .addFields(
            { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('Role Added')
              .setDescription(`Successfully added **${role.name}** to **${target.tag}**!`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'removerole') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to manage roles!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const target = options.getUser('user');
        const role = options.getRole('role');
        const memberTarget = guild.members.cache.get(target.id);

        if (!memberTarget) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Could not find that user!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (role.managed) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Cannot manage a bot-managed role!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        if (!memberTarget.roles.cache.has(role.id)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`**${target.tag}** doesn't have that role!`),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await memberTarget.roles.remove(role);

        const logEmbed = new EmbedBuilder()
          .setColor('#cc66ff')
          .setTitle('Role Removed')
          .addFields(
            { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('Role Removed')
              .setDescription(`Successfully removed **${role.name}** from **${target.tag}**!`),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'ticketpanel') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to use this command!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const panelChannel = guild.channels.cache.get(ticketPanelChannelId);
        if (!panelChannel) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Ticket panel channel not found! Please check your config.json!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Delete all existing messages in the panel channel first
        let deleted = 0;
        let messages;
        do {
          messages = await panelChannel.messages.fetch({ limit: 100 });
          if (messages.size > 0) {
            await panelChannel.bulkDelete(messages, true);
            deleted += messages.size;
          }
        } while (messages.size === 100);

        const ticketEmbed = new EmbedBuilder()
          .setColor('#2b2d31')
          .setTitle('Create a Ticket')
          .setDescription('Click the button below to open a support ticket!')
          .setImage('https://i.postimg.cc/VNhLFnWx/Chat-GPT-Image-Jun-4-2026-04-35-42-PM.png');

        const buttonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('create_ticket')
              .setLabel('Create Ticket')
              .setStyle(ButtonStyle.Primary)
          );

        await panelChannel.send({ embeds: [ticketEmbed], components: [buttonRow] });

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setDescription(`Ticket panel sent successfully! Deleted ${deleted} old message(s).`),
          ],
        });
      }

      if (commandName === 'close') {
        // Check if in a ticket channel
        if (!isTicketChannel(interaction.channel, guild)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('This command can only be used in ticket channels!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        // Check if user is support OR ticket creator (has view access)
        const isSupport = member.roles.cache.has(ticketSupportRoleId);
        const isTicketCreator = interaction.channel.permissionOverwrites.cache.has(member.id);
        if (!isSupport && !isTicketCreator) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Only support members or the ticket creator can use this command!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Get ticket messages for transcript
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        let transcriptContent = `Transcript for ${interaction.channel.name}\n`;
        transcriptContent += `Created: ${new Date().toLocaleString()}\n`;
        transcriptContent += `======================================\n\n`;

        // Sort messages oldest first
        const sortedMessages = Array.from(messages.values()).reverse();
        sortedMessages.forEach(msg => {
          transcriptContent += `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
          if (msg.attachments.size > 0) {
            msg.attachments.forEach(att => {
              transcriptContent += `Attachment: ${att.url}\n`;
            });
          }
        });

        // Send transcript to transcripts channel
        const transcriptChannel = guild.channels.cache.get(ticketTranscriptsChannelId);
        if (transcriptChannel) {
          await transcriptChannel.send({
            content: `Transcript for ${interaction.channel.name} (closed via /close)`,
            files: [{ attachment: Buffer.from(transcriptContent, 'utf8'), name: `${interaction.channel.name}-transcript.txt` }],
          });
        }

        // Delete ticket channel
        await interaction.channel.delete();
        return;
      }

      if (commandName === 'closerequest') {
        // Check if in a ticket channel
        if (!isTicketChannel(interaction.channel, guild)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('This command can only be used in ticket channels!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        // Send public close request
        const requestEmbed = new EmbedBuilder()
          .setColor('#ffff00')
          .setTitle('Close Request')
          .setDescription(`${member.user.tag} (${member.displayName}) has requested to close this ticket!`)
          .setTimestamp();

        const actionButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('Close Ticket')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('cancel_close_ticket')
              .setLabel('Keep Open')
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.reply({ embeds: [requestEmbed], components: [actionButtons] });
        return;
      }

      if (commandName === 'lock') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to manage channels!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        // Deny SendMessages for @everyone
        await interaction.channel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
        });

        // Log it
        const logEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('Channel Locked')
          .addFields(
            { name: 'Channel', value: `${interaction.channel}`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('Channel Locked')
              .setDescription('This channel has been locked! Members can no longer send messages.'),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'unlock') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to manage channels!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        // Allow SendMessages for @everyone
        await interaction.channel.permissionOverwrites.edit(guild.id, {
          SendMessages: null,
        });

        // Log it
        const logEmbed = new EmbedBuilder()
          .setColor('#00ffff')
          .setTitle('Channel Unlocked')
          .addFields(
            { name: 'Channel', value: `${interaction.channel}`, inline: true },
            { name: 'Moderator', value: `${member.user.tag}`, inline: true }
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);

        const msg = await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('Channel Unlocked')
              .setDescription('This channel has been unlocked! Members can now send messages again.'),
          ],
          fetchReply: true,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      if (commandName === 'setuprules') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('You do not have permission to use this command!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        const channel = guild.channels.cache.get(rulesChannelId);
        if (!channel) {
          const msg = await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('Rules channel not found! Please check config.json!'),
            ],
            ephemeral: true,
            fetchReply: true,
          });
          setTimeout(() => msg.delete().catch(() => {}), 5000);
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Delete old messages in rules channel
        let deleted = 0;
        let messages;
        do {
          messages = await channel.messages.fetch({ limit: 100 });
          if (messages.size > 0) {
            await channel.bulkDelete(messages, true);
            deleted += messages.size;
          }
        } while (messages.size === 100);

        // Create the exact rules embed with pink-purple color
        const rulesEmbed = new EmbedBuilder()
          .setColor('#e600ff')
          .setTitle('📢 Server Rules')
          .setDescription('Please follow the rules of both Discord and Roblox!\n\n**Discord TOS**\nhttps://discord.com/terms\n\n**Roblox TOS**\nhttps://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use\n\n---\n\n⚠️ **1. Keep the chat clean**\nBad language is not allowed, including in videos or screenshots.\n\n💬 **2. Be respectful**\nDo not insult, harass, or offend other members. This also applies to DMs if it started from the server.\n\n🔞 **3. No NSFW content**\nNSFW content of any kind is strictly prohibited (messages, images, videos, avatars, etc.).\n\n📢 **4. Don\'t spam**\nAvoid flooding the chat, spamming, or excessive CAPS LOCK.\n\n🚫 **5. No inappropriate jokes or memes**\nRacist, offensive, or disrespectful jokes/memes are not allowed.\n\n📣 **6. No advertising**\nAdvertising Discord servers, YouTube channels, or anything else is not allowed.\n\n🤝 **7. Respect everyone**\nTreat all members with kindness and respect. Breaking this rule may result in a mute or ban.\n\n💸 **8. No IRL trading**\nTrading pets, items, or anything in-game for real money or real-life items is strictly prohibited.');

        await channel.send({ embeds: [rulesEmbed] });

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setDescription(`Rules sent! Deleted ${deleted} old messages!`),
          ],
        });
      }
    } catch (error) {
      console.error(error);
      const msg = await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('An error occurred while executing this command!'),
        ],
        ephemeral: true,
        fetchReply: true,
      });
      setTimeout(() => msg.delete().catch(() => {}), 5000);
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    if (customId === 'create_ticket') {
      // Check ticket cooldown first
      const now = Date.now();
      const cooldownAmount = 60 * 60 * 1000; // 1 hour in milliseconds
      const userId = user.id;
      
      if (ticketCooldowns.has(userId)) {
        const expirationTime = ticketCooldowns.get(userId) + cooldownAmount;
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          const minutes = Math.floor(timeLeft / 60);
          const seconds = Math.floor(timeLeft % 60);
          
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`You must wait ${minutes} minute(s) and ${seconds} second(s) before creating another ticket!`),
            ],
            ephemeral: true,
          });
        }
      }
      
      // Check if user already has a ticket (look for any ticket channel where user has access)
      const existingChannel = guild.channels.cache.find(c =>
        c.parentId === ticketCategoryId &&
        c.permissionOverwrites.cache.has(user.id)
      );
      if (existingChannel) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setDescription(`You already have an open ticket! ${existingChannel}`),
          ],
          ephemeral: true,
        });
      }

      // Create and show modal
      const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('Create a Ticket');

      // Ticket type selector (using text input since select menus in modals are tricky)
      const ticketTypeInput = new TextInputBuilder()
        .setCustomId('ticket_type')
        .setLabel('Ticket Type (Support/Other)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter either "Support" or "Other"')
        .setRequired(true);

      // Question 1
      const question1Input = new TextInputBuilder()
        .setCustomId('question1')
        .setLabel('What do you need help with?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Tell us what\'s happening...')
        .setRequired(true);

      // Question 2
      const question2Input = new TextInputBuilder()
        .setCustomId('question2')
        .setLabel('Additional Details')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Any other details we should know?')
        .setRequired(false);

      // Add inputs to action rows
      const row1 = new ActionRowBuilder().addComponents(ticketTypeInput);
      const row2 = new ActionRowBuilder().addComponents(question1Input);
      const row3 = new ActionRowBuilder().addComponents(question2Input);

      modal.addComponents(row1, row2, row3);

      return interaction.showModal(modal);
    }

    if (customId === 'close_ticket') {
      await interaction.deferReply({ ephemeral: true });

      // Check if user is support OR the ticket creator (has view access)
      const isSupport = member.roles.cache.has(ticketSupportRoleId);
      const isTicketCreator = channel.permissionOverwrites.cache.has(member.id);
      if (!isSupport && !isTicketCreator) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setDescription('Only support members or the ticket creator can close tickets!'),
          ],
        });
      }

      // Get ticket messages for transcript
      const messages = await channel.messages.fetch({ limit: 100 });
      let transcriptContent = `Transcript for ${channel.name}\n`;
      transcriptContent += `Created: ${new Date().toLocaleString()}\n`;
      transcriptContent += `======================================\n\n`;

      // Sort messages oldest first
      const sortedMessages = Array.from(messages.values()).reverse();
      sortedMessages.forEach(msg => {
        transcriptContent += `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
        if (msg.attachments.size > 0) {
          msg.attachments.forEach(att => {
            transcriptContent += `Attachment: ${att.url}\n`;
          });
        }
      });

      // Send transcript to transcripts channel
      const transcriptChannel = guild.channels.cache.get(ticketTranscriptsChannelId);
      if (transcriptChannel) {
        await transcriptChannel.send({
          content: `Transcript for ${channel.name}`,
          files: [{ attachment: Buffer.from(transcriptContent, 'utf8'), name: `${channel.name}-transcript.txt` }],
        });
      }

      // Delete ticket channel
      return channel.delete();
    }

    if (customId === 'cancel_close_ticket') {
      await interaction.deferReply({ ephemeral: true });

      // Check if user is support OR the ticket creator (has view access)
      const isSupport = member.roles.cache.has(ticketSupportRoleId);
      const isTicketCreator = channel.permissionOverwrites.cache.has(member.id);
      if (!isSupport && !isTicketCreator) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setDescription('Only support members or the ticket creator can use this button!'),
          ],
        });
      }

      // Edit the message to remove buttons
      await interaction.message.edit({
        embeds: [
          new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Ticket Remaining Open')
            .setDescription('This ticket will remain open!')
            .setTimestamp(),
        ],
        components: [],
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription('Ticket will stay open!'),
        ],
      });
    }
  }

  // Handle modal submission
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'ticket_modal') {
      await interaction.deferReply({ ephemeral: true });

      const ticketType = interaction.fields.getTextInputValue('ticket_type').trim();
      const question1 = interaction.fields.getTextInputValue('question1');
      const question2 = interaction.fields.getTextInputValue('question2');

      // Normalize ticket type: convert to lowercase, check if it's 'support' or 'other', then capitalize properly
      const lowerTicketType = ticketType.toLowerCase();
      let normalizedTicketType;

      if (lowerTicketType === 'support') {
        normalizedTicketType = 'Support';
      } else if (lowerTicketType === 'other') {
        normalizedTicketType = 'Other';
      } else {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setDescription('Invalid ticket type! Please enter either "Support" or "Other".'),
          ],
        });
      }

      // Create ticket channel with username
      // Clean username for Discord channel name (only allow lowercase, numbers, dashes)
      const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const ticketChannel = await guild.channels.create({
        name: `ticket-${cleanUsername}`,
        type: ChannelType.GuildText,
        parent: ticketCategoryId,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
          },
          {
            id: ticketSupportRoleId,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
          },
        ],
      });

      // Send welcome message to ticket
      const welcomeEmbed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('New Ticket')
        .setDescription(`Welcome ${user}! A support team member will be with you shortly!`)
        .addFields(
          { name: 'Created By', value: `${user.tag}`, inline: true },
          { name: 'Ticket Type', value: normalizedTicketType, inline: true },
          { name: 'What do you need help with?', value: question1 },
          { name: 'Additional Details', value: question2 || 'N/A' }
        )
        .setTimestamp();

      const ticketButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

      await ticketChannel.send({ content: `<@${user.id}> <@&${ticketSupportRoleId}>`, embeds: [welcomeEmbed], components: [ticketButtons] });

      // Apply 1 hour cooldown
      ticketCooldowns.set(user.id, Date.now());
      
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription(`Ticket created! ${ticketChannel}`),
        ],
      });
    }
  }
});

client.login(token);
