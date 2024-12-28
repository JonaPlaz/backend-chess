// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ChessToken
 * @dev ERC20 token with minting and burning capabilities, restricted by an external ChessFactory contract.
 *      This contract is owned by the deployer and uses OpenZeppelin libraries for security and modularity.
 */
contract ChessToken is ERC20, Ownable, ReentrancyGuard {
	/// @notice Address of the authorized ChessFactory contract
	address public chessFactory;

	/**
	 * @dev Constructor to initialize the ChessToken contract with an initial supply.
	 *      The initial supply is minted to the deployer's address.
	 * @param initialSupply The initial supply of tokens in whole units (before decimals).
	 */
	constructor(uint256 initialSupply) ERC20("ChessToken", "CHESS") Ownable(msg.sender) {
		_mint(msg.sender, initialSupply);
	}

	// -------------------------------------------------------------
	// Configuration Functions (Owner Only)
	// -------------------------------------------------------------

	/**
	 * @notice Sets the address of the ChessFactory contract.
	 * @dev Can only be called by the owner of the contract.
	 * @param _chessFactory The address of the ChessFactory contract.
	 */
	function setChessFactory(address _chessFactory) external onlyOwner {
		require(_chessFactory != address(0), "Invalid address");
		chessFactory = _chessFactory;
	}

	// -------------------------------------------------------------
	// Core ERC20 Functions
	// -------------------------------------------------------------

	/**
	 * @notice Allows the ChessFactory contract to mint new tokens.
	 * @dev Can only be called by the ChessFactory contract.
	 * @param to The address that will receive the minted tokens.
	 * @param amount The amount of tokens to mint (in smallest units).
	 */
	function mintTokens(address to, uint256 amount) external nonReentrant {
		require(msg.sender == chessFactory, "Only ChessFactory can mint tokens");
		require(to != address(0), "Invalid recipient address");
		require(amount > 0, "Amount must be greater than 0");

		_mint(to, amount);
	}

	/**
	 * @notice Allows token holders to burn (destroy) their own tokens.
	 * @dev Burns tokens from the caller's balance, reducing total supply.
	 * @param amount The amount of tokens to burn (in smallest units).
	 */
	function burn(uint256 amount) external nonReentrant {
		require(amount > 0, "Amount must be greater than 0");
		_burn(msg.sender, amount);
	}

	// -------------------------------------------------------------
	// Emergency Recovery Functions (Owner Only)
	// -------------------------------------------------------------

	/**
	 * @notice Allows the owner to recover ERC20 tokens sent to this contract by mistake.
	 * @dev Prevents the withdrawal of the ChessToken itself.
	 * @param token The address of the ERC20 token contract to withdraw.
	 * @param amount The amount of tokens to withdraw (in smallest units).
	 */
	function withdrawERC20(address token, uint256 amount) external onlyOwner nonReentrant {
		require(token != address(this), "Cannot withdraw ChessToken itself");
		require(amount > 0, "Amount must be greater than 0");

		(bool success, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount));

		require(success && (data.length == 0 || abi.decode(data, (bool))), "Token transfer failed");
	}

	// -------------------------------------------------------------
	// Fallback Functions
	// -------------------------------------------------------------

	/**
	 * @notice Rejects incoming Ether transfers to this contract.
	 * @dev Prevents force-feeding Ether to the contract.
	 */
	receive() external payable {
		revert("Contract does not accept Ether");
	}
}
