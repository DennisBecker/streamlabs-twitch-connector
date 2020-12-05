//import * as tmi from 'tmi.js';
const tmi = require('tmi.js');
import dotenv from 'dotenv';
import lodash from 'lodash';
import StreamlabsClient from './StreamlabsClient';

dotenv.config();

// Define configuration options
const opts: Object = {
  identity: {
    username: process.env.BOT_USERNAME,
    password: process.env.OAUTH_TOKEN
  },
  channels: [
    process.env.CHANNEL_NAME ? process.env.CHANNEL_NAME : ''
  ]
};

// Create a client with our options

const twitchClient = new tmi.client(opts);
const streamlabsSocket = new StreamlabsClient(process.env.STREAMLABS_TOKEN, process.env.STREAMLABS_WEBSOCKET_PORT);
streamlabsSocket.connect();

// Register our event handlers (defined below)
twitchClient.on('message', onMessageHandler);
twitchClient.on('connected', onConnectedHandler);

// Connect to Twitch:
twitchClient.connect();

// Called every time a message comes in
function onMessageHandler (target: string, context: Object, msg: string, self: string) {
  if (self) { return; } // Ignore messages from the bot

  // Remove whitespace from chat message
  const commandName = msg.trim();

  // If the command is known, let's execute it
  let scene:any;
  switch(commandName) {
    case '!d20':
      const num = rollDice();
      twitchClient.say(target, `You rolled a ${num}. Link: https://glitch.com/~twitch-chatbot`);
      console.log(`* Executed ${commandName} command`);
      break;
    case 'szene1':
      scene = lodash.find(streamlabsSocket.scenes, {name: 'Gaming'});
      streamlabsSocket.switchScene(scene.id);
      break;
    case 'szene2':
      scene = lodash.find(streamlabsSocket.scenes, {name: 'Chatting'});
      streamlabsSocket.switchScene(scene.id);
      break;
    default:
      console.log(`* Unknown command ${commandName}`);
  }
}

// Function called when the "dice" command is issued
function rollDice () {
  const sides = 20;
  return Math.floor(Math.random() * sides) + 1;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr: string, port: number) {
  console.log(`* Connected to ${addr}:${port}`);
}
