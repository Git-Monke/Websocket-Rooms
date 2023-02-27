let ws;
connect();

// By setting this function to be a dollar sign cleans things up a lot
const $ = document.getElementById;

const username_input = $("username");
const username_error_output = $("username-output");

const publicity_box = $("room-publicity");

const content = $("content");
const create_room_button = $("create-room");
const join_room_button = $("join");
const join_code = $("join-code");

const room_id_text = $("room-id-text");
const room_info = $("room-info");
const rooms_container = $("rooms");
const room_name_input = $("room-name");
const server_down = $("server-down");

const chat_box = $("chat");
const chat_input = $("input");
const messages_container = $("messages");

// at_bottom is if the user is currently at the bottom of the chat box
let at_bottom = true;
let username;

// ----- AUXILLARY FUNCTIONS -----

function wrap(request, data) {
  return JSON.stringify({
    request: request,
    data: data,
  });
}

function format_username(input) {
  return input.replace(/[^a-zA-Z0-9_]+/g, "");
}

function chat(userdata, text, style) {
  let new_chat = document.createElement("p");

  if (userdata) {
    new_chat.innerHTML = `<span title="${userdata.id}">${userdata.username}</span>: ${text}`;
  } else {
    new_chat.innerHTML = `${text}`;
  }

  if (style) {
    new_chat.style = style;
  }

  messages_container.appendChild(new_chat);

  if (messages_container.childNodes.length > 20) {
    messages_container.firstChild.remove();
  }

  if (at_bottom) {
    messages_container.scrollTop = messages_container.scrollHeight;
  }
}

// Sets what screen the user is on
// true = joining a room
// false = in a room
function in_room(bool) {
  if (bool) {
    room_info.style = "top: 1%;";
    content.style = "top: -50%";
    chat_box.style = "left: 0%";
  } else {
    content.style = "top: 50%";
    room_info.style = "top: -10%;";
    chat_box.style = "left: -50%";
  }
}

// ----- WEBSOCKET FUNCTIONALITY -----

function set_username(data) {
  username_input.value = data.username;
  username = data.username;
}

function join_room(data) {
  room_id_text.innerHTML = data.code;
  in_room(true);
}

function attempt_join(data) {
  ws.send(
    wrap("client::join_room", {
      code: data.code,
    })
  );
}

function make_room(data) {
  let new_div = document.createElement("div");
  let room_name = document.createElement("h3");
  let room_id = document.createElement("h3");

  room_name.innerHTML = data.name;
  room_id.innerHTML = `Room code: ${data.code}`;

  new_div.id = data.id;
  new_div.classList.add("public-room");
  new_div.appendChild(room_name);
  new_div.appendChild(room_id);

  rooms_container.appendChild(new_div);
}

function delete_room(data) {
  document.getElementById(data.id).remove();
}

function leave_room_handle(_) {
  in_room(false);
}

function display_rooms(data) {
  for (room of data) {
    make_room(room);
  }
}

function chat_handle(data) {
  chat(
    {
      username: data.username,
      id: data.id,
    },
    data.message
  );
}

// This is absolutely not the best way to do this.
// However I am on a time crunch and have to work on more important things
// Feel free to refactor!
function user_status_update(data) {
  let username = data.username;
  let message = (data.join == true && "joined") || "left";
  let style = (data.join == true && "color: green;") || "color: red;";
  chat(null, `${username} ${message}`, `${style}`);
}

let handles = {
  // "serverorclient::handle-name": functionname
  "server::username": set_username,
  "server::attempt_join": attempt_join,
  "server::join_room": join_room,
  "server::new_public_room": make_room,
  "server::delete_public_room": delete_room,
  "server::leave_room": leave_room_handle,
  "server::public_rooms": display_rooms,
  "server::message": chat_handle,
  "server::user_status_update": user_status_update,
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
    server_down.style = "display: none";
    ws.send(wrap("client::get_public_rooms", {}));
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

    server_down.style = "display: flex";
    in_room(false);

    rooms_container.childNodes.forEach((child) => {
      child.remove();
    });

    setTimeout(() => {
      connect();
    }, 1000);
  });
}

// ----- DOCUMENT FUNCTIONALITY -----

document.addEventListener("keypress", (keyevent) => {
  if (keyevent.key == "Enter") {
    if (
      username_input.value != username &&
      username_input == document.activeElement &&
      username_input.value.length <= 15 &&
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

    if (chat_input.value != "" && chat_input == document.activeElement) {
      ws.send(wrap("client::send_message", chat_input.value));

      chat_input.value = "";
    }
  }
});

create_room_button.addEventListener("click", (_) => {
  let room_name = room_name_input.value;

  if (room_name.length > 0 && room_name < 3) {
    return;
  }

  ws.send(
    wrap("client::create_room", {
      public: publicity_box.checked,
      name: (room_name.length > 0 && room_name.slice(0, 15)) || null,
    })
  );
});

join_room_button.addEventListener("click", (_) => {
  if (
    join_code.value != "" &&
    join_code.value.length == 6 &&
    join_code.value.match(/^[A-Za-z]+$/)
  ) {
    attempt_join({ code: join_code.value });
  }
});

username_input.addEventListener("input", (_) => {
  if (username_input.value != username) {
    username_input.style = "border: 2px solid red";
  }
});

messages_container.addEventListener("scroll", (data) => {
  console.log();

  if (
    messages_container.scrollHeight -
      messages_container.clientHeight -
      messages_container.scrollTop ==
    0
  ) {
    at_bottom = true;
  } else {
    at_bottom = false;
  }
});
