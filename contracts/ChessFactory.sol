// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ChessTemplate.sol";

contract ChessFactory is Ownable {
    address public templateAddress;
    address public chessTokenAddress;
    uint256 public platformBalance;
    address[] public games;

    struct User {
        address userAddress;
        string pseudo;
        uint256 balance; // Balance des tokens sur la plateforme
    }

    struct Game {
        address gameAddress;
        User player1;
        User player2;
        uint256 betAmount;
        bool playerStarted; // Indique si les deux joueurs sont prêts
        uint256 startTime; // Heure de début de la partie (timestamp Unix)
    }

    mapping(address => User) public users;
    address[] public userAddresses;
    mapping(address => address) public playerToGame;
    mapping(address => Game) public gameDetails;

    event GameCreated(
        address indexed gameAddress,
        uint256 betAmount,
        uint256 startTime
    );
    event PlayerRegistered(address indexed gameAddress, address indexed player);
    event GameStarted(
        address indexed gameAddress,
        address player1,
        address player2,
        uint256 betAmount,
        uint256 startTime
    );
    event UserRegistered(
        address indexed user,
        string pseudo,
        uint256 initialBalance
    );
    event GameEnded(
        address indexed gameAddress,
        address winner,
        uint256 winnerReward,
        uint256 platformFee
    );

    constructor(address _templateAddress) Ownable(msg.sender) {
        templateAddress = _templateAddress;
    }

    function setChessToken(address _chessToken) external onlyOwner {
        chessTokenAddress = _chessToken;
    }

    function depositTokens(uint256 amount) external onlyOwner {
        require(chessTokenAddress != address(0), "ChessToken address not set");
        IERC20(chessTokenAddress).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        platformBalance += amount;
    }

    function registerUser(string memory pseudo) external {
        require(
            users[msg.sender].userAddress == address(0),
            "User already registered"
        );
        require(bytes(pseudo).length > 0, "Pseudo cannot be empty");

        require(
            platformBalance >= 100 * 10 ** 18,
            "Insufficient platform balance"
        );

        users[msg.sender] = User({
            userAddress: msg.sender,
            pseudo: pseudo,
            balance: 100 * 10 ** 18
        });

        platformBalance -= 100 * 10 ** 18;
        userAddresses.push(msg.sender);
        emit UserRegistered(msg.sender, pseudo, 100 * 10 ** 18);
    }

    function getAllUsers() public view returns (User[] memory) {
        User[] memory allUsers = new User[](userAddresses.length);
        for (uint256 i = 0; i < userAddresses.length; i++) {
            allUsers[i] = users[userAddresses[i]];
        }
        return allUsers;
    }

    function getUser() external view returns (User memory) {
        User storage user = users[msg.sender];
        require(user.userAddress != address(0), "User not registered");

        return user;
    }

    function createGame(
        uint256 betAmount,
        uint256 startTime
    ) external onlyOwner {
        require(betAmount > 0, "Bet amount must be greater than 0");
        require(
            startTime > block.timestamp,
            "Start time must be in the future"
        );

        address clone = Clones.clone(templateAddress);
        games.push(clone);

        gameDetails[clone] = Game({
            gameAddress: clone,
            player1: User({userAddress: address(0), pseudo: "", balance: 0}),
            player2: User({userAddress: address(0), pseudo: "", balance: 0}),
            betAmount: betAmount,
            playerStarted: false,
            startTime: startTime
        });

        emit GameCreated(clone, betAmount, startTime);
    }

    function registerToGame(address gameAddress) external {
        Game storage game = gameDetails[gameAddress];
        User storage user = users[msg.sender];

        require(game.gameAddress != address(0), "Game does not exist");
        require(user.userAddress != address(0), "User not registered");
        require(user.balance >= game.betAmount, "Insufficient balance");
        require(
            playerToGame[msg.sender] == address(0),
            "Already registered to a game"
        );
        require(
            game.player1.userAddress == address(0) ||
                game.player2.userAddress == address(0),
            "Game is already full"
        );

        if (game.player1.userAddress == address(0)) {
            game.player1 = user;
        } else if (game.player2.userAddress == address(0)) {
            game.player2 = user;
        }

        user.balance -= game.betAmount;
        platformBalance += game.betAmount;

        playerToGame[msg.sender] = gameAddress;

        emit PlayerRegistered(gameAddress, msg.sender);
    }

    function startGame(address gameAddress) external {
        Game storage game = gameDetails[gameAddress];

        require(game.gameAddress != address(0), "Game does not exist");
        require(
            game.player1.userAddress != address(0),
            "Player 1 not registered"
        );
        require(
            game.player2.userAddress != address(0),
            "Player 2 not registered"
        );
        require(game.playerStarted, "Players are not ready");
        require(
            block.timestamp >= game.startTime,
            "Game start time not reached"
        );

        ChessTemplate(game.gameAddress).initialize(
            game.player1.userAddress,
            game.player2.userAddress,
            game.betAmount
        );

        emit GameStarted(
            gameAddress,
            game.player1.userAddress,
            game.player2.userAddress,
            game.betAmount,
            block.timestamp
        );
    }

    function endGame(
        address gameAddress,
        address winner,
        uint8 outcome
    ) external onlyOwner {
        Game storage game = gameDetails[gameAddress];

        require(game.gameAddress != address(0), "Game does not exist");
        require(outcome != 0, "Game has not ended yet");

        uint256 totalBet = game.betAmount * 2;
        uint256 platformFee = totalBet / 20; // 5%
        uint256 winnerReward = totalBet - platformFee;

        platformBalance -= winnerReward;

        if (winner != address(0)) {
            users[winner].balance += winnerReward;
        }

        emit GameEnded(gameAddress, winner, winnerReward, platformFee);
    }

    function getAllGameDetails() external view returns (Game[] memory) {
        Game[] memory allGames = new Game[](games.length);
        for (uint256 i = 0; i < games.length; i++) {
            allGames[i] = gameDetails[games[i]];
        }
        return allGames;
    }

    function getGameDetails(
        address gameAddress
    ) external view returns (Game memory) {
        Game storage game = gameDetails[gameAddress];
        require(game.gameAddress != address(0), "Game does not exist");

        return game;
    }
}
