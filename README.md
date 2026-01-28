# RUFL API

API and Discord bot for the RUFL Roblox game database.

## Setup

1. Clone this repo
2. Run `npm install`
3. Create a `.env` file based on `.env.example`
4. Run `npm start`

## Environment Variables

- `DISCORD_TOKEN` - Your Discord bot token
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase service role key

## API Endpoints

- `GET /player/:userid` - Get a player
- `POST /player` - Create a player
- `PATCH /player/:userid` - Update a player
- `DELETE /player/:userid` - Delete a player
- `GET /players` - Get all players
- `GET /team/:teamname` - Get players by team

## Discord Commands

- `/lookup` - Look up a player
- `/setteam` - Set a player's team
- `/setdivision` - Set a player's division
- `/setrating` - Set a player's rating
- `/suspend` - Suspend/unsuspend a player
- `/sethof` - Set Hall of Fame position
- `/setmanagement` - Set management role
- `/setnationalteam` - Set national team
- `/deleteplayer` - Delete a player
