// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title ChessFactory
/// @dev Factory contract for creating and managing chess games, handling user registrations, and managing Chess token transactions.

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Interface for ChessTemplate to interact without importing the contract
interface IChessTemplate {
	function initialize(address _factory) external;
	function setPlayer1(address _player1) external;
	function setPlayer2(address _player2) external;
	function setGameActive() external;
	function isGameActive() external view returns (bool);
}

contract ChessFactory is Ownable, ReentrancyGuard {
	/* ========== STATE VARIABLES ========== */

	address public immutable templateAddress;
	address public chessTokenAddress;

	address[] public userAddresses;
	address[] public games;

	uint256 public platformBalance;

	/* ========== STRUCTS ========== */

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

	/* ========== MAPPINGS ========== */

	mapping(address => User) public users;
	mapping(address => address) public playerToGame;
	mapping(address => Game) public gameDetails;

	/* ========== EVENTS ========== */

	event GameCreated(address indexed gameAddress, uint256 betAmount, uint256 startTime);
	event PlayerRegistered(address indexed gameAddress, address indexed player);
	event GameStarted(address indexed gameAddress, address player1, address player2, uint256 betAmount, uint256 startTime);
	event UserRegistered(address indexed user, string pseudo, uint256 initialBalance);
	event GameEnded(address indexed gameAddress, address winner, uint256 winnerReward, uint256 platformFee);
	event RewardsDistributed(address indexed player1, address indexed player2, address indexed winner, uint256 platformFee, uint256 reward);
	event ChessTokensPurchased(address indexed buyer, uint256 ethSpent, uint256 chessBought);
	event TokensWithdrawn(address indexed owner, uint256 amount);
	event EtherWithdrawn(address indexed owner, uint256 amount);

	/* ========== CUSTOM ERRORS ========== */

	error InvalidTemplateAddress();
	error InvalidChessTokenAddress();
	error InvalidBetAmount();
	error StartTimeInPast();
	error UserAlreadyRegistered();
	error EmptyPseudo();
	error InsufficientPlatformBalance();
	error InsufficientAllowance();
	error TokenTransferFailed();
	error GameDoesNotExist();
	error UserNotRegistered();
	error InsufficientBalance();
	error GameAlreadyFull();
	error WinnerNotRegistered();
	error InsufficientContractBalance();
	error EtherTransferFailed();
	error StartIndexOutOfBounds();
	error NotParticipant();

	/* ========== MODIFIERS ========== */

	modifier gameExists(address gameAddress) {
		if (gameDetails[gameAddress].gameAddress == address(0)) {
			revert GameDoesNotExist();
		}
		_;
	}

	modifier onlyUser(address user) {
		if (users[user].userAddress == address(0)) {
			revert UserNotRegistered();
		}
		_;
	}

	modifier onlyPlayer(address gameAddress) {
		Game storage game = gameDetails[gameAddress];
		if (msg.sender != game.player1.userAddress && msg.sender != game.player2.userAddress) {
			revert NotParticipant();
		}
		_;
	}

	/* ========== CONSTRUCTOR ========== */

	/// @notice Initializes the ChessFactory with the template address.
	/// @param _templateAddress Address of the Chess game template contract.
	constructor(address _templateAddress) Ownable(msg.sender) ReentrancyGuard() {
		if (_templateAddress == address(0)) {
			revert InvalidTemplateAddress();
		}
		templateAddress = _templateAddress;
	}

	/* ========== ADMIN FUNCTIONS ========== */

	/// @notice Sets the address of the Chess ERC20 token contract.
	/// @param _chessToken Address of the Chess token contract.
	function setChessToken(address _chessToken) external onlyOwner {
		if (_chessToken == address(0)) {
			revert InvalidChessTokenAddress();
		}
		chessTokenAddress = _chessToken;
	}

	/// @notice Deposits Chess tokens into the platform balance.
	/// @param amount The amount of Chess tokens to deposit.
	function depositTokens(uint256 amount) external onlyOwner nonReentrant {
		if (chessTokenAddress == address(0)) {
			revert InvalidChessTokenAddress();
		}

		IERC20 chessToken = IERC20(chessTokenAddress);
		if (chessToken.allowance(msg.sender, address(this)) < amount) {
			revert InsufficientAllowance();
		}

		if (!chessToken.transferFrom(msg.sender, address(this), amount)) {
			revert TokenTransferFailed();
		}

		platformBalance += amount;
	}

	/// @notice Creates a new chess game with a specified bet amount and start time.
	/// @dev Uses the OpenZeppelin Clones library, which implements the EIP-1167 minimal proxy pattern.
	///      The `assembly` code in Clones.sol is safe and well-audited to reduce deployment costs.
	/// @param betAmount The amount of Chess tokens to bet for the game.
	/// @param startTime The scheduled start time for the game.
	function createGame(uint256 betAmount, uint256 startTime) external onlyOwner {
		if (betAmount == 0) {
			revert InvalidBetAmount();
		}
		if (startTime <= block.timestamp) {
			revert StartTimeInPast();
		}
		if (templateAddress == address(0)) {
			revert InvalidTemplateAddress();
		}

		// Use OpenZeppelin Clones to create a new proxy contract
		address clone = Clones.clone(templateAddress);
		IChessTemplate(clone).initialize(address(this));

		// Store game details
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
		if (player1 == address(0) || player2 == address(0)) {
			revert UserNotRegistered();
		}
		if (platformBalance < platformFee) {
			revert InsufficientPlatformBalance();
		}

		// Distribute rewards
		if (winner == address(0)) {
			users[player1].balance += reward;
			users[player2].balance += reward;
		} else {
			if (users[winner].userAddress == address(0)) {
				revert WinnerNotRegistered();
			}
			users[winner].balance += reward;
		}

		platformBalance += platformFee;

		emit RewardsDistributed(player1, player2, winner, platformFee, reward);
	}

	/// @notice Allows the owner to withdraw a specified amount of ChessTokens from the contract.
	/// @param amount The amount of ChessTokens to withdraw.
	function withdrawTokens(uint256 amount) external onlyOwner nonReentrant {
		if (chessTokenAddress == address(0)) {
			revert InvalidChessTokenAddress();
		}

		IERC20 chessToken = IERC20(chessTokenAddress);
		uint256 contractBalance = chessToken.balanceOf(address(this));

		if (amount > contractBalance) {
			revert InsufficientContractBalance();
		}

		// Update the platform balance
		platformBalance -= amount;

		(bool success, bytes memory data) = address(chessToken).call(abi.encodeWithSelector(IERC20.transfer.selector, msg.sender, amount));

		if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
			revert TokenTransferFailed();
		}

		emit TokensWithdrawn(msg.sender, amount);
	}

	/// @notice Allows the owner to withdraw a specified amount of Ether from the contract.
	/// @param amount The amount of Ether (in wei) to withdraw.
	function withdrawEther(uint256 amount) external onlyOwner nonReentrant {
		uint256 contractEthBalance = address(this).balance;

		if (amount > contractEthBalance) {
			revert InsufficientContractBalance();
		}

		(bool success, ) = msg.sender.call{value: amount}("");
		if (!success) {
			revert EtherTransferFailed();
		}

		emit EtherWithdrawn(msg.sender, amount);
	}

	/* ========== USER FUNCTIONS ========== */

	/// @notice Registers a new user with a chosen pseudo.
	/// @param pseudo The pseudo chosen by the user.
	function registerUser(string memory pseudo) external {
		if (users[msg.sender].userAddress != address(0)) {
			revert UserAlreadyRegistered();
		}
		if (bytes(pseudo).length == 0) {
			revert EmptyPseudo();
		}
		if (platformBalance < 1000 * 1e18) {
			revert InsufficientPlatformBalance();
		}

		users[msg.sender] = User({userAddress: msg.sender, pseudo: pseudo, balance: 1000 * 1e18});

		platformBalance -= 1000 * 1e18;
		userAddresses.push(msg.sender);

		emit UserRegistered(msg.sender, pseudo, 1000 * 1e18);
	}

	/// @notice Allows users to purchase Chess tokens by sending Ether.
	/// @param amountInEth The amount of Ether to spend for purchasing Chess tokens.
	function buyChessTokens(uint256 amountInEth) external payable nonReentrant {
		if (amountInEth == 0) {
			revert InvalidBetAmount();
		}
		if (msg.value != amountInEth) {
			revert InvalidBetAmount();
		}
		if (chessTokenAddress == address(0)) {
			revert InvalidChessTokenAddress();
		}

		uint256 amountToBuy = (amountInEth * 1e18) / 0.000001 ether;

		if (platformBalance < amountToBuy) {
			revert InsufficientPlatformBalance();
		}

		// Update user and platform balances
		users[msg.sender].balance += amountToBuy;
		platformBalance -= amountToBuy;

		emit ChessTokensPurchased(msg.sender, msg.value, amountToBuy);
	}

	/* ========== GAME FUNCTIONS ========== */

	/// @notice Registers the caller to a specific game.
	/// @param gameAddress The address of the game to join.
	function registerToGame(address gameAddress) external gameExists(gameAddress) onlyUser(msg.sender) nonReentrant {
		Game storage game = gameDetails[gameAddress];
		User storage user = users[msg.sender];

		if (user.balance < game.betAmount) {
			revert InsufficientBalance();
		}
		if (game.player1.userAddress != address(0) && game.player2.userAddress != address(0)) {
			revert GameAlreadyFull();
		}

		if (game.player1.userAddress == address(0)) {
			game.player1 = user;
			IChessTemplate(game.gameAddress).setPlayer1(user.userAddress);
		} else if (game.player2.userAddress == address(0)) {
			game.player2 = user;
			IChessTemplate(game.gameAddress).setPlayer2(user.userAddress);

			// Activate the game only when both players are set
			IChessTemplate(game.gameAddress).setGameActive();
		}

		// Update balances and mappings
		user.balance -= game.betAmount;
		platformBalance += game.betAmount;
		playerToGame[msg.sender] = gameAddress;

		emit PlayerRegistered(gameAddress, msg.sender);
	}

	/// @notice Starts a game once both players have joined and the start time has been reached.
	/// @param gameAddress The address of the game to start.
	function joinGame(address gameAddress) external nonReentrant gameExists(gameAddress) onlyPlayer(gameAddress) {
		Game storage game = gameDetails[gameAddress];
		if (!IChessTemplate(gameAddress).isGameActive()) {
			revert InvalidChessTokenAddress();
		}
		if (block.timestamp < game.startTime) {
			revert StartTimeInPast();
		}

		emit GameStarted(gameAddress, game.player1.userAddress, game.player2.userAddress, game.betAmount, block.timestamp);
	}

	/* ========== VIEW FUNCTIONS ========== */

	/// @notice Retrieves a paginated list of registered users.
	/// @param start Index to start from.
	/// @param count Number of users to retrieve.
	/// @return allUsers An array of User structs.
	function getUsers(uint256 start, uint256 count) external view returns (User[] memory allUsers) {
		if (start >= userAddresses.length) {
			revert StartIndexOutOfBounds();
		}

		uint256 end = start + count;
		if (end > userAddresses.length) {
			end = userAddresses.length;
		}

		uint256 size = end - start;
		allUsers = new User[](size);

		for (uint256 i = 0; i < size; i++) {
			allUsers[i] = users[userAddresses[start + i]];
		}
	}

	/// @notice Retrieves a paginated list of all created games.
	/// @param start Index to start from.
	/// @param count Number of games to retrieve.
	/// @return allGames An array of Game structs.
	function getGames(uint256 start, uint256 count) external view returns (Game[] memory allGames) {
		if (start >= games.length) {
			revert StartIndexOutOfBounds();
		}

		uint256 end = start + count;
		if (end > games.length) {
			end = games.length;
		}

		uint256 size = end - start;
		allGames = new Game[](size);

		for (uint256 i = 0; i < size; i++) {
			allGames[i] = gameDetails[games[start + i]];
		}
	}

	/// @notice Retrieves details of a specific game.
	/// @param gameAddress The address of the game to retrieve details for.
	/// @return game The Game struct containing the game's details.
	function getGameDetails(address gameAddress) external view gameExists(gameAddress) returns (Game memory game) {
		game = gameDetails[gameAddress];
	}

	/// @notice Retrieves the caller's user details.
	/// @return user The User struct of the caller.
	function getUser() external view onlyUser(msg.sender) returns (User memory user) {
		user = users[msg.sender];
	}

	/* ========== FALLBACK FUNCTIONS ========== */

	/// @notice Fallback function to accept Ether.
	receive() external payable {}
}
