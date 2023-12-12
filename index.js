const express = require("express");
const http = require("http");
const app = express();
const port = process.env.PORT || 3030;
var server = http.createServer(app);
var admin = require("firebase-admin");
var io = require("socket.io")(server);
var serviceAccount = require("./pan-and-pot-firebase-adminsdk-tx0ic-e7b003e531.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pan-and-pot-default-rtdb.firebaseio.com",
});

//COLLECTIONS
var db = admin.firestore();
let room = db.collection("room");

io.on("connection", (socket) => {
  console.log("Connected");

  socket.on("createRoom", async ({ nickname, code }) => {
    try {
      const docRef = await room.add({
        occupancy: 2,
        currentRound: 1,
        players: [
          {
            socketID: socket.id,
            nickname: nickname,
            code: code,
          },
        ],
        scores: [
          {
            socketID: null,
            pan: null,
            pot: null,
            code: null,
          },
        ],
        isjoin: true,
        turn: {
          socketID: socket.id,
          nickname: nickname,
        },
      });

      const docSnapshot = await docRef.get();
      const data = docSnapshot.data();
      const roomId = docRef.id.toString();
      data.id = roomId;
      socket.join(roomId);

      io.to(roomId).emit("createRoomSuccess", data);
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("joinRoom", async ({ nickname, roomId, code }) => {
    try {
      if (!roomId.match(/^[a-zA-Z0-9_-]{20}$/)) {
        socket.emit("error", "Please enter a valid room ID");
        return;
      }
      let game_room = await room.doc(roomId).get();
      if (!game_room.exists) {
        socket.emit("error", "Room ID does not exist please check again");
        return;
      }
      let data = game_room.data();
      if (data.isjoin) {
        let newplayer = {
          nickname: nickname,
          socketID: socket.id,
          code: code,
        };

        let players = data.players;
        players.push(newplayer);

        await room.doc(roomId).update({
          players: players,
          isjoin: false,
        });

        const updatedRoom = await room.doc(roomId).get();
        const updatedData = updatedRoom.data();
        updatedData.id = roomId;
        socket.join(roomId);
        io.to(roomId).emit("joinRoomSuccess", updatedData);
        io.to(roomId).emit("updatePlayers", updatedData.players);
        io.to(roomId).emit("updateRoom", updatedData);
      } else {
        socket.emit("error", "This game is already in progress");
        return;
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("guessCode", async ({ socketID, roomId, code }) => {
    try {
      let game_room = await room.doc(roomId).get();
      let data = game_room.data();
      let playnick = data.players.find(
        (player) => player.socketID == socketID
      );

      const otherPlayer = data.players.find(
        (player) => player.socketID !== socketID
      );
      const {
        socketID: otherSocketID,
        nickname: otherNickname,
        code: othercode,
      } = otherPlayer;

      let userPan = 0;
      let userPot = 0;

      for (let i = 0; i < code.length; i++) {
        if (othercode.includes(code[i])) {
          userPan++;
          if (othercode[i] === code[i]) {
            userPot++;
          }
        }
      }

      let newscores = {
        socketID: socketID,
        pan: userPan,
        pot: userPot,
        code: code,
      };

      let score = data.scores;

      score.push(newscores);

      await room.doc(roomId).update({
        turn: {
          socketID: otherSocketID,
          nickname: otherNickname,
        },
        scores: score,
      });

      const updatedRoom = await room.doc(roomId).get();
      const updatedData = updatedRoom.data();
      updatedData.id = roomId;
      io.to(roomId).emit("updateRoom", updatedData);
      if(userPan == 4 && userPot == 4){
        let windata = { 
          nickname: playnick.nickname, 
          code
        }
        io.to(roomId).emit("win", windata);
      }else{
        io.to(roomId).emit("panpot", `${playnick.nickname} got: ${userPan} Pan ${userPot} Pot`);
      }
    } catch (error) {
      console.log(error);
    }
  });
});

app.use(express.json());

server.listen(port, "0.0.0.0", () => {
  console.log("Server started and running");
});
