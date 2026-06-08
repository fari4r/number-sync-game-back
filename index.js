const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: "https://lucent-sawine-e2ece4.netlify.app",
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://lucent-sawine-e2ece4.netlify.app",
    methods: ["GET", "POST"],
  },
});

// Structure: { roomId: { players: { socketId: { username, choice } }, rematches: [socketId, socketId] } }
const rooms = {};

io.on("connection", (socket) => {
  console.log(`📡 Mind connected: ${socket.id}`);

  // --- Create Room ---
  socket.on("create_room", ({ roomId, username }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { players: {}, rematches: [] };
      socket.join(roomId);
      rooms[roomId].players[socket.id] = { username, choice: null };

      socket.emit("room_joined", roomId);
      io.to(roomId).emit("room_data", rooms[roomId]);
    } else {
      socket.emit(
        "error_message",
        "Room conflict. Please generate a new hash."
      );
    }
  });

  // --- Join Room ---
  socket.on("join_room", ({ roomId, username }) => {
    if (rooms[roomId]) {
      socket.join(roomId);
      rooms[roomId].players[socket.id] = { username, choice: null };

      socket.emit("room_joined", roomId);
      io.to(roomId).emit("room_data", rooms[roomId]);
    } else {
      socket.emit("error_message", "Room code not found!");
    }
  });

  // --- Submit Choices ---
  socket.on("submit_choice", ({ roomId, choice }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      room.players[socket.id].choice = choice;

      const playerArray = Object.values(room.players);
      const allChosen = playerArray.every((p) => p.choice !== null);

      if (allChosen && playerArray.length > 1) {
        const firstChoice = playerArray[0].choice;
        const isMatch = playerArray.every((p) => p.choice === firstChoice);

        io.to(roomId).emit("game_result", {
          result: isMatch ? "WIN" : "LOSE",
          choices: room.players,
        });
      } else {
        io.to(roomId).emit("room_data", room);
      }
    }
  });

  // --- Vote to Play Again (Rematch) ---
  socket.on("reset_game", ({ roomId }) => {
    const room = rooms[roomId];
    if (room) {
      if (!room.rematches.includes(socket.id)) {
        room.rematches.push(socket.id);
      }

      const totalPlayersInRoom = Object.keys(room.players).length;

      if (
        room.rematches.length >= totalPlayersInRoom &&
        totalPlayersInRoom > 1
      ) {
        for (const id in room.players) {
          room.players[id].choice = null;
        }
        room.rematches = [];

        io.to(roomId).emit("room_data", room);
        io.to(roomId).emit("game_result", null);
        console.log(`🔄 Unanimous match reset executed in Room [${roomId}]`);
      } else {
        io.to(roomId).emit("rematch_update", {
          votesReceived: room.rematches.length,
          totalRequired: totalPlayersInRoom,
        });
      }
    }
  });

  // --- Cleanup on Disconnect ---
  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room && room.players[socket.id]) {
        delete room.players[socket.id];
        room.rematches = room.rematches.filter((id) => id !== socket.id);

        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit("room_data", room);
          const totalPlayersInRoom = Object.keys(room.players).length;
          if (
            room.rematches.length >= totalPlayersInRoom &&
            room.rematches.length > 0
          ) {
            for (const id in room.players) {
              room.players[id].choice = null;
            }
            room.rematches = [];
            io.to(roomId).emit("room_data", room);
            io.to(roomId).emit("game_result", null);
          }
        }
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`🚀 BACKEND ONLINE ON PORT ${PORT}`));
