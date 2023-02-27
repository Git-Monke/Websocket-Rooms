import { WebSocketServer } from "ws";
import { v4 } from "uuid";
import { Chalk } from "chalk";
import { generateUsername } from "unique-username-generator";

const chalk = new Chalk();
const server = new WebSocketServer({ host: "10.198.216.153", port: 12345 });

let clients = {};
let rooms = {};

console.log(chalk.green("Server is online!"));

// ----- AUXILLARY FUNCTIONS -----

function wrap(request, data) {
  return JSON.stringify({
    request: request,
    data: data,
  });
}

function gen_code(length) {
  let result = "";

  for (let i = 0; i < length; i++) {
    result += String.fromCharCode(Math.floor(Math.random() * 25 + 65));
  }

  return result;
}

// Emits to every single connected client.
function emit(request, data) {
  for (let [_, client] of Object.entries(clients)) {
    client.ws.send(wrap(request, data));
  }
}

// Emits a message to every item in sockets
// Sockets is a list of WebSockets
function emit_to(sockets, request, data) {
  for (let [_, ws] of Object.entries(sockets)) {
    ws.send(wrap(request, data));
  }
}

function get_room(code) {
  for (let [_, room] of Object.entries(rooms)) {
    if (room.code == code) {
      return room;
    }
  }

  return false;
}

function leave_room(id) {
  // Get the client
  let client = clients[id];

  // If they aren't in a valid room, don't do anything
  if (!rooms[client.roomid]) {
    return;
  }

  // Get the room
  let room = rooms[client.roomid];

  console.log(
    `${chalk.green(client.username)} is leaving ${chalk.blueBright(
      rooms[client.roomid].name
    )}`
  );

  // Tell everyone in that room they are leaving the room
  emit_to(room.clients, "server::user_status_update", {
    username: client.username,
    join: false,
  });

  // Remove the client from that room
  delete room.clients[id];
  client.roomid = null;
}

// ----- HANDLERS -----

function set_username(data, _, id) {
  // Log that they are changing their username
  console.log(
    `${chalk.green(
      clients[id].username
    )} changed their username to ${chalk.green(data.username)}`
  );

  // Change their username
  clients[id].username = data.username;
}

function create_room(data, ws, id) {
  // Check that the person only has one room
  if (rooms[id]) {
    return;
  }

  // Generate a code and a default name if they don't provide one
  let code = gen_code(6);
  let name = data.name || `${clients[id].username}'s Room`;

  // Log that they are making a server
  console.log(
    `${chalk.green(clients[id].username)} created ${chalk.blueBright(name)}`
  );

  // Create the room
  rooms[id] = {
    clients: {},
    code: code,
    id: id,
    name: name,
    public: data.public,
  };

  // Tell the client to join the room
  ws.send(
    wrap("server::attempt_join", {
      code: code,
    })
  );

  // If the room is public, tell every client that there is a new public room.
  if (data.public) {
    emit("server::new_public_room", {
      name: name,
      code: code,
      id: id,
    });
  }
}

function join_room(data, ws, id) {
  // Get the room by the 6 letter code sent by the client
  let room = get_room(data.code);

  // If the code is invalid, reject the request.
  if (!room) {
    return;
  }

  // Get the client who sent the request
  let client = clients[id];

  // Log that they are joining
  console.log(
    `${chalk.green(client.username)} joined ${chalk.blueBright(room.name)}`
  );

  // Update their room id, and add their WebSocket to the clients in that room
  room.clients[id] = ws;
  client.roomid = room.id;

  // Send a message to the client they successfully joined
  ws.send(
    wrap("server::join_room", {
      code: data.code,
    })
  );

  // Tell every user in that room that they successfully joined
  emit_to(room.clients, "server::user_status_update", {
    username: client.username,
    join: true,
  });
}

function leave_room_handle(_, __, id) {
  // Self explanatory
  if (clients[id].roomid) {
    leave_room(id);
  }
}

function get_pub_rooms(_, ws) {
  // Self explanatory
  let pub_rooms = [];

  for (let [_, room] of Object.entries(rooms)) {
    if (room.public) {
      pub_rooms.push({
        code: room.code,
        name: room.name,
        id: room.id,
      });
    }
  }

  ws.send(wrap("server::public_rooms", pub_rooms));
}

function send_message(data, _, id) {
  let client = clients[id];

  // If the client is not in a room, reject the request.
  if (!client.roomid) {
    return;
  }

  // Get the room the client is in
  let room = rooms[client.roomid];

  // If that room is nonexistant (invalid roomid), reject the request.
  if (!room) {
    return;
  }

  console.log(`${chalk.blueBright(client.username)}: ${data}`);

  // Tell every client that is connected to that room that a message was sent
  emit_to(room.clients, "server::message", {
    id: id,
    username: client.username,
    message: data,
  });
}

// The list of events and their respective handlers
let handles = {
  // "serverorclient::handle-name": functionname
  "client::set_username": set_username,
  "client::create_room": create_room,
  "client::join_room": join_room,
  "client::leave_room": leave_room_handle,
  "client::get_public_rooms": get_pub_rooms,
  "client::send_message": send_message,
};

function handle(payload, ws, id) {
  try {
    if (!payload.request) {
      throw new Error("Message had no request");
    }
    if (!handles[payload.request]) {
      throw new Error(`Message had unknown handle ${payload.request}`);
    }
    if (!payload.data) {
      throw new Error(`Message had no data`);
    }

    handles[payload.request](payload.data, ws, id);
  } catch (err) {
    console.log("Error encountered handling client request");
    console.log(err);
  }
}

server.addListener("connection", (ws) => {
  // Generate user information
  let username = generateUsername();
  let userid = v4();

  console.log(
    `Created new user ${chalk.green(username)} with id ${chalk.blueBright(
      userid
    )}`
  );

  // Store the users' info in the list of clients
  clients[userid] = {
    ws: ws,
    username: username,
    userid: userid,
    roomid: null,
  };

  // Send them their generated username
  ws.send(
    wrap("server::username", {
      username: username,
    })
  );

  ws.on("message", (payload) => {
    try {
      handle(JSON.parse(payload), ws, userid);
    } catch (err) {
      console.log("Error parsing or handling payload");
      console.log(err);
    }
  });

  ws.on("close", (_) => {
    // Check if the user owns the room
    if (rooms[userid]) {
      // If the room is public, tell everyone to delete that room from their list of joinable rooms
      if (rooms[userid].public) {
        emit("server::delete_public_room", {
          id: userid,
        });
      }

      // Kick all users that are connected to that room
      for (let [_, ws] of Object.entries(rooms[userid].clients)) {
        ws.send(wrap("server::leave_room", {}));
      }

      // Log the room is being deleted
      console.log(
        `${chalk.green(clients[userid].username)} deleted ${chalk.blueBright(
          rooms[userid].name
        )}`
      );

      // Delete the room
      delete rooms[userid];
    } else if (clients[userid].roomid) {
      // Otherwise just leave the room
      leave_room(userid);
    }

    // Delete the client
    delete clients[userid];
  });
});
