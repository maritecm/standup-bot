"use strict"; // since I hate not using semicolons

/**
 * Required Imports
 *  - dotenv: .env support
 *  - fs: file system support (for reading ./commands)
 *  - mongoose: mongoDB client
 *  - discord.js: discord (duh)
 *  - schedule: for running the cron jobs
 *  - standup.model: the model for the standup stored in mongo
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { Client, MessageEmbed, Collection } = require("discord.js");
const schedule = require("node-schedule");
const standupModel = require("./models/standup.model");

const PREFIX = "!";

const standupIntroMessage = new MessageEmbed()
  .setColor("#B3D556")
  .setTitle("Daily Standup CIC Team")
  .setURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  .setDescription(
    "This is the newly generated text channel used for daily standups in the CIC Team! :tada:"
  )
  .addFields(
    {
      name: "Introduction",
      value: `Hi! I'm Stan D. Upbot and I will be facilitating your daily standups from now on.\nTo view all available commands, try \`${PREFIX}help\`.`,
    },
    {
      name: "How does this work?",
      value: `Anytime before the standup time \`9:30 AM AST\`, members would private DM me with the command \`${PREFIX}show\`, I will present the standup prompt and they will type their response using the command \`${PREFIX}reply @<optional_serverId> [your-message-here]\`. I will then save their response in my *secret special chamber of data*, and during the designated standup time, I would present everyone's answer to \`#daily-standups\`.`,
    },
    {
      name: "Getting started",
      value: `*Currently*, there are no members in the standup! To add a member try \`${PREFIX}am <User>\`.`,
    }
  )
  .setFooter(
    "https://github.com/adnanjt/standup-bot",
    "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
  )
  .setTimestamp();

const dailyStandupSummary = new MessageEmbed()
  .setColor("#B3D556")
  .setTitle("Daily Standup CIC Team")
  .setURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  .setTimestamp();

// lists .js files in commands dir
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

// init bot client with a collection of commands
const bot = new Client();
bot.commands = new Collection();

// Imports the command file + adds the command to the bot commands collection
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  bot.commands.set(command.name, command);
}

// mongodb setup with mongoose
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .catch((e) => console.error(e));

mongoose.connection.once("open", () => console.log("mongoDB connected"));

bot.once("ready", () => console.log("Discord Bot Ready App is Up!!!"));

// when a user enters a command
bot.on("message", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (!bot.commands.has(commandName)) return;

  if (message.mentions.users.has(bot.user.id))
    return message.channel.send(":robot:");

  const command = bot.commands.get(commandName);

  if (command.guildOnly && message.channel.type === "dm") {
    return message.channel.send("Hmm, that command cannot be used in a dm!");
  }

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.channel.send(`Error 8008135: Something went wrong!`);
  }
});

bot.on("guildCreate", async (guild) => {
  // creates the text channel
  const channel = await guild.channels.create("daily-standups", {
    type: "text",
    topic: "Standup Meeting Channel CIC Team",
  });

  // creates the database model
  const newStandup = new standupModel({
    _id: guild.id,
    channelId: channel.id,
    members: [],
    responses: new Map(),
  });

  newStandup
    .save()
    .then(() => console.log("Howdy!"))
    .catch((err) => console.error(err));

  await channel.send(standupIntroMessage);
});

// delete the mongodb entry
bot.on("guildDelete", (guild) => {
  standupModel
    .findByIdAndDelete(guild.id)
    .then(() => console.log("Peace!"))
    .catch((err) => console.error(err));
});

/**
 * Cron Job: 9:30:00 AM AST - Go through each standup and output the responses to the channel
 */
let cron = schedule.scheduleJob(
  { hour: 14, minute: 30, dayOfWeek: new schedule.Range(1, 5) },
  (time) => {
    console.log(`[${time}] - CRON JOB START`);
    standupModel
      .find()
      .then((standups) => {
        standups.forEach((standup) => {
          let memberResponses = [];
          let missingMembers = [];
          standup.members.forEach((id) => {
            if (standup.responses.has(id)) {
              memberResponses.push({
                name: `-`,
                value: `<@${id}>\n${standup.responses.get(id)}`,
              });
              standup.responses.delete(id);
            } else {
              missingMembers.push(id);
            }
          });
          let missingString = "Hooligans: ";
          if (!missingMembers.length) missingString += ":man_shrugging:";
          else missingMembers.forEach((id) => (missingString += `<@${id}> `));
          bot.channels.cache
            .get(standup.channelId)
            .send(
              new MessageEmbed(dailyStandupSummary)
                .setDescription(missingString)
                .addFields(memberResponses)
            );
          standup
            .save()
            .then(() =>
              console.log(`[${new Date()}] - ${standup._id} RESPONSES CLEARED`)
            )
            .catch((err) => console.error(err));
        });
      })
      .catch((err) => console.error(err));
  }
);

bot.login(process.env.DISCORD_TOKEN);
