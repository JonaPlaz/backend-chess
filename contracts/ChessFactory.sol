// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ChessTemplate.sol";

// ajouter withdrawTokens pour récupérer les tokens du contrat
// utiliser call et non transfer pour les tokens
// regarder instructions si user peut s'inscrire à plusieurs parties simultanément

// modifier registerToGame et createGame en conséquence
// achat du token contre de l'ether contre du chess : à définir le don de chess à l'inscription
// achat du token 1 chess pour 0.000001 ether = à la mise d'une partie
// acheter sur le contrat ou acheter sur la plateforme

// plateforme 500 et 1500 au vainqueur
// égalite plateforme : 500 : 750 à chaque joueur - joueur perd 250 chess
// faut il burner du token en fin de partie - pourquoi ? par la plateforme ou par le contrat token directement
contract ChessFactory is Ownable {
	address public templateAddress;
	address public chessTokenAddress;
	uint256 public platformBalance;
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
		uint256 startTime;
	}

	mapping(address => User) public users;
	address[] public userAddresses;
	mapping(address => address) public playerToGame;
	mapping(address => Game) public gameDetails;

	event GameCreated(address indexed gameAddress, uint256 betAmount, uint256 startTime);
	event PlayerRegistered(address indexed gameAddress, address indexed player);
	event GameStarted(address indexed gameAddress, address player1, address player2, uint256 betAmount, uint256 startTime);
	event UserRegistered(address indexed user, string pseudo, uint256 initialBalance);
	event GameEnded(address indexed gameAddress, address winner, uint256 winnerReward, uint256 platformFee);
	event RewardsDistributed(address indexed player1, address indexed player2, address indexed winner, uint256 platformFee, uint256 reward);
	event ChessTokensPurchased(address indexed buyer, uint256 ethSpent, uint256 chessBought);

	constructor(address _templateAddress) Ownable(msg.sender) {
		templateAddress = _templateAddress;
	}

	function setChessToken(address _chessToken) external onlyOwner {
		chessTokenAddress = _chessToken;
	}

	function depositTokens(uint256 amount) external onlyOwner {
		require(chessTokenAddress != address(0), "ChessToken address not set");
		IERC20(chessTokenAddress).transferFrom(msg.sender, address(this), amount);
		platformBalance += amount;
	}

	function registerUser(string memory pseudo) external {
		require(users[msg.sender].userAddress == address(0), "User already registered");
		require(bytes(pseudo).length > 0, "Pseudo cannot be empty");

		require(platformBalance >= 1000 * 10 ** 18, "Insufficient platform balance");

		users[msg.sender] = User({userAddress: msg.sender, pseudo: pseudo, balance: 1000 * 10 ** 18});

		platformBalance -= 1000 * 10 ** 18;
		userAddresses.push(msg.sender);
		emit UserRegistered(msg.sender, pseudo, 1000 * 10 ** 18);
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

	function buyChessTokens(uint256 amountInEth) external payable {
		require(amountInEth > 0, "Amount must be greater than 0");
		require(msg.value == amountInEth, "Sent Ether does not match specified amount");
		require(chessTokenAddress != address(0), "ChessToken address not set");

		uint256 amountToBuy = (amountInEth * 10 ** 18) / 0.000001 ether;

		// Vérifie que la plateforme a assez de tokens Chess en réserve
		require(platformBalance >= amountToBuy, "Not enough ChessTokens in the platform balance");

		// Augmente la balance de l'utilisateur en Chess
		users[msg.sender].balance += amountToBuy;

		// Réduit la balance disponible de la plateforme
		platformBalance -= amountToBuy;

		// Émission d'un événement pour traçabilité
		emit ChessTokensPurchased(msg.sender, msg.value, amountToBuy);
	}

	function createGame(uint256 betAmount, uint256 startTime) external onlyOwner {
		require(betAmount > 0, "Bet amount must be greater than 0");
		require(startTime > block.timestamp, "Start time must be in the future");

		address clone = Clones.clone(templateAddress);

		// Passez l'adresse du ChessFactory au clone lors de l'initialisation
		ChessTemplate(clone).initialize(
			address(0), // Player 1
			address(0), // Player 2
			betAmount, // Montant du pari
			address(this) // Adresse du ChessFactory
		);

		games.push(clone);

		gameDetails[clone] = Game({
			gameAddress: clone,
			player1: User({userAddress: address(0), pseudo: "", balance: 0}),
			player2: User({userAddress: address(0), pseudo: "", balance: 0}),
			betAmount: betAmount,
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
		require(playerToGame[msg.sender] == address(0), "Already registered to a game");
		require(game.player1.userAddress == address(0) || game.player2.userAddress == address(0), "Game is already full");

		if (game.player1.userAddress == address(0)) {
			game.player1 = user;
			ChessTemplate(game.gameAddress).setPlayer1(user.userAddress);
		} else if (game.player2.userAddress == address(0)) {
			game.player2 = user;
			ChessTemplate(game.gameAddress).setPlayer2(user.userAddress);

			ChessTemplate(game.gameAddress).setGameActive();
		}

		user.balance -= game.betAmount;
		platformBalance += game.betAmount;

		playerToGame[msg.sender] = gameAddress;

		emit PlayerRegistered(gameAddress, msg.sender);
	}

	function joinGame(address gameAddress) external {
		Game storage game = gameDetails[gameAddress];
		require(game.gameAddress != address(0), "Game does not exist");
		require(game.player1.userAddress != address(0), "Player 1 not registered");
		require(game.player2.userAddress != address(0), "Player 2 not registered");
		require(ChessTemplate(gameAddress).isGameActive(), "Game is not active");
		require(block.timestamp >= game.startTime, "Game start time not reached");

		emit GameStarted(gameAddress, game.player1.userAddress, game.player2.userAddress, game.betAmount, block.timestamp);
	}

	function distributeRewards(address player1, address player2, address winner, uint256 platformFee, uint256 reward) external {
		require(msg.sender != address(0), "Invalid caller");
		require(platformBalance >= platformFee, "Insufficient platform balance");

		platformBalance += platformFee;

		if (winner == address(0)) {
			users[player1].balance += reward;
			users[player2].balance += reward;
		} else {
			users[winner].balance += reward;
		}

		emit RewardsDistributed(player1, player2, winner, platformFee, reward);
	}

	function getAllGameDetails() external view returns (Game[] memory) {
		Game[] memory allGames = new Game[](games.length);
		for (uint256 i = 0; i < games.length; i++) {
			allGames[i] = gameDetails[games[i]];
		}
		return allGames;
	}

	function getGameDetails(address gameAddress) external view returns (Game memory) {
		Game storage game = gameDetails[gameAddress];
		require(game.gameAddress != address(0), "Game does not exist");

		return game;
	}
}
