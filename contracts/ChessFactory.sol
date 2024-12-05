// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ChessTemplate.sol";

contract ChessFactory is Ownable {
    address public templateAddress;
    address public chessTokenAddress;
    uint256 public platformBalance; // Tokens disponibles sur la plateforme
    address[] public games;

    struct User {
        address userAddress;
        string pseudo;
        uint256 balance;
    }

    struct Game {
        address gameAddress;
        User player1;
        User player2;
        uint256 betAmount;
        bool player1Joined;
        bool player2Joined;
    }

    mapping(address => User) public users;
    mapping(address => address) public playerToGame;
    mapping(address => Game) public gameDetails;

    event GameCreated(address indexed gameAddress, uint256 betAmount);
    event PlayerJoined(address indexed gameAddress, address player);
    event UserRegistered(
        address indexed user,
        string pseudo,
        uint256 initialBalance
    );

    constructor(address _templateAddress) Ownable(msg.sender) {
        templateAddress = _templateAddress;
    }

    // Définit l'adresse du ChessToken (seulement par le propriétaire)
    function setChessToken(address _chessToken) external onlyOwner {
        chessTokenAddress = _chessToken;
    }

    // Fonction pour transférer des tokens au contrat ChessFactory
    function depositTokens(uint256 amount) external onlyOwner {
        require(chessTokenAddress != address(0), "ChessToken address not set");

        IERC20(chessTokenAddress).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        platformBalance += amount;
    }

    // Inscription d'un utilisateur avec distribution automatique de tokens
    function registerUser(string memory pseudo) external {
        require(
            users[msg.sender].userAddress == address(0),
            "User already registered"
        );
        require(bytes(pseudo).length > 0, "Pseudo cannot be empty");
        require(chessTokenAddress != address(0), "ChessToken address not set");

        // Assurez-vous que la plateforme a suffisamment de tokens pour distribuer
        require(
            platformBalance >= 100 * 10 ** 18,
            "Insufficient platform balance"
        );

        users[msg.sender] = User({
            userAddress: msg.sender,
            pseudo: pseudo,
            balance: 100 * 10 ** 18 // Mettre en wei
        });

        // Transférer 100 ChessTokens à l'utilisateur
        IERC20(chessTokenAddress).transfer(msg.sender, 100 * 10 ** 18);

        // Réduire le solde de la plateforme
        platformBalance -= 100 * 10 ** 18;

        emit UserRegistered(msg.sender, pseudo, 100);
    }

    function createGame(uint256 betAmount) external onlyOwner {
        require(betAmount > 0, "Bet amount must be greater than 0");
        require(chessTokenAddress != address(0), "ChessToken address not set");

        // Clone le ChessTemplate
        address clone = Clones.clone(templateAddress);

        // Ajouter le clone à la liste des parties
        games.push(clone);

        // Initialiser les détails de la partie
        gameDetails[clone] = Game({
            gameAddress: clone,
            player1: User({userAddress: address(0), pseudo: "", balance: 0}),
            player2: User({userAddress: address(0), pseudo: "", balance: 0}),
            betAmount: betAmount,
            player1Joined: false,
            player2Joined: false
        });

        emit GameCreated(clone, betAmount);
    }

    function joinGame(address gameAddress) external {
        Game storage game = gameDetails[gameAddress];
        User storage user = users[msg.sender];

        require(game.gameAddress != address(0), "Game does not exist");
        require(user.userAddress != address(0), "User not registered");
        require(user.balance >= game.betAmount, "Insufficient balance");
        require(playerToGame[msg.sender] == address(0), "Already in a game");
        require(!game.player2Joined, "Game is already full");

        // Si le joueur 1 n'a pas encore rejoint
        if (!game.player1Joined) {
            game.player1 = user;
            game.player1Joined = true;

            // Associer le joueur 1 au jeu
            ChessTemplate(game.gameAddress).initialize(
                msg.sender,
                address(0),
                game.betAmount
            );
        }
        // Si le joueur 2 n'a pas encore rejoint
        else if (!game.player2Joined) {
            game.player2 = user;
            game.player2Joined = true;

            // Compléter l'initialisation avec les deux joueurs
            ChessTemplate(game.gameAddress).initialize(
                game.player1.userAddress,
                msg.sender,
                game.betAmount
            );
        }

        // Réduire le solde du joueur après avoir rejoint
        user.balance -= game.betAmount;

        // Associer le joueur à ce jeu
        playerToGame[msg.sender] = gameAddress;

        emit PlayerJoined(gameAddress, msg.sender);
    }

    function getGames() external view returns (address[] memory) {
        return games;
    }

    function getUser(address userAddress) external view returns (User memory) {
        return users[userAddress];
    }
}
