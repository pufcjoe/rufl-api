require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// ============ VALID TEAMS AND DIVISIONS ============
const VALID_TEAMS = {
  'A': ['Seattle Sea', 'Black Panthers', 'Phantom Town', 'Tix City', 'The Kingdom', 'Red Bandits'],
  'B': ['White Wolves', 'Eagles', 'Galaxy United', 'Spartans']
};

const ALL_TEAMS = [...VALID_TEAMS['A'], ...VALID_TEAMS['B'], 'FreeAgent'];
const VALID_DIVISIONS = ['A', 'B', 'None'];

function getTeamDivision(teamName) {
  if (teamName === 'FreeAgent') return 'None';
  if (VALID_TEAMS['A'].includes(teamName)) return 'A';
  if (VALID_TEAMS['B'].includes(teamName)) return 'B';
  return null;
}

// ============ SUPABASE SETUP ============
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============ ROBLOX API HELPER ============
async function resolveUserId(input) {
  if (/^\d+$/.test(input)) {
    return input;
  }
  
  try {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [input], excludeBannedUsers: false })
    });
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      return String(data.data[0].id);
    }
    return null;
  } catch (error) {
    console.error('Roblox API error:', error);
    return null;
  }
}

async function getUsernameFromId(userid) {
  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${userid}`);
    const data = await response.json();
    return data.name || null;
  } catch (error) {
    return null;
  }
}

async function updateUsername(userid) {
  const username = await getUsernameFromId(userid);
  if (username) {
    await supabase
      .from('players')
      .update({ username })
      .eq('userid', userid);
  }
  return username;
}

// ============ FANTASY POINTS CALCULATION ============
function calculateFantasyPoints(stats) {
  let points = 0;
  const position = stats.position;

  // Goals
  if (stats.goals > 0) {
    if (position === 'Att') {
      points += stats.goals * 4;
    } else if (position === 'Mid') {
      points += stats.goals * 5;
    } else if (position === 'Def' || position === 'Gk') {
      points += stats.goals * 6;
    }
  }

  // Assists
  points += stats.assists * 3;

  // Clean sheet
  if (stats.clean_sheet) {
    if (position === 'Gk' || position === 'Def') {
      points += 4;
    } else if (position === 'Mid') {
      points += 1;
    }
  }

  // Saves (GK only, 1 point per 3 saves)
  if (position === 'Gk' && stats.saves > 0) {
    points += Math.floor(stats.saves / 3);
  }

  // MOTM
  if (stats.motm) {
    points += 3;
  }

  // Yellow card
  if (stats.yellow_card) {
    points -= 1;
  }

  // Red card
  if (stats.red_card) {
    points -= 3;
  }

  // Appearance points (played in the match)
  points += 2;

  return points;
}

// ============ DISCORD BOT SETUP ============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Discord slash commands
const commands = [
  // ============ PLAYER MANAGEMENT COMMANDS ============
  new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up a player by their Roblox UserId or Username')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setteam')
    .setDescription('Set a player\'s team')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('team')
        .setDescription('The team name')
        .setRequired(true)
        .addChoices(
          { name: 'Free Agent', value: 'FreeAgent' },
          { name: 'Seattle Sea', value: 'Seattle Sea' },
          { name: 'Black Panthers', value: 'Black Panthers' },
          { name: 'Phantom Town', value: 'Phantom Town' },
          { name: 'Tix City', value: 'Tix City' },
          { name: 'The Kingdom', value: 'The Kingdom' },
          { name: 'Red Bandits', value: 'Red Bandits' },
          { name: 'White Wolves', value: 'White Wolves' },
          { name: 'Eagles', value: 'Eagles' },
          { name: 'Galaxy United', value: 'Galaxy United' },
          { name: 'Spartans', value: 'Spartans' }
        )
    ),
  new SlashCommandBuilder()
    .setName('setdivision')
    .setDescription('Set a player\'s division')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('division')
        .setDescription('The division')
        .setRequired(true)
        .addChoices(
          { name: 'Division A', value: 'A' },
          { name: 'Division B', value: 'B' },
          { name: 'None', value: 'None' }
        )
    ),
  new SlashCommandBuilder()
    .setName('setrating')
    .setDescription('Set a player\'s rating')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('rating')
        .setDescription('The rating (0-100)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('suspend')
    .setDescription('Suspend or unsuspend a player')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('suspended')
        .setDescription('True to suspend, false to unsuspend')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('sethof')
    .setDescription('Set a player\'s Hall of Fame position')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('position')
        .setDescription('The position')
        .setRequired(true)
        .addChoices(
          { name: 'None', value: 'None' },
          { name: 'Goalkeeper', value: 'Gk' },
          { name: 'Defender', value: 'Def' },
          { name: 'Midfielder', value: 'Mid' },
          { name: 'Attacker', value: 'Att' }
        )
    ),
  new SlashCommandBuilder()
    .setName('setmanagement')
    .setDescription('Set a player\'s management role')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('role')
        .setDescription('The management role')
        .setRequired(true)
        .addChoices(
          { name: 'None', value: 'None' },
          { name: 'Assistant Manager', value: 'AssistantManager' },
          { name: 'Team Manager', value: 'TeamManager' },
          { name: 'Team Owner', value: 'TeamOwner' }
        )
    ),
  new SlashCommandBuilder()
    .setName('setnationalteam')
    .setDescription('Set a player\'s national team')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('nationalteam')
        .setDescription('The national team name')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('deleteplayer')
    .setDescription('Delete a player from the database')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('teams')
    .setDescription('List all valid teams and divisions'),
  new SlashCommandBuilder()
    .setName('setalt')
    .setDescription('Set a player\'s alt/second career status')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The Roblox UserId or Username')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('isalt')
        .setDescription('True if this is an alt/second career account')
        .setRequired(true)
    ),

  // ============ FANTASY COMMANDS ============
  new SlashCommandBuilder()
    .setName('fantasy')
    .setDescription('RUFL Fantasy commands')
    .addSubcommand(sub =>
      sub.setName('register')
        .setDescription('Create your fantasy team')
        .addStringOption(opt =>
          opt.setName('teamname')
            .setDescription('Your fantasy team name')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('team')
        .setDescription('View your fantasy team')
    )
    .addSubcommand(sub =>
      sub.setName('pick')
        .setDescription('Add a player to your team')
        .addStringOption(opt =>
          opt.setName('player')
            .setDescription('Player username or userid')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('position')
            .setDescription('Position')
            .setRequired(true)
            .addChoices(
              { name: 'Goalkeeper', value: 'Gk' },
              { name: 'Defender', value: 'Def' },
              { name: 'Midfielder', value: 'Mid' },
              { name: 'Attacker', value: 'Att' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('drop')
        .setDescription('Remove a player from your team')
        .addStringOption(opt =>
          opt.setName('player')
            .setDescription('Player username or userid')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('captain')
        .setDescription('Set your captain (2x points)')
        .addStringOption(opt =>
          opt.setName('player')
            .setDescription('Player username or userid')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('View fantasy leaderboard')
    )
    .addSubcommand(sub =>
      sub.setName('gameweek')
        .setDescription('View current gameweek info')
    )
    .addSubcommand(sub =>
      sub.setName('player')
        .setDescription('View a player\'s fantasy stats')
        .addStringOption(opt =>
          opt.setName('player')
            .setDescription('Player username or userid')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('players')
        .setDescription('View all available fantasy players and their prices')
    ),

  new SlashCommandBuilder()
    .setName('fantasyadmin')
    .setDescription('Fantasy admin commands')
    .addSubcommand(sub =>
      sub.setName('newweek')
        .setDescription('Start a new gameweek')
        .addIntegerOption(opt =>
          opt.setName('number')
            .setDescription('Gameweek number')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('season')
            .setDescription('Season name')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('addstats')
        .setDescription('Add player stats for the gameweek')
        .addStringOption(opt =>
          opt.setName('player')
            .setDescription('Player username or userid')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('position')
            .setDescription('Position played')
            .setRequired(true)
            .addChoices(
              { name: 'Goalkeeper', value: 'Gk' },
              { name: 'Defender', value: 'Def' },
              { name: 'Midfielder', value: 'Mid' },
              { name: 'Attacker', value: 'Att' }
            )
        )
        .addIntegerOption(opt =>
          opt.setName('goals')
            .setDescription('Goals scored')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('assists')
            .setDescription('Assists')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('cleansheet')
            .setDescription('Clean sheet?')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('saves')
            .setDescription('Saves (GK only)')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('motm')
            .setDescription('Man of the match?')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('yellowcard')
            .setDescription('Yellow card?')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('redcard')
            .setDescription('Red card?')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('calculate')
        .setDescription('Calculate points for all fantasy teams')
    )
    .addSubcommand(sub =>
      sub.setName('endweek')
        .setDescription('End the current gameweek')
    )
    .addSubcommand(sub =>
      sub.setName('setprice')
        .setDescription('Set a player\'s fantasy price')
        .addStringOption(opt =>
          opt.setName('player')
            .setDescription('Player username or userid')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt.setName('price')
            .setDescription('Price in millions (e.g. 8.5)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('resetbudget')
        .setDescription('Reset a user\'s fantasy budget')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Discord user')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt.setName('amount')
            .setDescription('Budget amount (default 90)')
            .setRequired(false)
        )
    ),
].map(command => command.toJSON());

// Register commands when bot is ready
client.once('ready', async () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Permission check - only admins and specific role can use admin commands
  const ALLOWED_ROLE_ID = '1466150846101196870';
  const member = interaction.member;
  
  const hasPermission = 
    member.permissions.has(PermissionFlagsBits.Administrator) || 
    member.roles.cache.has(ALLOWED_ROLE_ID);

  // Commands that require admin permission
  const adminCommands = ['setteam', 'setdivision', 'setrating', 'suspend', 'sethof', 'setmanagement', 'setnationalteam', 'deleteplayer', 'setalt', 'fantasyadmin'];
  
  if (adminCommands.includes(commandName) && !hasPermission) {
    return interaction.reply({ 
      content: 'You do not have permission to use this command.', 
      ephemeral: true 
    });
  }

  // /teams command
  if (commandName === 'teams') {
    const embed = new EmbedBuilder()
      .setTitle('Valid Teams')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Division A', value: VALID_TEAMS['A'].join('\n'), inline: true },
        { name: 'Division B', value: VALID_TEAMS['B'].join('\n'), inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // /lookup command
  if (commandName === 'lookup') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('userid', userid)
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Player ${username || userid} not found in database.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Player: ${username || data.username || userid}`)
      .setDescription(`User ID: ${userid}`)
      .setColor(0x00ff00)
      .addFields(
        { name: 'Team', value: data.team || 'None', inline: true },
        { name: 'Division', value: data.division || 'None', inline: true },
        { name: 'National Team', value: data.nationalteam || 'None', inline: true },
        { name: 'Rating', value: String(data.rating ?? 0), inline: true },
        { name: 'Suspended', value: data.suspension ? 'Yes' : 'No', inline: true },
        { name: 'Semi', value: data.semi ? 'Yes' : 'No', inline: true },
        { name: 'Hall of Fame', value: data.hof || 'None', inline: true },
        { name: 'Management', value: data.management || 'None', inline: true },
        { name: 'Second Career', value: data.secondcareer ? 'Yes' : 'No', inline: true },
        { name: 'GK Mode', value: data.gkmode ? 'Yes' : 'No', inline: true },
        { name: 'Country', value: data.country || 'None', inline: true },
        { name: 'Fantasy Price', value: `£${data.fantasy_price || 5.0}m`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // /setteam command
  if (commandName === 'setteam') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const team = interaction.options.getString('team');
    const division = getTeamDivision(team);

    const { data, error } = await supabase
      .from('players')
      .update({ team, division })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s team to **${team}** (Division ${division})` });
  }

  // /setdivision command
  if (commandName === 'setdivision') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const division = interaction.options.getString('division');

    const { data, error } = await supabase
      .from('players')
      .update({ division })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s division to **${division}**` });
  }

  // /setrating command
  if (commandName === 'setrating') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const rating = interaction.options.getInteger('rating');

    const { data, error } = await supabase
      .from('players')
      .update({ rating })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s rating to **${rating}**` });
  }

  // /suspend command
  if (commandName === 'suspend') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const suspended = interaction.options.getBoolean('suspended');

    const { data, error } = await supabase
      .from('players')
      .update({ suspension: suspended })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `${username || userid} has been **${suspended ? 'suspended' : 'unsuspended'}**` });
  }

  // /sethof command
  if (commandName === 'sethof') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const position = interaction.options.getString('position');

    const { data, error } = await supabase
      .from('players')
      .update({ hof: position })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s Hall of Fame status to **${position}**` });
  }

  // /setmanagement command
  if (commandName === 'setmanagement') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const role = interaction.options.getString('role');

    const { data, error } = await supabase
      .from('players')
      .update({ management: role })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s management role to **${role}**` });
  }

  // /setnationalteam command
  if (commandName === 'setnationalteam') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const nationalteam = interaction.options.getString('nationalteam');

    const { data, error } = await supabase
      .from('players')
      .update({ nationalteam })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s national team to **${nationalteam}**` });
  }

  // /deleteplayer command
  if (commandName === 'deleteplayer') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await getUsernameFromId(userid);

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('userid', userid);

    if (error) {
      return interaction.reply({ content: `Failed to delete player.`, ephemeral: true });
    }

    return interaction.reply({ content: `Deleted ${username || userid} from the database.` });
  }

  // /setalt command
  if (commandName === 'setalt') {
    const input = interaction.options.getString('player');
    const userid = await resolveUserId(input);
    
    if (!userid) {
      return interaction.reply({ content: `Could not find Roblox user "${input}".`, ephemeral: true });
    }

    const username = await updateUsername(userid);
    const isalt = interaction.options.getBoolean('isalt');

    const { data, error } = await supabase
      .from('players')
      .update({ secondcareer: isalt })
      .eq('userid', userid)
      .select()
      .maybeSingle();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${username || userid}'s alt/second career status to **${isalt ? 'Yes' : 'No'}**` });
  }

  // ============ FANTASY COMMANDS ============
  if (commandName === 'fantasy') {
    const subcommand = interaction.options.getSubcommand();

    // /fantasy register
    if (subcommand === 'register') {
      const teamName = interaction.options.getString('teamname');
      const discordId = interaction.user.id;

      // Check if already registered
      const { data: existing } = await supabase
        .from('fantasy_teams')
        .select('*')
        .eq('owner_discord_id', discordId)
        .maybeSingle();

      if (existing) {
        return interaction.reply({ content: `You already have a fantasy team: **${existing.team_name}**`, ephemeral: true });
      }

      // Create team with 90m budget
      const { data, error } = await supabase
        .from('fantasy_teams')
        .insert({
          owner_discord_id: discordId,
          team_name: teamName,
          budget: 90.0,
          total_points: 0
        })
        .select()
        .single();

      if (error) {
        return interaction.reply({ content: `Failed to create team: ${error.message}`, ephemeral: true });
      }

      return interaction.reply({ content: `✅ Fantasy team **${teamName}** created!\n💰 Budget: **£90.0m**\n\nUse \`/fantasy pick\` to add players.` });
    }

    // /fantasy team
    if (subcommand === 'team') {
      const discordId = interaction.user.id;

      const { data: team } = await supabase
        .from('fantasy_teams')
        .select('*')
        .eq('owner_discord_id', discordId)
        .maybeSingle();

      if (!team) {
        return interaction.reply({ content: `You don't have a fantasy team yet. Use \`/fantasy register\` to create one.`, ephemeral: true });
      }

      const { data: selections } = await supabase
        .from('fantasy_selections')
        .select('*, players(username, team, fantasy_price)')
        .eq('fantasy_team_id', team.id);

      const gk = selections?.filter(s => s.position === 'Gk') || [];
      const def = selections?.filter(s => s.position === 'Def') || [];
      const mid = selections?.filter(s => s.position === 'Mid') || [];
      const att = selections?.filter(s => s.position === 'Att') || [];

      const formatPlayer = (s) => {
        const captain = s.is_captain ? ' ©' : '';
        const price = s.players?.fantasy_price || 5.0;
        return `${s.players?.username || 'Unknown'}${captain} - £${price}m`;
      };

      const embed = new EmbedBuilder()
        .setTitle(`⚽ ${team.team_name}`)
        .setColor(0x00ff00)
        .addFields(
          { name: '🧤 Goalkeeper (1)', value: gk.length > 0 ? gk.map(formatPlayer).join('\n') : 'Empty', inline: false },
          { name: '🛡️ Defenders (3)', value: def.length > 0 ? def.map(formatPlayer).join('\n') : 'Empty', inline: false },
          { name: '🎯 Midfielders (3)', value: mid.length > 0 ? mid.map(formatPlayer).join('\n') : 'Empty', inline: false },
          { name: '⚡ Attackers (2)', value: att.length > 0 ? att.map(formatPlayer).join('\n') : 'Empty', inline: false },
          { name: '💰 Budget', value: `£${(team.budget || 0).toFixed(1)}m`, inline: true },
          { name: '📊 Total Points', value: String(team.total_points || 0), inline: true },
          { name: '👥 Squad Size', value: `${selections?.length || 0}/9`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /fantasy pick
    if (subcommand === 'pick') {
      const discordId = interaction.user.id;
      const playerInput = interaction.options.getString('player');
      const position = interaction.options.getString('position');

      // Get fantasy team
      const { data: team } = await supabase
        .from('fantasy_teams')
        .select('*')
        .eq('owner_discord_id', discordId)
        .maybeSingle();

      if (!team) {
        return interaction.reply({ content: `You don't have a fantasy team yet. Use \`/fantasy register\` first.`, ephemeral: true });
      }

      // Resolve player
      const userid = await resolveUserId(playerInput);
      if (!userid) {
        return interaction.reply({ content: `Could not find player "${playerInput}".`, ephemeral: true });
      }

      const username = await getUsernameFromId(userid);

      // Check if player exists in database
      const { data: player } = await supabase
        .from('players')
        .select('*')
        .eq('userid', userid)
        .maybeSingle();

      if (!player) {
        return interaction.reply({ content: `${username || userid} is not registered in RUFL.`, ephemeral: true });
      }

      const playerPrice = player.fantasy_price || 5.0;

      // Check budget
      if ((team.budget || 0) < playerPrice) {
        return interaction.reply({ content: `You can't afford **${username}** (£${playerPrice}m). You have £${(team.budget || 0).toFixed(1)}m remaining.`, ephemeral: true });
      }

      // Check current squad size
      const { data: selections } = await supabase
        .from('fantasy_selections')
        .select('*')
        .eq('fantasy_team_id', team.id);

      if (selections && selections.length >= 9) {
        return interaction.reply({ content: `Your squad is full (9/9). Drop a player first.`, ephemeral: true });
      }

      // Check if player already in team
      const alreadyPicked = selections?.find(s => s.player_userid === parseInt(userid));
      if (alreadyPicked) {
        return interaction.reply({ content: `${username} is already in your team.`, ephemeral: true });
      }

      // Check position limits (1 GK, 3 DEF, 3 MID, 2 ATT)
      const positionCounts = {
        Gk: selections?.filter(s => s.position === 'Gk').length || 0,
        Def: selections?.filter(s => s.position === 'Def').length || 0,
        Mid: selections?.filter(s => s.position === 'Mid').length || 0,
        Att: selections?.filter(s => s.position === 'Att').length || 0
      };

      const positionLimits = { Gk: 1, Def: 3, Mid: 3, Att: 2 };

      if (positionCounts[position] >= positionLimits[position]) {
        return interaction.reply({ content: `You already have ${positionLimits[position]} ${position} player(s). Drop one first.`, ephemeral: true });
      }

      // Add player
      const { error } = await supabase
        .from('fantasy_selections')
        .insert({
          fantasy_team_id: team.id,
          player_userid: parseInt(userid),
          position: position,
          is_captain: false
        });

      if (error) {
        return interaction.reply({ content: `Failed to add player: ${error.message}`, ephemeral: true });
      }

      // Deduct from budget
      const newBudget = (team.budget || 90) - playerPrice;
      await supabase
        .from('fantasy_teams')
        .update({ budget: newBudget })
        .eq('id', team.id);

      return interaction.reply({ content: `✅ Added **${username}** (£${playerPrice}m) to your team as **${position}**\n💰 Remaining budget: **£${newBudget.toFixed(1)}m**` });
    }

    // /fantasy drop
    if (subcommand === 'drop') {
      const discordId = interaction.user.id;
      const playerInput = interaction.options.getString('player');

      const { data: team } = await supabase
        .from('fantasy_teams')
        .select('*')
        .eq('owner_discord_id', discordId)
        .maybeSingle();

      if (!team) {
        return interaction.reply({ content: `You don't have a fantasy team.`, ephemeral: true });
      }

      const userid = await resolveUserId(playerInput);
      if (!userid) {
        return interaction.reply({ content: `Could not find player "${playerInput}".`, ephemeral: true });
      }

      const username = await getUsernameFromId(userid);

      // Get player price for refund
      const { data: player } = await supabase
        .from('players')
        .select('fantasy_price')
        .eq('userid', userid)
        .maybeSingle();

      const playerPrice = player?.fantasy_price || 5.0;

      // Check if player is in team
      const { data: selection } = await supabase
        .from('fantasy_selections')
        .select('*')
        .eq('fantasy_team_id', team.id)
        .eq('player_userid', parseInt(userid))
        .maybeSingle();

      if (!selection) {
        return interaction.reply({ content: `${username} is not in your team.`, ephemeral: true });
      }

      const { error } = await supabase
        .from('fantasy_selections')
        .delete()
        .eq('fantasy_team_id', team.id)
        .eq('player_userid', parseInt(userid));

      if (error) {
        return interaction.reply({ content: `Failed to drop player.`, ephemeral: true });
      }

      // Refund budget
      const newBudget = (team.budget || 0) + playerPrice;
      await supabase
        .from('fantasy_teams')
        .update({ budget: newBudget })
        .eq('id', team.id);

      return interaction.reply({ content: `✅ Dropped **${username}** from your team.\n💰 Refunded: **£${playerPrice}m** | New budget: **£${newBudget.toFixed(1)}m**` });
    }

    // /fantasy captain
    if (subcommand === 'captain') {
      const discordId = interaction.user.id;
      const playerInput = interaction.options.getString('player');

      const { data: team } = await supabase
        .from('fantasy_teams')
        .select('*')
        .eq('owner_discord_id', discordId)
        .maybeSingle();

      if (!team) {
        return interaction.reply({ content: `You don't have a fantasy team.`, ephemeral: true });
      }

      const userid = await resolveUserId(playerInput);
      if (!userid) {
        return interaction.reply({ content: `Could not find player "${playerInput}".`, ephemeral: true });
      }

      const username = await getUsernameFromId(userid);

      // Check player is in team
      const { data: selection } = await supabase
        .from('fantasy_selections')
        .select('*')
        .eq('fantasy_team_id', team.id)
        .eq('player_userid', parseInt(userid))
        .maybeSingle();

      if (!selection) {
        return interaction.reply({ content: `${username} is not in your team.`, ephemeral: true });
      }

      // Remove captain from all
      await supabase
        .from('fantasy_selections')
        .update({ is_captain: false })
        .eq('fantasy_team_id', team.id);

      // Set new captain
      await supabase
        .from('fantasy_selections')
        .update({ is_captain: true })
        .eq('fantasy_team_id', team.id)
        .eq('player_userid', parseInt(userid));

      return interaction.reply({ content: `✅ **${username}** is now your captain! They'll earn 2x points.` });
    }

    // /fantasy leaderboard
    if (subcommand === 'leaderboard') {
      const { data: teams } = await supabase
        .from('fantasy_teams')
        .select('*')
        .order('total_points', { ascending: false })
        .limit(10);

      if (!teams || teams.length === 0) {
        return interaction.reply({ content: `No fantasy teams registered yet.`, ephemeral: true });
      }

      const leaderboard = teams.map((t, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `${medal} **${t.team_name}** - ${t.total_points || 0} pts`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('🏆 Fantasy Leaderboard')
        .setColor(0xffd700)
        .setDescription(leaderboard)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /fantasy gameweek
    if (subcommand === 'gameweek') {
      const { data: gameweek } = await supabase
        .from('fantasy_gameweeks')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (!gameweek) {
        return interaction.reply({ content: `No active gameweek.`, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📅 Gameweek ${gameweek.gameweek}`)
        .setColor(0x00ff00)
        .addFields(
          { name: 'Season', value: gameweek.season, inline: true },
          { name: 'Status', value: 'Active', inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /fantasy player
    if (subcommand === 'player') {
      const playerInput = interaction.options.getString('player');
      const userid = await resolveUserId(playerInput);

      if (!userid) {
        return interaction.reply({ content: `Could not find player "${playerInput}".`, ephemeral: true });
      }

      const username = await getUsernameFromId(userid);

      const { data: stats } = await supabase
        .from('fantasy_player_stats')
        .select('*, fantasy_gameweeks(gameweek, season)')
        .eq('player_userid', parseInt(userid))
        .order('id', { ascending: false })
        .limit(5);

      if (!stats || stats.length === 0) {
        return interaction.reply({ content: `No fantasy stats found for ${username}.`, ephemeral: true });
      }

      const totalPoints = stats.reduce((sum, s) => sum + (s.points || 0), 0);
      const statLines = stats.map(s => 
        `GW${s.fantasy_gameweeks?.gameweek || '?'}: ${s.points || 0} pts (${s.goals || 0}G, ${s.assists || 0}A${s.clean_sheet ? ', CS' : ''}${s.motm ? ', MOTM' : ''})`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${username} - Fantasy Stats`)
        .setColor(0x00ff00)
        .addFields(
          { name: 'Total Points', value: String(totalPoints), inline: true },
          { name: 'Recent Gameweeks', value: statLines || 'No stats', inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /fantasy players
    if (subcommand === 'players') {
      const { data: players } = await supabase
        .from('players')
        .select('userid, username, team, fantasy_price')
        .order('fantasy_price', { ascending: false })
        .limit(25);

      if (!players || players.length === 0) {
        return interaction.reply({ content: `No players found.`, ephemeral: true });
      }

      const playerList = players.map(p => 
        `**${p.username || p.userid}** - ${p.team || 'Free Agent'} - £${p.fantasy_price || 5.0}m`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('📋 Available Fantasy Players')
        .setColor(0x00ff00)
        .setDescription(playerList)
        .setFooter({ text: 'Use /fantasy pick <player> <position> to add to your team' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }

  // ============ FANTASY ADMIN COMMANDS ============
  if (commandName === 'fantasyadmin') {
    const subcommand = interaction.options.getSubcommand();

    // /fantasyadmin newweek
    if (subcommand === 'newweek') {
      const number = interaction.options.getInteger('number');
      const season = interaction.options.getString('season');

      // Deactivate all gameweeks
      await supabase
        .from('fantasy_gameweeks')
        .update({ is_active: false })
        .eq('is_active', true);

      // Create new gameweek
      const { data, error } = await supabase
        .from('fantasy_gameweeks')
        .insert({
          gameweek: number,
          season: season,
          is_active: true,
          start_date: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return interaction.reply({ content: `Failed to create gameweek: ${error.message}`, ephemeral: true });
      }

      return interaction.reply({ content: `✅ **Gameweek ${number}** (${season}) is now active!` });
    }

    // /fantasyadmin addstats
    if (subcommand === 'addstats') {
      const playerInput = interaction.options.getString('player');
      const position = interaction.options.getString('position');
      const goals = interaction.options.getInteger('goals') || 0;
      const assists = interaction.options.getInteger('assists') || 0;
      const cleanSheet = interaction.options.getBoolean('cleansheet') || false;
      const saves = interaction.options.getInteger('saves') || 0;
      const motm = interaction.options.getBoolean('motm') || false;
      const yellowCard = interaction.options.getBoolean('yellowcard') || false;
      const redCard = interaction.options.getBoolean('redcard') || false;

      // Get active gameweek
      const { data: gameweek } = await supabase
        .from('fantasy_gameweeks')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (!gameweek) {
        return interaction.reply({ content: `No active gameweek. Create one first with \`/fantasyadmin newweek\`.`, ephemeral: true });
      }

      const userid = await resolveUserId(playerInput);
      if (!userid) {
        return interaction.reply({ content: `Could not find player "${playerInput}".`, ephemeral: true });
      }

      const username = await getUsernameFromId(userid);

      // Calculate points automatically
      const stats = { position, goals, assists, clean_sheet: cleanSheet, saves, motm, yellow_card: yellowCard, red_card: redCard };
      const points = calculateFantasyPoints(stats);

      // Insert stats
      const { error } = await supabase
        .from('fantasy_player_stats')
        .insert({
          gameweek_id: gameweek.id,
          player_userid: parseInt(userid),
          position: position,
          goals: goals,
          assists: assists,
          clean_sheet: cleanSheet,
          saves: saves,
          motm: motm,
          yellow_card: yellowCard,
          red_card: redCard,
          points: points
        });

      if (error) {
        return interaction.reply({ content: `Failed to add stats: ${error.message}`, ephemeral: true });
      }

      return interaction.reply({ content: `✅ Added stats for **${username}**: ${goals}G, ${assists}A${cleanSheet ? ', CS' : ''}${motm ? ', MOTM' : ''} = **${points} points**` });
    }

    // /fantasyadmin calculate
    if (subcommand === 'calculate') {
      // Get active gameweek
      const { data: gameweek } = await supabase
        .from('fantasy_gameweeks')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (!gameweek) {
        return interaction.reply({ content: `No active gameweek.`, ephemeral: true });
      }

      // Get all fantasy teams with selections
      const { data: teams } = await supabase
        .from('fantasy_teams')
        .select('*, fantasy_selections(*)');

      if (!teams || teams.length === 0) {
        return interaction.reply({ content: `No fantasy teams to calculate.`, ephemeral: true });
      }

      let updated = 0;

      for (const team of teams) {
        let teamPoints = 0;

        for (const selection of team.fantasy_selections || []) {
          // Get player's stats for this gameweek
          const { data: playerStats } = await supabase
            .from('fantasy_player_stats')
            .select('*')
            .eq('gameweek_id', gameweek.id)
            .eq('player_userid', selection.player_userid)
            .maybeSingle();

          if (playerStats) {
            let points = playerStats.points || 0;
            if (selection.is_captain) {
              points *= 2; // Captain gets double
            }
            teamPoints += points;
          }
        }

        // Update team total
        await supabase
          .from('fantasy_teams')
          .update({ total_points: (team.total_points || 0) + teamPoints })
          .eq('id', team.id);

        updated++;
      }

      return interaction.reply({ content: `✅ Calculated points for **${updated}** fantasy teams for Gameweek ${gameweek.gameweek}.` });
    }

    // /fantasyadmin endweek
    if (subcommand === 'endweek') {
      const { data: gameweek } = await supabase
        .from('fantasy_gameweeks')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (!gameweek) {
        return interaction.reply({ content: `No active gameweek.`, ephemeral: true });
      }

      await supabase
        .from('fantasy_gameweeks')
        .update({ is_active: false, end_date: new Date().toISOString() })
        .eq('id', gameweek.id);

      return interaction.reply({ content: `✅ Gameweek ${gameweek.gameweek} has ended.` });
    }

    // /fantasyadmin setprice
    if (subcommand === 'setprice') {
      const playerInput = interaction.options.getString('player');
      const price = interaction.options.getNumber('price');

      const userid = await resolveUserId(playerInput);
      if (!userid) {
        return interaction.reply({ content: `Could not find player "${playerInput}".`, ephemeral: true });
      }

      const username = await updateUsername(userid);

      const { error } = await supabase
        .from('players')
        .update({ fantasy_price: price })
        .eq('userid', userid);

      if (error) {
        return interaction.reply({ content: `Failed to set price: ${error.message}`, ephemeral: true });
      }

      return interaction.reply({ content: `✅ Set **${username}**'s fantasy price to **£${price}m**` });
    }

    // /fantasyadmin resetbudget
    if (subcommand === 'resetbudget') {
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getNumber('amount') || 90.0;

      const { data, error } = await supabase
        .from('fantasy_teams')
        .update({ budget: amount })
        .eq('owner_discord_id', user.id)
        .select()
        .maybeSingle();

      if (error || !data) {
        return interaction.reply({ content: `Failed to reset budget. User may not have a fantasy team.`, ephemeral: true });
      }

      return interaction.reply({ content: `✅ Reset **${user.username}**'s fantasy budget to **£${amount}m**` });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// ============ EXPRESS API FOR ROBLOX ============
const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'API is running' });
});

// Get valid teams
app.get('/teams', (req, res) => {
  res.json({ 
    success: true, 
    divisions: VALID_TEAMS,
    allTeams: ALL_TEAMS
  });
});

// Get player
app.get('/player/:userid', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('userid', req.params.userid)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }
  res.json({ success: true, ...data });
});

// Create player
app.post('/player', async (req, res) => {
  if (req.body.team && !ALL_TEAMS.includes(req.body.team)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid team name. Only official team names can be used.',
      validTeams: ALL_TEAMS
    });
  }

  if (req.body.division && !VALID_DIVISIONS.includes(req.body.division)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid division. Only official divisions can be used.',
      validDivisions: VALID_DIVISIONS
    });
  }

  const { data, error } = await supabase
    .from('players')
    .insert(req.body)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  res.json({ success: true, ...data });
});

// Update player
app.patch('/player/:userid', async (req, res) => {
  if (req.body.team && !ALL_TEAMS.includes(req.body.team)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid team name. Only official team names can be used.',
      validTeams: ALL_TEAMS
    });
  }

  if (req.body.division && !VALID_DIVISIONS.includes(req.body.division)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid division. Only official divisions can be used.',
      validDivisions: VALID_DIVISIONS
    });
  }

  const { data, error } = await supabase
    .from('players')
    .update(req.body)
    .eq('userid', req.params.userid)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  res.json({ success: true, ...data });
});

// Delete player
app.delete('/player/:userid', async (req, res) => {
  const { error } = await supabase
    .from('players')
    .delete()
    .eq('userid', req.params.userid);

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  res.json({ success: true });
});

// Get all players (for leaderboards etc)
app.get('/players', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('rating', { ascending: false });

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  res.json({ success: true, players: data });
});

// Get players by team
app.get('/team/:teamname', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team', req.params.teamname);

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  res.json({ success: true, players: data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
