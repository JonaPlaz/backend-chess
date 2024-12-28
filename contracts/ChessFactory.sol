// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title ChessFactory
/// @dev Factory contract for creating and managing chess games, handling user registrations, and managing Chess token transactions.

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ChessTemplate.sol";

contract ChessFactory is Ownable, ReentrancyGuard {
	/* ========== STATE VARIABLES ========== */

	/// @notice Address of the Chess game template contract.
	address public templateAddress;

	/// @notice Address of the Chess ERC20 token contract.
	address public chessTokenAddress;

	/// @notice Total balance held by the platform in Chess tokens.
	uint256 public platformBalance;

	/// @notice Array of all game addresses created by the factory.
	address[] public games;

	/// @notice Array of all registered user addresses.
	address[] public userAddresses;

	/* ========== STRUCTS ========== */

	/// @notice Structure representing a user.
	struct User {
		address userAddress;
		string pseudo;
		uint256 balance;
	}

	/// @notice Structure representing a game.
	struct Game {
		address gameAddress;
		User player1;
		User player2;
		uint256 betAmount;
		uint256 startTime;
	}

	/* ========== MAPPINGS ========== */

	/// @notice Mapping from user address to User details.
	mapping(address => User) public users;

	/// @notice Mapping from player address to their current game address.
	mapping(address => address) public playerToGame;

	/// @notice Mapping from game address to Game details.
	mapping(address => Game) public gameDetails;

	/* ========== EVENTS ========== */

	/// @notice Emitted when a new game is created.
	event GameCreated(address indexed gameAddress, uint256 betAmount, uint256 startTime);

	/// @notice Emitted when a player registers to a game.
	event PlayerRegistered(address indexed gameAddress, address indexed player);

	/// @notice Emitted when a game starts.
	event GameStarted(address indexed gameAddress, address player1, address player2, uint256 betAmount, uint256 startTime);

	/// @notice Emitted when a new user registers.
	event UserRegistered(address indexed user, string pseudo, uint256 initialBalance);

	/// @notice Emitted when a game ends.
	event GameEnded(address indexed gameAddress, address winner, uint256 winnerReward, uint256 platformFee);

	/// @notice Emitted when rewards are distributed to players.
	event RewardsDistributed(address indexed player1, address indexed player2, address indexed winner, uint256 platformFee, uint256 reward);

	/// @notice Emitted when Chess tokens are purchased with Ether.
	event ChessTokensPurchased(address indexed buyer, uint256 ethSpent, uint256 chessBought);

	/// @notice Emitted when Chess tokens are withdrawn by the owner.
	event TokensWithdrawn(address indexed owner, uint256 amount);

	/// @notice Emitted when Ether is withdrawn by the owner.
	event EtherWithdrawn(address indexed owner, uint256 amount);

	/* ========== CONSTRUCTOR ========== */

	/// @notice Initializes the ChessFactory with the template address.
	/// @param _templateAddress Address of the Chess game template contract.
	constructor(address _templateAddress) Ownable(msg.sender) ReentrancyGuard() {
		require(_templateAddress != address(0), "Invalid template address");
		templateAddress = _templateAddress;
	}

	/* ========== ADMIN FUNCTIONS ========== */

	/// @notice Sets the address of the Chess ERC20 token contract.
	/// @param _chessToken Address of the Chess token contract.
	function setChessToken(address _chessToken) external onlyOwner {
		require(_chessToken != address(0), "Invalid ChessToken address");
		chessTokenAddress = _chessToken;
	}

	/// @notice Deposits Chess tokens into the platform balance.
	/// @param amount The amount of Chess tokens to deposit.
	function depositTokens(uint256 amount) external onlyOwner nonReentrant {
		require(chessTokenAddress != address(0), "ChessToken address not set");
		IERC20 chessToken = IERC20(chessTokenAddress);
		require(chessToken.allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");
		require(chessToken.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
		platformBalance += amount;
	}

	/// @notice Creates a new chess game with a specified bet amount and start time.
	/// @param betAmount The amount of Chess tokens to bet for the game.
	/// @param startTime The scheduled start time for the game.
	function createGame(uint256 betAmount, uint256 startTime) external onlyOwner nonReentrant {
		require(betAmount > 0, "Bet amount must be greater than 0");
		require(startTime > block.timestamp, "Start time must be in the future");
		require(templateAddress != address(0), "Template address not set");

		// Créer un clone du modèle de jeu
		address clone = Clones.clone(templateAddress);

		// Initialiser le jeu sans joueurs
		ChessTemplate(clone).initialize(address(0), address(0), address(this));

		// Ajouter les détails du jeu
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

	/// @notice Distributes rewards to the winner or both players in case of a draw.
	/// @param player1 Address of the first player.
	/// @param player2 Address of the second player.
	/// @param winner Address of the winner. Use address(0) in case of a draw.
	/// @param platformFee Amount of Chess tokens to be taken as platform fee.
	/// @param reward Amount of Chess tokens to be rewarded to the winner or both players.
	function distributeRewards(
		address player1,
		address player2,
		address winner,
		uint256 platformFee,
		uint256 reward
	) external nonReentrant {
		require(player1 != address(0) && player2 != address(0), "Invalid player addresses");
		require(platformBalance >= platformFee, "Insufficient platform balance");

		// Distribute rewards
		if (winner == address(0)) {
			users[player1].balance += reward;
			users[player2].balance += reward;
		} else {
			require(users[winner].userAddress != address(0), "Winner not registered");
			users[winner].balance += reward;
		}

		platformBalance += platformFee;

		emit RewardsDistributed(player1, player2, winner, platformFee, reward);
	}

	/// @notice Allows the owner to withdraw a specified amount of ChessTokens from the contract.
	/// @param amount The amount of ChessTokens to withdraw.
	function withdrawTokens(uint256 amount) external onlyOwner nonReentrant {
		require(chessTokenAddress != address(0), "ChessToken address not set");
		IERC20 chessToken = IERC20(chessTokenAddress);
		uint256 contractBalance = chessToken.balanceOf(address(this));
		require(amount <= contractBalance, "Insufficient ChessToken balance in contract");

		// Transfer tokens to the owner
		bool success = chessToken.transfer(msg.sender, amount);
		require(success, "Token transfer failed");

		emit TokensWithdrawn(msg.sender, amount);
	}

	/// @notice Allows the owner to withdraw a specified amount of Ether from the contract.
	/// @param amount The amount of Ether (in wei) to withdraw.
	function withdrawEther(uint256 amount) external onlyOwner nonReentrant {
		uint256 contractEthBalance = address(this).balance;
		require(amount <= contractEthBalance, "Insufficient Ether balance in contract");

		// Transfer Ether to the owner
		(bool success, ) = msg.sender.call{value: amount}("");
		require(success, "Ether transfer failed");

		emit EtherWithdrawn(msg.sender, amount);
	}

	/* ========== USER FUNCTIONS ========== */

	/// @notice Registers a new user with a chosen pseudo.
	/// @param pseudo The pseudo chosen by the user.
	function registerUser(string memory pseudo) external {
		require(users[msg.sender].userAddress == address(0), "User already registered");
		require(bytes(pseudo).length > 0, "Pseudo cannot be empty");
		require(platformBalance >= 1000 * 10 ** 18, "Insufficient platform balance");

		users[msg.sender] = User({userAddress: msg.sender, pseudo: pseudo, balance: 1000 * 10 ** 18});

		platformBalance -= 1000 * 10 ** 18;
		userAddresses.push(msg.sender);

		emit UserRegistered(msg.sender, pseudo, 1000 * 10 ** 18);
	}

	/// @notice Allows users to purchase Chess tokens by sending Ether.
	/// @param amountInEth The amount of Ether to spend for purchasing Chess tokens.
	function buyChessTokens(uint256 amountInEth) external payable nonReentrant {
		require(amountInEth > 0, "Amount must be greater than 0");
		require(msg.value == amountInEth, "Sent Ether does not match specified amount");
		require(chessTokenAddress != address(0), "ChessToken address not set");

		uint256 amountToBuy = (amountInEth * 10 ** 18) / 0.000001 ether;

		// Ensure the platform has enough Chess tokens to sell
		require(platformBalance >= amountToBuy, "Not enough ChessTokens in the platform balance");

		// Update user and platform balances
		users[msg.sender].balance += amountToBuy;
		platformBalance -= amountToBuy;

		emit ChessTokensPurchased(msg.sender, msg.value, amountToBuy);
	}

	/* ========== GAME FUNCTIONS ========== */

	/// @notice Registers the caller to a specific game.
	/// @param gameAddress The address of the game to join.
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

			// Activate the game only when both players are set
			ChessTemplate(game.gameAddress).setGameActive();
		}

		// Update balances and mappings
		user.balance -= game.betAmount;
		platformBalance += game.betAmount;
		playerToGame[msg.sender] = gameAddress;

		emit PlayerRegistered(gameAddress, msg.sender);
	}

	/// @notice Starts a game once both players have joined and the start time has been reached.
	/// @param gameAddress The address of the game to start.
	function joinGame(address gameAddress) external nonReentrant {
		Game storage game = gameDetails[gameAddress];
		require(game.gameAddress != address(0), "Game does not exist");
		require(game.player1.userAddress != address(0), "Player 1 not registered");
		require(game.player2.userAddress != address(0), "Player 2 not registered");
		require(ChessTemplate(gameAddress).isGameActive(), "Game is not active");
		require(block.timestamp >= game.startTime, "Game start time not reached");

		emit GameStarted(gameAddress, game.player1.userAddress, game.player2.userAddress, game.betAmount, block.timestamp);
	}

	/* ========== VIEW FUNCTIONS ========== */

	/// @notice Retrieves a paginated list of registered users.
	/// @param start Index to start from.
	/// @param count Number of users to retrieve.
	/// @return allUsers An array of User structs.
	function getUsers(uint256 start, uint256 count) external view returns (User[] memory) {
		require(start < userAddresses.length, "Start index out of bounds");

		uint256 end = start + count;
		if (end > userAddresses.length) {
			end = userAddresses.length;
		}

		uint256 size = end - start;
		User[] memory allUsers = new User[](size);

		for (uint256 i = 0; i < size; i++) {
			allUsers[i] = users[userAddresses[start + i]];
		}

		return allUsers;
	}

	/// @notice Retrieves a paginated list of all created games.
	/// @param start Index to start from.
	/// @param count Number of games to retrieve.
	/// @return allGames An array of Game structs.
	function getGames(uint256 start, uint256 count) external view returns (Game[] memory) {
		require(start < games.length, "Start index out of bounds");

		uint256 end = start + count;
		if (end > games.length) {
			end = games.length;
		}

		uint256 size = end - start;
		Game[] memory allGames = new Game[](size);

		for (uint256 i = 0; i < size; i++) {
			allGames[i] = gameDetails[games[start + i]];
		}

		return allGames;
	}

	/// @notice Retrieves details of a specific game.
	/// @param gameAddress The address of the game to retrieve details for.
	/// @return game The Game struct containing the game's details.
	function getGameDetails(address gameAddress) external view returns (Game memory) {
		Game storage game = gameDetails[gameAddress];
		require(game.gameAddress != address(0), "Game does not exist");

		return game;
	}

	/// @notice Retrieves the caller's user details.
	/// @return user The User struct of the caller.
	function getUser() external view returns (User memory) {
		User storage user = users[msg.sender];
		require(user.userAddress != address(0), "User not registered");

		return user;
	}

	/* ========== FALLBACK FUNCTIONS ========== */

	/// @notice Fallback function to accept Ether.
	receive() external payable {}
}
