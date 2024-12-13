const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const random = require('crypto').randomInt;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.static('public'));

const socketPairs = {};
const waitingSockets = [];
let connectionNumber = 10;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  waitingSockets.push(socket.id);

  socket.on('disconnect', () => {
    const index = waitingSockets.indexOf(socket.id);
    if (index !== -1) {
      waitingSockets.splice(index, 1);
    } else {
      const partner = socketPairs[socket.id];
      if (partner) {
        waitingSockets.push(partner);
        delete socketPairs[socket.id];
        delete socketPairs[partner];
        io.to(partner).emit('message', `El socket ${socket.id} se ha desconectado. Ahora estás en espera.`);
      }
    }
    console.log(`Cliente desconectado: ${socket.id}`);
    io.emit('message', String(waitingSockets.length));
  });

  socket.on('create_random_pair', () => {
    if (waitingSockets.length < 2) {
      socket.emit('message', 'No hay suficientes clientes en espera para crear una pareja.');
      return;
    }

    const selectedSockets = [
      waitingSockets.splice(random(0, waitingSockets.length), 1)[0],
      waitingSockets.splice(random(0, waitingSockets.length), 1)[0]
    ];

    const roomName = `room_${selectedSockets[0]}_${selectedSockets[1]}`;

    selectedSockets.forEach((socketId, index) => {
      socketPairs[socketId] = selectedSockets[1 - index];
      io.sockets.sockets.get(socketId)?.join(roomName);
      io.to(socketId).emit('message', `Has sido unido a la sala: ${roomName}`);
    });

    console.log(`Sockets ${selectedSockets} se unieron a la sala: ${roomName}`);
  });

  socket.on('leave_room', () => {
    const partner = socketPairs[socket.id];
    if (partner) {
      const roomName = `room_${socket.id}_${partner}`;
      io.sockets.sockets.get(socket.id)?.leave(roomName);
      waitingSockets.push(partner);
      delete socketPairs[socket.id];
      delete socketPairs[partner];

      io.to(partner).emit('message', `Has salido de la sala. Tu compañero ahora está en espera.`);

      if (waitingSockets.length > 0) {
        const newPartner = waitingSockets.shift();
        const newRoomName = `room_${socket.id}_${newPartner}`;
        socketPairs[socket.id] = newPartner;
        socketPairs[newPartner] = socket.id;
        io.sockets.sockets.get(socket.id)?.join(newRoomName);
        io.sockets.sockets.get(newPartner)?.join(newRoomName);
        io.to(socket.id).emit('message', `Has sido emparejado con ${newPartner} en la sala: ${newRoomName}`);
        io.to(newPartner).emit('message', `Has sido emparejado con ${socket.id} en la sala: ${newRoomName}`);
        console.log(`Socket ${socket.id} se ha emparejado con ${newPartner} en la sala: ${newRoomName}`);
      }
    } else {
      socket.emit('message', 'No estás en una sala.');
    }
  });

  socket.on('send_message', (data) => {
    const message = typeof data === 'string' ? data : data.message;
    const partner = socketPairs[socket.id];
    if (partner) {
      io.to(partner).emit('message', message);
    } else {
      socket.emit('message', 'No tienes pareja para enviar un mensaje.');
    }
  });

  socket.on('number', () => {
    socket.emit('message', String(connectionNumber));
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
