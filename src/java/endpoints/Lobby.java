package endpoints;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;

import java.util.HashMap;
import java.util.List;
import java.util.Random;
import java.util.Scanner;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import javax.websocket.OnOpen;
import javax.websocket.OnClose;
import javax.websocket.OnMessage;
import javax.websocket.Session;
import javax.websocket.server.PathParam;
import javax.websocket.server.ServerEndpoint;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;
import org.json.simple.parser.ParseException;

enum Team {
    WHITE,
    BLACK
}

class Player {
    public String id;
    public String name;
    public Session session;
    
    // Lobby state
    public Team team;
    public boolean ready;
    public boolean artist;

    /*
     * The Player is a transparent struct as all members are publically accesible,
     * and there is no data encapsulation.
     */
    
    // Player w/out a team (hasn't decided yet)
    public Player(String id, String name, Session session) {
        this.id = id;
        this.name = name;
        this.session = session;
        
        this.team = null;
        this.ready = false;
        this.artist = false;
    }
    
    // Player w/ a team
    public Player(String id, String name, Session session, Team team) {
        this.id = id;
        this.name = name;
        this.session = session;
        
        this.team = team;
        this.ready = false;
        this.artist = false;
    }
}

/*
 * Holds all game state for a specific lobby. Also handles messages
 * exchanged within this lobby.
 */
class LobbyTask {
    public String lobbyId;
    public HashMap<String, Player> players;
    
    public int numRounds;
    public List<Integer> score;
    
    public String latestWhiteImageData;
    public String latestBlackImageData;
    
    public String roundPrompt;    
    public ArrayList<String> prevPrompts = new ArrayList();
    public ArrayList<String> allPrompts = new ArrayList();
    public ArrayList<String> whiteGuesses = new ArrayList();
    public ArrayList<String> blackGuesses = new ArrayList();
    
    // Initializes everything
    public LobbyTask(String lobbyId, int numRounds) {
        this.lobbyId = lobbyId;
        this.numRounds = numRounds;
        
        this.players = new HashMap();
        this.score = Arrays.asList(0, 0);
        
        // Reads the prompt list (only does this once, when the lobby is created)
        InputStream is = getClass().getResourceAsStream("/resources/prompt-list.txt");
        Scanner scanner = new Scanner(is);
        while (scanner.hasNextLine()) {
            String prompt = scanner.nextLine();
            allPrompts.add(prompt);
        }
        scanner.close();
    }
    
    /*
     * Gets one of the prompts from the prompt list. 
     * Ensures that the prompt hasn't come up in a previous round of a game.
     */
    private String getRandomPrompt() {
        Random rand = new Random(System.currentTimeMillis());

        System.out.println("get random prompt called!");

        if (prevPrompts.isEmpty()) {
            String randomPrompt = allPrompts.get(rand.nextInt(allPrompts.size()));
            prevPrompts.add(randomPrompt);
            return randomPrompt;
        }
        
        String randomPrompt = allPrompts.get(rand.nextInt(allPrompts.size()));
        // Meaning until the previous prompts doesn't include our prompt
        while (prevPrompts.indexOf(randomPrompt) != -1) {
            System.out.println("looping");
            randomPrompt = allPrompts.get(rand.nextInt(allPrompts.size()));
            // Technically this could loop an unnecessary amount of times depending on how unlucky we get with random
        }
        
        prevPrompts.add(randomPrompt);
        return randomPrompt;
    }
    
    /*
     * It chooses an artist for both teams, and chooses a random prompt.
     * It then broadcasts the round-start message to all players in the lobby.
    */
    public void startRound() throws IOException {
        System.out.println("start round called!");
        Collection<Player> playerValues = players.values();
        Collection<Player> whitePlayers = playerValues
                .stream()
                .filter(player -> player.team == Team.WHITE)
                .collect(Collectors.toList());
        Collection<Player> blackPlayers = playerValues
                .stream()
                .filter(player -> player.team == Team.BLACK)
                .collect(Collectors.toList());

        Player whiteArtist = whitePlayers
                .stream()
                .skip((int)(Math.random() * whitePlayers.size()))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("unreachable"));
        Player blackArtist = blackPlayers
                .stream()
                .skip((int)(Math.random() * blackPlayers.size()))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("unreachable"));

        System.out.println(whiteArtist.id);
        System.out.println(blackArtist.id);
        
        roundPrompt = getRandomPrompt();
        
        // We can start the round
        for (Player player : playerValues) {
            System.out.println(player.toString());
            player.session.getBasicRemote().sendText(String.format(
                    "{\"kind\": \"assign-artist\", \"playerId\": \"%s\"}",
                    whiteArtist.id
            ));
            player.session.getBasicRemote().sendText(String.format(
                    "{\"kind\": \"assign-artist\", \"playerId\": \"%s\"}",
                    blackArtist.id
            ));
            player.session.getBasicRemote().sendText(String.format(
                    "{\"kind\": \"round-start\", \"prompt\": \"%s\"}", roundPrompt
            ));
        }
    }
    
    // Message callback. Whenever any player sends any message it goes to this callback.
    public void handleMessage(Session senderSession, String rawMessage) throws IOException {
        JSONParser parser = new JSONParser();
        
        try {
            // Just forward to all players
            for (Player player : players.values()) {
                player.session.getBasicRemote().sendText(rawMessage);
            }
            
            JSONObject message = (JSONObject)parser.parse(rawMessage);
            
            String messageKind = (String)message.get("kind");
            if (messageKind.equals("player-join")) {
                String playerId = (String)message.get("playerId");
                Player newPlayer = new Player(
                        playerId,
                        (String)message.get("name"),
                        senderSession
                );
                
                // Send this new player details of all previous players
                for (Player prevPlayer : players.values()) {
                    senderSession.getBasicRemote().sendText(String.format(
                            "{\"kind\": \"player-join\", \"playerId\": \"%s\", \"name\": \"%s\"}",
                            prevPlayer.id, prevPlayer.name
                    ));
                    senderSession.getBasicRemote().sendText(String.format(
                            "{\"kind\": \"choose-team\", \"playerId\": \"%s\", \"team\": \"%s\"}",
                            prevPlayer.id, prevPlayer.team == Team.WHITE ? "white" : "black"
                    ));
                }
                
                players.put(playerId, newPlayer);
                System.out.println("inserted new player");
            } else if (messageKind.equals("choose-team")) {
                String playerId = (String)message.get("playerId");
                String teamStr = (String)message.get("team");
                
                System.out.println(players.get(playerId) == null);
                players.get(playerId).team = teamStr.equals("white") ? Team.WHITE : Team.BLACK;
            } else if (messageKind.equals("player-ready")) {
                String playerId = (String)message.get("playerId");
                players.get(playerId).ready = true;
                
                Collection<Player> playerValues = players.values();
                
                /*
                 * We count the num of players ready on each team. So we can only
                 * start the game when all players are ready and there's a min
                 * of two players on each team.
                 */
                int whitePlayersReady = 0;
                int blackPlayersReady = 0;
                for (Player player : playerValues) {
                    if (!player.ready) {
                        if (player.team == Team.WHITE)
                            whitePlayersReady++;
                        else
                            blackPlayersReady++;
                        break;
                    }
                }
                
                if (whitePlayersReady >= 2 && blackPlayersReady >= 2 && 
                        whitePlayersReady + blackPlayersReady == playerValues.size()) {
                    startRound();
                }
            } else if (messageKind.equals("draw")) {
                String artistId = (String)message.get("playerId");
                String imageData = (String)message.get("data");
                Player artist = players.get(artistId);
                // Cache the latest image data for each team to show at round end
                if (artist.team == Team.WHITE) {
                    latestWhiteImageData = imageData;
                } else {
                    latestBlackImageData = imageData;
                }
            } else if (messageKind.equals("player-guess")) {
                String guesserId = (String)message.get("playerId");
                String guess = (String)message.get("guess");
                
                Player guesser = players.get(guesserId);
                if (guesser.team == Team.WHITE) {
                    whiteGuesses.add(guess);
                } else {
                    blackGuesses.add(guess);
                }
                
                if (roundPrompt.equals(guess)) {
                    // Correct guess!
                    if (guesser.team == Team.WHITE) {
                        score.set(0, score.get(0) + 1);
                    } else {
                        score.set(1, score.get(1) + 1);
                    }
                    
                    String whiteGuessesAsJSON = "[";
                    String blackGuessesAsJSON = "[";
                    
                    for (String whiteGuess : whiteGuesses) {
                        whiteGuessesAsJSON += String.format("\"%s\",", whiteGuess);
                    }
                    for (String blackGuess : whiteGuesses) {
                        blackGuessesAsJSON += String.format("\"%s\",", blackGuess);
                    }
                    
                    if (whiteGuessesAsJSON.endsWith(",")) {
                        whiteGuessesAsJSON = whiteGuessesAsJSON.substring(0, whiteGuessesAsJSON.length()-1);
                    }
                    if (blackGuessesAsJSON.endsWith(",")) {
                        blackGuessesAsJSON = blackGuessesAsJSON.substring(0, blackGuessesAsJSON.length()-1);
                    }
                    
                    whiteGuessesAsJSON += "]";
                    blackGuessesAsJSON += "]";

                    // We can end this round
                    for (Player player : players.values()) {
                        player.session.getBasicRemote().sendText(String.format(
                                "{" +
                                "  \"kind\": \"round-end\"," +
                                "  \"currentScore\": [%d, %d]," +
                                "  \"whiteData\": \"%s\"," +
                                "  \"blackData\": \"%s\"," +
                                "  \"whiteGuesses\": %s," +
                                "  \"blackGuesses\": %s" +
                                "}",
                                score.get(0),
                                score.get(1),
                                latestWhiteImageData,
                                latestBlackImageData,
                                whiteGuessesAsJSON,
                                blackGuessesAsJSON
                        ));
                    }
                    
                    try { Thread.sleep(5000); } catch (InterruptedException e) { /* ignore */ }
                    
                    // One of the teams has won
                    if (score.get(0) == (int)((numRounds/2)+1) || score.get(1) == (int)((numRounds/2)+1)) {
                        for (Player player : players.values()) {
                            player.session.getBasicRemote().sendText(String.format(
                                    "{\"kind\": \"game-end\", \"score\": [%d, %d]} \"winner\": \"%s\"}",
                                    score.get(0), score.get(1), score.get(0) > score.get(1) ? "white" : "black"
                            ));
                            
                            // Reset the scores so game can be restarted
                            score.set(0, 0);
                            score.set(1, 0);
                        }
                    } else {
                        startRound(); // Start a new round
                    }
                }
            }
        } catch (ParseException ex) {
            Logger.getLogger(Lobby.class.getName()).log(Level.SEVERE, null, ex);
        }

    }
}

@ServerEndpoint("/sockets/lobby/{lobbyId}")
public class Lobby {
    private static HashMap<String, LobbyTask> lobbies = new HashMap();
    
    @OnOpen
    public void onOpen(@PathParam("lobbyId") String lobbyId, Session creatorSession) {
        System.out.println(lobbyId);
        
        // On connection open, if lobbyID doesn't exist, we create a lobby with that ID
        if (!lobbies.containsKey(lobbyId)) {
            String query = creatorSession.getQueryString();
            String numRoundsStr = query.substring("rounds=".length(), query.length());
            int numRounds = Integer.parseInt(numRoundsStr);
            lobbies.put(lobbyId, new LobbyTask(lobbyId, numRounds));
        }
    }
    
    @OnClose
    public void onClose(@PathParam("lobbyId") String lobbyId, Session session) throws IOException {
        LobbyTask lobby = lobbies.get(lobbyId);
        for (Player player : lobby.players.values()) {
            if (player.session.equals(session)) {
                System.out.println("Removing player: " + player.id);
                lobby.players.remove(player.id);
                    for (Player nestedPlayer : lobby.players.values()) {
                        nestedPlayer.session.getBasicRemote().sendText(
                            String.format("{\"kind\": \"player-leave\", \"playerId\": \"%s\"}", player.id)
                        );
                    }
                break;
            }
        }
        
        // Once all players leave we delete all cached lobby data (ex images, guesses, etc.)
        if (lobby.players.isEmpty()) {
            lobbies.remove(lobbyId);
        }
    }

    // Redirects all messages meant for a lobby to that task
    @OnMessage
    public void onMessage(@PathParam("lobbyId") String lobbyId, Session senderSession, String rawMessage)
            throws IOException {
        LobbyTask lobby = lobbies.get(lobbyId);
        lobby.handleMessage(senderSession, rawMessage);
    }
}
