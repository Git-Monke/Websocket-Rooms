import { WebSocketServer } from "ws";
import { v4 } from "uuid";
import { Chalk } from "chalk";
import { generateUsername } from "unique-username-generator";

const chalk = new Chalk();
const server = new WebSocketServer({ host: "192.168.1.158", port: 12345 });

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

function emit(request, data) {
  for (let [_, client] of Object.entries(clients)) {
    client.ws.send(wrap(request, data));
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
  let client = clients[id];
  delete rooms[client.roomid].clients[id];
  client.roomid = null;
}

// ----- HANDLERS -----

function set_username(data, _, id) {
  console.log(
    `${chalk.green(
      clients[id].username
    )} changed their username to ${chalk.green(data.username)}`
  );
  clients[id].username = data.username;
}

function create_room(data, ws, id) {
  if (rooms[id]) {
    return;
  }

  let code = gen_code(6);
  let name = data.name || `${clients[id].username}'s Room`;

  console.log(
    `${chalk.green(clients[id].username)} created ${chalk.blueBright(name)}`
  );

  rooms[id] = {
    clients: {},
    code: code,
    id: id,
    name: name,
    public: data.public,
  };

  ws.send(
    wrap("server::attempt_join", {
      code: code,
    })
  );

  if (data.public) {
    emit("server::new_public_room", {
      name: name,
      code: code,
      id: id,
    });
  }
}

function join_room(data, ws, id) {
  let room = get_room(data.code);

  if (!room) {
    return;
  }

  console.log(
    `${chalk.green(clients[id].username)} joined ${chalk.blueBright(room.name)}`
  );

  room.clients[id] = ws;
  clients[id].roomid = room.id;

  ws.send(
    wrap("server::join_room", {
      code: data.code,
    })
  );
}

let handles = {
  // "serverorclient::handle-name": functionname
  "client::set_username": set_username,
  "client::create_room": create_room,
  "client::join_room": join_room,
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
  let username = generateUsername();
  let userid = v4();

  console.log(
    `Created new user ${chalk.green(username)} with id ${chalk.blueBright(
      userid
    )}`
  );

  clients[userid] = {
    ws: ws,
    username: username,
    userid: userid,
    roomid: null,
  };

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
    if (rooms[userid]) {
      if (rooms[userid].public) {
        emit(
          wrap("server::delete_public_room", {
            id: userid,
          })
        );
      }

      for (let [_, ws] of Object.entries(rooms[userid].clients)) {
        ws.send(wrap("server::leave_room", {}));
      }

      console.log(
        `${chalk.green(clients[userid].username)} deleted ${chalk.blueBright(
          rooms[userid].name
        )}`
      );

      delete rooms[userid];
    } else if (clients[userid].roomid) {
      leave_room(userid);
    }

    delete clients[userid];
  });
});
