'use strict';

const session = require('express-session');
const express = require('express');
const http = require('http');
const uuid = require('uuid');
const bodyParser = require('body-parser');

const WebSocket = require('ws');

const app = express();
const map = new Map();
const gamePopulation = new Map();

// create a unique sessions per visitor stored as a cookie.
const sessionParser = session({
  saveUninitialized: false,
  secret: 'alibubalay',
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: 172800000
  }
});

app.use(express.static('public'));
app.use(sessionParser);
app.use(bodyParser.json());

// create session
app.post('/login', function (req, res) {
  // send error if the user is already logged in
  if (req.session.userId != null){
    res.send({result: '400', message: 'already logged in.'});
    return;
  }
  // create set visitor's session
  const id = uuid.v4();
  console.log(`Setting session for user ${id}`);
  req.session.userId = id;
  res.send({ result: 'OK', message: 'Session created' });
});

// create a game
app.post('/game/create', function (req, res) {
  console.log(`got game create: ${req.body.gameId} from ${req.session.userId}`);
  const id = uuid.v4();
  gamePopulation.set(id, []);
  console.log(gamePopulation);
  res.send({ result: 'OK', message: {gameId: id} });
});

// draw a card in the game
app.post('/game/:gameId/draw', function (req, res) {
  const gameId = req.params.gameId;
  console.log(`got request to draw a card in ${gameId} from ${req.session.userId}`);
  const participants = gamePopulation.get(gameId);
  // does the game exist?
  if (participants == null){
    res.send({ result: '400', message: 'game does not exist or you are not in that game.' });
    console.warn(`${req.session.userId} tried to draw in game ${gameId} that didn't exist.`);
    return;
  }
  const participant = participants.find(part => part.userId === req.session.userId);
  // are they a participant of that game?
  if (participant == null){
    res.send({ result: '400', message: 'game does not exist or you are not in that game.' });
    console.warn(`${req.session.userId} tried to draw in game ${gameId} that he wasn't a participant.`);
    return;
  }
  // draw a card
  participant.cards.push('newCard');
  console.log(`${participant.userId} now has ${participant.cards.length} cards`);
  console.log(gamePopulation);
  participants.forEach(part => {
    map.get(part.userId).send("someone got a card");
  });
  res.send({ result: 'OK', message: 'card drawn' });
});

app.post('/game/:gameId/join', function (req, res) {
  let gameId = req.params.gameId;
  console.log(`got request to join ${gameId} from ${req.session.userId}`);
  const participants = gamePopulation.get(gameId);
  // does the game exist?
  if (participants == null){
    res.send({ result: '400', message: 'game does not exist.' });
    console.log(`${req.session.userId} tried to join game ${gameId} that didn't exist.`);
    return;
  }
  // is the user already a participant of a game?
  let alreadyInGame = false;
  gamePopulation.forEach((value, key, map) => {
    if (value.find(val => val.userId === req.session.userId) != null){
      alreadyInGame = true;
    }
  })
  if (alreadyInGame){
    res.send({ result: '400', message: 'you can only be in 1 game.' });
    console.log(`${req.session.userId} tried to join game ${gameId} when they were already in a game.`);
    return;
  }
  // join the game
  var participant = {
    userId: req.session.userId,
    cards: []
  }
  participants.push(participant);
  gamePopulation.set(gameId, participants);
  console.log(gamePopulation);
  res.send({ result: 'OK', message: 'game joined' });
});

// log out from session
app.delete('/logout', function (request, response) {
  const ws = map.get(request.session.userId);

  console.log(`Destroying session from ${request.session.userId} `);
  request.session.destroy(function () {
    if (ws) {
      ws.close();
    }
    response.send({ result: 'OK', message: 'Session destroyed' });
  });
});

//
// Create HTTP server by ourselves.
//
const server = http.createServer(app);
const wss = new WebSocket.Server({ clientTracking: false, noServer: true });

server.on('upgrade', function (request, socket, head) {
  console.log('Parsing session from request...');

  sessionParser(request, {}, () => {
    if (!request.session.userId) {
      console.warn('someone tried to open a socket without a session.');
      socket.destroy();
      return;
    }

    console.log('Session is parsed!');

    wss.handleUpgrade(request, socket, head, function (ws) {
      wss.emit('connection', ws, request);
    });
  });
});

wss.on('connection', function (ws, request) {
  const userId = request.session.userId;

  map.set(userId, ws);

  ws.on('message', function (message) {
    //
    // Here we can now use session parameters.
    //
    console.log(`Received message ${message} from user ${userId}`);
    // const msg = JSON.parse(message);
    // switch (msg.type){
    //   case 'join':
    //     console.log("join");
    //     var participants = gamePopulation.get(msg.gameId);
    //     if (!participants.find(participant => participant === userId)){
    //       participants.push(userId);
    //       gamePopulation.set(msg.gameId, participants);
    //     }
    //     console.log(gamePopulation);
    //     break;
    //   default:
    //     console.log("unknown");
    //     break;
    // }
  });

  ws.on('close', function () {
    map.delete(userId);
  });
});


//
// Start the server.
//
server.listen(8080, function () {
  console.log('Listening on http://localhost:8080');
});
