const lobbyId = sessionStorage.getItem("lobbyId");
const selfId = sessionStorage.getItem("playerId");

if (!lobbyId || !selfId) {
  window.location = "./";
}

const wsUri = `ws://${document.location.host}${document.location.pathname
  .split("/")
  .slice(0, -1)
  .join("/")}/sockets/lobby/${lobbyId}`;
const ws = new WebSocket(wsUri);

// Lobby Waiting
const lobbyCodeEl = document.querySelector("#lobby-code");
const readyBtn = document.querySelector("#ready-btn");
const joinWhiteBtn = document.querySelector("#join-white-btn");
const joinBlackBtn = document.querySelector("#join-black-btn");

lobbyCodeEl.textContent = `Lobby Code: ${lobbyId}`;

joinWhiteBtn.addEventListener("click", () => {
  ws.send(
    JSON.stringify({
      kind: "choose-team",
      playerId: selfId,
      team: "white",
    })
  );
});

joinBlackBtn.addEventListener("click", () => {
  ws.send(
    JSON.stringify({
      kind: "choose-team",
      playerId: selfId,
      team: "black",
    })
  );
});

readyBtn.addEventListener("click", () => {
  ws.send(
    JSON.stringify({
      kind: "player-ready",
      playerId: selfId,
    })
  );
  readyBtn.setAttribute("disabled", true);
});

const whiteMembersListEl = document.querySelector("#white-team-members");
const blackMembersListEl = document.querySelector("#black-team-members");
const readyStatusEl = document.querySelector("#ready-status");

let playerNames = {};
let whiteMembers = [];
let blackMembers = [];

function updateTeamMemberLists() {
  whiteMembersListEl.innerHTML = "";
  blackMembersListEl.innerHTML = "";

  whiteMembers.forEach((memId) => {
    whiteMembersListEl.innerHTML += `<li>${playerNames[memId]}</li>`;
  });
  blackMembers.forEach((memId) => {
    blackMembersListEl.innerHTML += `<li>${playerNames[memId]}</li>`;
  });
}

let numPlayersReady = 0;
readyStatusEl.textContent = `0/${Object.keys(playerNames).length}`;

let teamArtistId = null;
ws.addEventListener("message", (e) => {
  let msg = JSON.parse(e.data);

  if (msg.kind === "player-join") {
    playerNames[msg.playerId] = msg.name;
  } else if (msg.kind === "choose-team") {
    if (msg.team === "white") {
      whiteMembers.push(msg.playerId);
    } else {
      blackMembers.push(msg.playerId);
    }

    updateTeamMemberLists();
  } else if (msg.kind === "player-ready") {
    numPlayersReady += 1;
    readyStatusEl.textContent = `${numPlayersReady}/${
      Object.keys(playerNames).length
    }`;
  } else if (msg.kind === "assign-artist") {
    if (
      (whiteMembers.includes(msg.playerId) && whiteMembers.includes(selfId)) ||
      (blackMembers.includes(msg.playerId) && blackMembers.includes(selfId))
    ) {
      teamArtistId = msg.playerId;
    }
  } else if (msg.kind === "round-start") {
    if (teamArtistId === selfId) {
      document.querySelector("#artist-word").textContent = msg.word;
      switchPage("lobby-round-artist");
    } else {
      switchPage("lobby-round-guesser");
    }
  }
});

ws.addEventListener("open", () => {
  // We default assign you to a random team
  ws.send(
    JSON.stringify({
      kind: "choose-team",
      playerId: selfId,
      team: Math.random() > 0.5 ? "white" : "black",
    })
  );
});

switchPage("lobby-waiting");

// Round (Artist)
const canvas = document.querySelector("#paint");
const ctx = canvas.getContext("2d");

const sketch = document.querySelector("#sketch");
const sketchStyle = getComputedStyle(sketch);
canvas.width = parseInt(sketchStyle.getPropertyValue("width"));
canvas.height = parseInt(sketchStyle.getPropertyValue("height"));

let mouse = { x: 0, y: 0 };
let lastMouse = { x: 0, y: 0 };

// Mouse Capturing Work
canvas.addEventListener(
  "mousemove",
  function (e) {
    lastMouse.x = mouse.x;
    lastMouse.y = mouse.y;

    mouse.x = e.pageX - this.offsetLeft;
    mouse.y = e.pageY - this.offsetTop;
  },
  false
);

// Drawing on Paint App
ctx.lineWidth = 2;
ctx.lineJoin = "round";
ctx.lineCap = "round";
ctx.strokeStyle = "#000000";

function onPaint() {
  ws.send(
    JSON.stringify({
      kind: "draw",
      playerId: selfId,
      data: canvas.toDataURL("image/png"),
    })
  );

  ctx.beginPath();
  ctx.moveTo(lastMouse.x, lastMouse.y);
  ctx.lineTo(mouse.x, mouse.y);
  ctx.closePath();
  ctx.stroke();
}

canvas.addEventListener(
  "mousedown",
  function () {
    canvas.addEventListener("mousemove", onPaint, false);
  },
  false
);

canvas.addEventListener(
  "mouseup",
  function () {
    canvas.removeEventListener("mousemove", onPaint, false);
  },
  false
);

// Round (Guesser)
const imgEl = document.querySelector("#preview-img");
const prevGuessesList = document.querySelector("#prev-guesses");
const guessForm = document.querySelector("#guess-form");
const guessInput = document.querySelector("#guess-input");

guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ws.send(
    JSON.stringify({
      kind: "player-guess",
      playerId: selfId,
      guess: guessInput.value,
    })
  );
  guessInput.value = "";
});

// Round End
const scoreEl = document.querySelector("#score");
const whiteImgEl = document.querySelector("#preview-img-white");
const blackImgEl = document.querySelector("#preview-img-black");
const whiteGuessListEl = document.querySelector("#white-round-guesses");
const blackGuessListEl = document.querySelector("#black-round-guesses");

ws.addEventListener("message", (e) => {
  let msg = JSON.parse(e.data);

  if (msg.kind === "draw") {
    // if this draw message is from our team
    if (msg.playerId === teamArtistId) {
      imgEl.setAttribute("src", msg.data);
    }
  } else if (msg.kind === "player-guess") {
    if (
      (whiteMembers.includes(msg.playerId) && whiteMembers.includes(selfId)) ||
      (blackMembers.includes(msg.playerId) && blackMembers.includes(selfId))
    ) {
      prevGuessesList.innerHTML += `<li>${msg.guess}</li>`;
    }
  } else if (msg.kind === "round-end") {
    scoreEl.textContent = `${msg.score[0]} - ${msg.score[1]}`;
    whiteImgEl.setAttribute("src", msg.whiteData);
    blackImgEl.setAttribute("src", msg.blackData);

    msg.whiteGuesses.forEach((guess) => {
      whiteGuessListEl.innerHTML += `<li>${guess}</li>`;
    });
    msg.blackGuesses.forEach((guess) => {
      blackGuessListEl.innerHTML += `<li>${guess}</li>`;
    });

    switchPage("round-end");
  }
});
