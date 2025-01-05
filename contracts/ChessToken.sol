// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ChessToken
 * @dev ERC20 token with minting and burning capabilities, restricted by an external ChessFactory contract.
 */
contract ChessToken is ERC20, Ownable, ReentrancyGuard {
	using SafeERC20 for IERC20;

	// -------------------------------------------------------------
	// Custom Errors
	// -------------------------------------------------------------

	error InvalidAddress();
	error InvalidRecipientAddress();
	error AmountMustBeGreaterThanZero();

	// -------------------------------------------------------------
	// Constructor
	// -------------------------------------------------------------

	/**
	 * @dev Constructor to initialize the ChessToken contract with an initial supply.
	 *      The initial supply is minted to the deployer's address.
	 * @param initialSupply The initial supply of tokens in whole units (before decimals).
	 */
	constructor(uint256 initialSupply) ERC20("ChessToken", "CHESS") Ownable(msg.sender) {
		_mint(msg.sender, initialSupply);
	}

	// -------------------------------------------------------------
	// Core ERC20 Functions
	// -------------------------------------------------------------

	/**
	 * @notice Allows the Owner of contract to mint new tokens.
	 * @dev Can only be called by the Owner.
	 * @param to The address that will receive the minted tokens.
	 * @param amount The amount of tokens to mint (in smallest units).
	 */
	function mintTokens(address to, uint256 amount) external nonReentrant onlyOwner() {
		if (to == address(0)) {
			revert InvalidRecipientAddress();
		}
		if (amount == 0) {
			revert AmountMustBeGreaterThanZero();
		}

		_mint(to, amount);
	}

	/**
	 * @notice Allows token holders to burn (destroy) their own tokens.
	 * @dev Burns tokens from the caller's balance, reducing total supply.
	 * @param amount The amount of tokens to burn (in smallest units).
	 */
	function burn(uint256 amount) external nonReentrant {
		if (amount == 0) {
			revert AmountMustBeGreaterThanZero();
		}

		uint256 accountBalance = balanceOf(msg.sender);
		if (accountBalance < amount) {
			revert("Burn amount exceeds balance");
		}

		_burn(msg.sender, amount);
	}
}
