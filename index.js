require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// ============ SUPABASE SETUP ============
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
    .setDescription('Look up a player by their Roblox UserId')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The Roblox UserId')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setteam')
    .setDescription('Set a player\'s team')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The Roblox UserId')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('team')
        .setDescription('The team name')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setdivision')
    .setDescription('Set a player\'s division')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The Roblox UserId')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('division')
        .setDescription('The division (e.g., A, B, C)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setrating')
    .setDescription('Set a player\'s rating')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The Roblox UserId')
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
      option.setName('userid')
        .setDescription('The Roblox UserId')
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
      option.setName('userid')
        .setDescription('The Roblox UserId')
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
      option.setName('userid')
        .setDescription('The Roblox UserId')
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
      option.setName('userid')
        .setDescription('The Roblox UserId')
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
      option.setName('userid')
        .setDescription('The Roblox UserId')
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

  // /lookup command
  if (commandName === 'lookup') {
    const userid = interaction.options.getString('userid');
    
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('userid', userid)
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Player with UserId ${userid} not found.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Player: ${userid}`)
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
    const userid = interaction.options.getString('userid');
    const team = interaction.options.getString('team');

    const { data, error } = await supabase
      .from('players')
      .update({ team })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${userid}'s team to **${team}**` });
  }

  // /setdivision command
  if (commandName === 'setdivision') {
    const userid = interaction.options.getString('userid');
    const division = interaction.options.getString('division');

    const { data, error } = await supabase
      .from('players')
      .update({ division })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${userid}'s division to **${division}**` });
  }

  // /setrating command
  if (commandName === 'setrating') {
    const userid = interaction.options.getString('userid');
    const rating = interaction.options.getInteger('rating');

    const { data, error } = await supabase
      .from('players')
      .update({ rating })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${userid}'s rating to **${rating}**` });
  }

  // /suspend command
  if (commandName === 'suspend') {
    const userid = interaction.options.getString('userid');
    const suspended = interaction.options.getBoolean('suspended');

    const { data, error } = await supabase
      .from('players')
      .update({ suspension: suspended })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `${userid} has been **${suspended ? 'suspended' : 'unsuspended'}**` });
  }

  // /sethof command
  if (commandName === 'sethof') {
    const userid = interaction.options.getString('userid');
    const position = interaction.options.getString('position');

    const { data, error } = await supabase
      .from('players')
      .update({ hof: position })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${userid}'s Hall of Fame status to **${position}**` });
  }

  // /setmanagement command
  if (commandName === 'setmanagement') {
    const userid = interaction.options.getString('userid');
    const role = interaction.options.getString('role');

    const { data, error } = await supabase
      .from('players')
      .update({ management: role })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${userid}'s management role to **${role}**` });
  }

  // /setnationalteam command
  if (commandName === 'setnationalteam') {
    const userid = interaction.options.getString('userid');
    const nationalteam = interaction.options.getString('nationalteam');

    const { data, error } = await supabase
      .from('players')
      .update({ nationalteam })
      .eq('userid', userid)
      .select()
      .single();

    if (error || !data) {
      return interaction.reply({ content: `Failed to update player. They may not exist in the database.`, ephemeral: true });
    }

    return interaction.reply({ content: `Updated ${userid}'s national team to **${nationalteam}**` });
  }

  // /deleteplayer command
  if (commandName === 'deleteplayer') {
    const userid = interaction.options.getString('userid');

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('userid', userid);

    if (error) {
      return interaction.reply({ content: `Failed to delete player.`, ephemeral: true });
    }

    return interaction.reply({ content: `Deleted player ${userid} from the database.` });
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

// Get player
app.get('/player/:userid', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('userid', req.params.userid)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }
  res.json({ success: true, ...data });
});

// Create player
app.post('/player', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .insert(req.body)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  res.json({ success: true, ...data });
});

// Update player
app.patch('/player/:userid', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .update(req.body)
    .eq('userid', req.params.userid)
    .select()
    .single();

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
