import { WebSocketServer } from "ws";
import { v4 } from "uuid";
import { Chalk } from "chalk";
import { generateUsername } from "unique-username-generator";

const chalk = new Chalk();
const server = new WebSocketServer({ host: "192.168.1.158", port: 12345 });

let clients = {};
let rooms = {};

console.log(chalk.green("Server is online!"));

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

function set_username(data, _, id) {
  console.log(
    `${chalk.green(
      clients[id].username
    )} changed their username to ${chalk.green(data.username)}`
  );
  clients[id].username = data.username;
}

let handles = {
  // "serverorclient::handle-name": functionname
  "client::set_username": set_username,
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
    delete clients[userid];
  });
});
