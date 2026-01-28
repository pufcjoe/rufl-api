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

  // Permission check - only admins and specific role can use commands
  const ALLOWED_ROLE_ID = '1466150846101196870';
  const member = interaction.member;
  
  const hasPermission = 
    member.permissions.has(PermissionFlagsBits.Administrator) || 
    member.roles.cache.has(ALLOWED_ROLE_ID);
  
  if (!hasPermission) {
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
        { name: 'Country', value: data.country || 'None', inline: true }
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
