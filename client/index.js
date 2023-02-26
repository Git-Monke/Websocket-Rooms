let ws;
connect();

const username_input = document.getElementById("username");
const username_error_output = document.getElementById("username-output");

const publicity_box = document.getElementById("room-publicity");

const create_room = document.getElementById("create-room");

let username;

function wrap(request, data) {
  return JSON.stringify({
    request: request,
    data: data,
  });
}

function format_username(input) {
  return input.replace(/[^a-zA-Z0-9_]+/g, "");
}

// WEBSOCKET HANDLERS
function set_username(data) {
  username_input.value = data.username;
  username = data.username;
}

let handles = {
  // "serverorclient::handle-name": functionname
  "server::username": set_username,
};

function handle(payload) {
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

    handles[payload.request](payload.data);
  } catch (err) {
    console.log("Error encountered handling client request");
    console.log(err);
  }
}

function connect() {
  ws = new WebSocket("ws://192.168.1.158:12345");

  ws.addEventListener("open", (_) => {
    console.log("Successfully connected to the server!");
  });

  ws.addEventListener("message", (payload) => {
    try {
      handle(JSON.parse(payload.data));
    } catch (err) {
      console.log("Error parsing or handling payload");
      console.log(err);
    }
  });

  ws.addEventListener("close", (_) => {
    console.log("Connection closed. Retrying connection.");

    setTimeout(() => {
      connect();
    }, 1000);
  });
}

// DOCUMENT FUNCTIONALITY

document.addEventListener("keypress", (keyevent) => {
  if (keyevent.key == "Enter") {
    if (
      username_input.value != username &&
      username_input == document.activeElement &&
      username_input.value.length <= 21 &&
      username_input.value.length >= 3
    ) {
      username_input.value = format_username(username_input.value);
      username = username_input.value;
      username_input.style = "border: 2px solid green";

      ws.send(
        wrap("client::set_username", {
          username: username,
        })
      );
    }
  }
});

create_room.addEventListener("click", (_) => {
  // ws.send(
  //   wrap("client::create_room", {
  //     public: (publicity_box.value == "on" && true) || false,
  //   })
  // );
});

username_input.addEventListener("input", (_) => {
  if (username_input.value != username) {
    username_input.style = "border: 2px solid red";
  }
});
