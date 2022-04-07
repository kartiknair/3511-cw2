/* Shared State */
let ws = null;
let lobbyId = null;
let selfId = null;

let playerNames = {};
let whiteMembers = [];
let blackMembers = [];
let teamArtistId = null;

/*
 * This function generates universally unique identifier.
 * Implementation taken from : https://stackoverflow.com/a/2117523/12785202
 */
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

// Home Page
window.addEventListener("load-home-page", () => {
  const joinLobbyBtn = document.querySelector("#join-lobby-btn");
  const createLobbyBtn = document.querySelector("#create-lobby-btn");
  joinLobbyBtn.addEventListener("click", () => {
    switchPage("join-page");
  });
  createLobbyBtn.addEventListener("click", () => {
    switchPage("create-page");
  });
});

// Create Page
window.addEventListener("load-create-page", () => {
  const createForm = document.querySelector("#create-form");
  const creatorNameInput = document.querySelector("#creator-name");
  const numRoundsInput = document.querySelector("#num-rounds");

  createForm.addEventListener("submit", (e) => {
    e.preventDefault();

    lobbyId = uuidv4();
    selfId = uuidv4();
    const playerName = creatorNameInput.value;
    
    // This is the websockets URL generated from current URL
    const wsUri = `ws://${document.location.host}${document.location.pathname}sockets/lobby/${lobbyId}?rounds=${numRoundsInput.value}`;

    ws = new WebSocket(wsUri);
    ws.addEventListener("open", () => {
      // The creator has to be added to this lobby
      ws.send(
        JSON.stringify({
          kind: "player-join",
          name: playerName,
          playerId: selfId,
        })
      );

      playerNames[selfId] = playerName;
      switchPage("lobby-waiting");
    });
  });
});

// Join Page
window.addEventListener("load-join-page", () => {
  const joinForm = document.querySelector("#join-form");
  const nameInput = document.querySelector("#name");
  const lobbyCodeInput = document.querySelector("#lobby-code");

  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = nameInput.value;
    lobbyId = lobbyCodeInput.value;
    selfId = uuidv4();

    const wsUri = `ws://${document.location.host}${document.location.pathname}sockets/lobby/${lobbyId}`;
    ws = new WebSocket(wsUri);

    // As we open connection, join message is sent with players ID
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ kind: "player-join", name, playerId: selfId }));
      playerNames[selfId] = name;
      switchPage("lobby-waiting");
    });
  });
});

switchPage("home-page");

// Lobby (Waiting)
window.addEventListener("load-lobby-waiting", () => {
  const lobbyCodeEl = document.querySelector("#lobby-code-display");
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

  // If user closes the page, we send a user leave message
  window.addEventListener("beforeunload", () => {
    ws.send(JSON.stringify({ kind: "player-leave", playerId: selfId }));
  });

  const whiteMembersListEl = document.querySelector("#white-team-members");
  const blackMembersListEl = document.querySelector("#black-team-members");
  const readyStatusEl = document.querySelector("#ready-status");

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

  // Round/Game End
  const scoreEl = document.querySelector("#score");
  const whiteImgEl = document.querySelector("#preview-img-white");
  const blackImgEl = document.querySelector("#preview-img-black");
  const whiteGuessListEl = document.querySelector("#white-round-guesses");
  const blackGuessListEl = document.querySelector("#black-round-guesses");

  const finalScoreEl = document.querySelector("#final-score");
  const winnerEl = document.querySelector("#winner");
  
  /*
   * There are 2 main listeners that we attach to the ws one of them
   * is right below. It handles all lobby waiting messages. The other
   * listener handels all game state changes.
   */

  ws.addEventListener("message", (e) => {
    console.log(e.data);
    let msg = JSON.parse(e.data);
    console.log(msg);

    if (msg.kind === "player-join") {
      playerNames[msg.playerId] = msg.name;
      readyStatusEl.textContent = `${numPlayersReady}/${
        Object.keys(playerNames).length
      }`;
    } else if (msg.kind === "player-leave") {
      console.log("player left!!!!!!!!", msg.playerId);
      whiteMembers = whiteMembers.filter((mem) => mem !== msg.playerId);
      blackMembers = blackMembers.filter((mem) => mem !== msg.playerId);
      updateTeamMemberLists();
    } else if (msg.kind === "choose-team") {
      if (msg.team === "white") {
        if (!whiteMembers.includes(msg.playerId))
          whiteMembers.push(msg.playerId);
        blackMembers = blackMembers.filter((memId) => memId !== msg.playerId);
      } else {
        if (!blackMembers.includes(msg.playerId))
          blackMembers.push(msg.playerId);
        whiteMembers = whiteMembers.filter((memId) => memId !== msg.playerId);
      }

      updateTeamMemberLists();
    } else if (msg.kind === "player-ready") {
      numPlayersReady += 1;
      readyStatusEl.textContent = `${numPlayersReady}/${
        Object.keys(playerNames).length
      }`;
    } else if (msg.kind === "assign-artist") {
      console.log(msg);

      /*
       * We store a gloabl teamArtistId which holds the player's team's current round artist.
       * We use this to only acknowledge draw messages from the user's team's artist, and know
       * if the user is the current artist to switch to the artist page.
       */ 
      if (
        (whiteMembers.includes(msg.playerId) &&
          whiteMembers.includes(selfId)) ||
        (blackMembers.includes(msg.playerId) && blackMembers.includes(selfId))
      ) {
        teamArtistId = msg.playerId;
      }
    } else if (msg.kind === "round-start") {
      if (teamArtistId === selfId) {
        document.querySelector("#artist-prompt").textContent = msg.prompt;
        switchPage("lobby-round-artist");
      } else {
        switchPage("lobby-round-guesser");
      }
    } else if (msg.kind === "round-end") {
      whiteGuessListEl.innerHTML = "";
      blackGuessListEl.innerHTML = "";

      scoreEl.textContent = `${msg.currentScore[0]} - ${msg.currentScore[1]}`;
      whiteImgEl.setAttribute("src", msg.whiteData);
      blackImgEl.setAttribute("src", msg.blackData);

      msg.whiteGuesses.forEach((guess) => {
        whiteGuessListEl.innerHTML += `<li>${guess}</li>`;
      });
      msg.blackGuesses.forEach((guess) => {
        blackGuessListEl.innerHTML += `<li>${guess}</li>`;
      });

      switchPage("round-end");
    } else if (msg.kind === "game-end") {
      finalScoreEl.textContent = `${msg.score[0]} - ${msg.score[1]}`;
      winnerEl.textContent = `${
        msg.winner.charAt(0).toUpperCase() + msg.winner.slice(1)
      } won!`;

      switchPage("game-end");
      setTimeout(() => {
        switchPage("lobby-waiting");
      }, 2000);
    }
  });

  // We default assign you to a random team
  ws.send(
    JSON.stringify({
      kind: "choose-team",
      playerId: selfId,
      team: Math.random() > 0.5 ? "white" : "black",
    })
  );
});

// Round (Artist)
window.addEventListener("load-lobby-round-artist", () => {
  const canvas = document.querySelector("#paint");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  const colorButtons = document.querySelectorAll(".color-choose");
  const strokeButtons = document.querySelectorAll(".stroke-choose");

  colorButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      ctx.strokeStyle = e.target.getAttribute("data-color");
    });
  });

  strokeButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      ctx.lineWidth = parseInt(e.target.getAttribute("data-line-width"));
    });
  });

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
});

// Round (Guesser)
window.addEventListener("load-lobby-round-guesser", () => {
  const imgEl = document.querySelector("#preview-img");
  const prevGuessesList = document.querySelector("#prev-guesses");
  const guessForm = document.querySelector("#guess-form");
  const guessInput = document.querySelector("#guess-input");

  imgEl.setAttribute("src", "");
  guessInput.value = "";
  prevGuessesList.innerHTML = "";

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

  ws.addEventListener("message", (e) => {
    console.log(e.data);

    let msg = JSON.parse(e.data);

    if (msg.kind === "draw") {
      console.log(teamArtistId);
      // if this draw message is from our team
      if (msg.playerId === teamArtistId) {
        imgEl.setAttribute("src", msg.data);
      }
    } else if (msg.kind === "player-guess") {
      if (
        (whiteMembers.includes(msg.playerId) &&
          whiteMembers.includes(selfId)) ||
        (blackMembers.includes(msg.playerId) && blackMembers.includes(selfId))
      ) {
        prevGuessesList.innerHTML += `<li>${msg.guess}</li>`;
      }
    }
  });
});
