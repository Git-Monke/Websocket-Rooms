let ws;
connect();

const username_input = document.getElementById("username");
const username_error_output = document.getElementById("username-output");

const publicity_box = document.getElementById("room-publicity");

const content = document.getElementById("content");
const create_room_button = document.getElementById("create-room");
const join_room_button = document.getElementById("join");
const join_code = document.getElementById("join-code");

const room_id_text = document.getElementById("room-id-text");
const room_info = document.getElementById("room-info");

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

function join_room(data) {
  room_id_text.innerHTML = data.code;
  room_info.style = "top: 1%;";
  content.style = "top: -30%";
}

function attempt_join(data) {
  ws.send(
    wrap("client::join_room", {
      code: data.code,
    })
  );
}

let handles = {
  // "serverorclient::handle-name": functionname
  "server::username": set_username,
  "server::attempt_join": attempt_join,
  "server::join_room": join_room,
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

create_room_button.addEventListener("click", (_) => {
  ws.send(
    wrap("client::create_room", {
      public: publicity_box.checked,
    })
  );
});

join_room_button.addEventListener("click", (_) => {
  if (join_code.value != "" && join_code.value.match(/^[A-Za-z]+$/)) {
    attempt_join(join_code.value);
  }
});

username_input.addEventListener("input", (_) => {
  if (username_input.value != username) {
    username_input.style = "border: 2px solid red";
  }
});
